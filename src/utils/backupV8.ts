import { sha256 } from '@noble/hashes/sha2.js'
import { strFromU8, strToU8, Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate'
import { supabase } from '../lib/supabase'
import type { Json } from '../lib/database.types'
import { backupV8ManifestSchema } from '../lib/runtimeSchemas'
import { compressImage } from './avatar'
import { BACKUP_TABLES, MAX_AVATAR_BYTES, type BackupTable, isValidBackupRow } from './backup'

const PAGE_SIZE = 500
const TARGET_CHUNK_BYTES = 900 * 1024
export const V8_MAX_TABLE_ROWS = 500_000
export const V8_MAX_TOTAL_ROWS = 2_000_000
export const V8_SAFARI_FULL_EXPORT_BYTES = 64 * 1024 * 1024

export interface BackupV8Manifest {
  version: 8
  exported_at: string
  source_revision: number
  restore_epoch: number
  scope?: { kind: 'full' | 'module' | 'year'; value?: string }
  tables: Record<string, { path: string; rows: number; sha256: string }>
  avatars: Array<{ path: string; mime_type: string; is_active: boolean; created_at: string; sha256: string }>
}

export interface BackupV8RestoreInput {
  kind: 'v8'
  file: Blob
  manifest: BackupV8Manifest
}

export interface BackupV8ExportOptions {
  scope?: { kind: 'full' | 'module' | 'year'; value?: string }
}

export const V8_MODULE_OPTIONS = [
  { value: 'todo', label: '待办与周期', tables: ['todos', 'recurrence_rules', 'todo_status_history', 'inbox_items'] },
  { value: 'habit', label: '习惯', tables: ['habits', 'habit_logs'] },
  { value: 'ledger', label: '记账', tables: ['ledger_entries', 'ledger_accounts', 'ledger_payees', 'ledger_rules', 'ledger_splits', 'ledger_reconciliations'] },
  { value: 'journal', label: '目标、笔记与练习', tables: ['goals', 'notes', 'practice_problems', 'entity_links', 'workbench_templates', 'saved_views'] },
  { value: 'wellness', label: '训练与番茄', tables: ['workout_sessions', 'workout_exercises', 'body_metrics', 'pomodoro_sessions'] },
  { value: 'preferences', label: '偏好', tables: ['user_preferences'] }
] as const

const dateColumns: Partial<Record<BackupTable, string>> = {
  todos: 'due_date', habit_logs: 'log_date', ledger_entries: 'entry_date', goals: 'deadline', notes: 'created_at',
  practice_problems: 'created_at', workout_sessions: 'date', body_metrics: 'date', pomodoro_sessions: 'date',
  inbox_items: 'created_at', recurrence_rules: 'start_date', todo_status_history: 'created_at'
}

export interface StagedBackupV8 {
  stagedPaths: string[]
  avatarRows: Array<{ path: string; is_active: boolean; created_at: string }>
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function syncState() {
  const { data, error } = await supabase!.rpc('get_user_sync_state')
  if (error) throw error
  const value = data as { revision?: unknown; restore_epoch?: unknown } | null
  const revision = Number(value?.revision)
  const restoreEpoch = Number(value?.restore_epoch)
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(restoreEpoch) || restoreEpoch < 0) throw new Error('服务端同步状态无效')
  return { revision, restoreEpoch }
}

async function addTextEntry(zip: Zip, path: string, read: (push: (bytes: Uint8Array) => void) => Promise<{ rows: number }>) {
  const entry = new ZipDeflate(path, { level: 6 })
  zip.add(entry)
  const hash = sha256.create()
  const push = (bytes: Uint8Array) => { hash.update(bytes); entry.push(bytes) }
  const result = await read(push)
  entry.push(new Uint8Array(), true)
  return { ...result, sha256: hex(hash.digest()) }
}

async function streamTable(zip: Zip, table: string, scope: BackupV8ExportOptions['scope']) {
  return addTextEntry(zip, `tables/${table}.ndjson`, async (push) => {
    let rows = 0
    const sortColumn = table === 'user_preferences' ? 'user_id' : 'id'
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase!.from(table).select('*').order(sortColumn, { ascending: true })
      if (scope?.kind === 'year') {
        const column = dateColumns[table as BackupTable]
        if (column) query = query.gte(column, `${scope.value}-01-01`).lt(column, `${Number(scope.value) + 1}-01-01`)
      }
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (data ?? []) as Record<string, unknown>[]
      if (!page.length) break
      for (const row of page) { push(strToU8(`${JSON.stringify(row)}\n`)); rows++ }
      if (page.length < PAGE_SIZE) break
    }
    return { rows }
  })
}

export function createBackupV8Stream(options: BackupV8ExportOptions = {}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const started = await syncState()
        const zip = new Zip((error, chunk, final) => {
          if (error) { controller.error(error); return }
          controller.enqueue(chunk)
          if (final) controller.close()
        })
        const scope = options.scope ?? { kind: 'full' as const }
        if (scope.kind === 'year' && !/^\d{4}$/.test(scope.value ?? '')) throw new Error('年份导出需要四位年份')
        const selected = scope.kind === 'module'
          ? V8_MODULE_OPTIONS.find((option) => option.value === scope.value)?.tables ?? []
          : BACKUP_TABLES
        if (!selected.length) throw new Error('未选择有效的数据模块')
        const manifest: BackupV8Manifest = {
          version: 8,
          exported_at: new Date().toISOString(),
          source_revision: started.revision,
          restore_epoch: started.restoreEpoch,
          scope,
          tables: {},
          avatars: []
        }
        for (const table of selected) {
          const result = await streamTable(zip, table, scope)
          manifest.tables[table] = { path: `tables/${table}.ndjson`, rows: result.rows, sha256: result.sha256 }
        }
        const { data: avatarRows, error: avatarError } = scope.kind === 'full'
          ? await supabase!.from('user_avatars').select('storage_path,is_active,created_at').order('id', { ascending: true })
          : { data: [], error: null }
        if (avatarError) throw avatarError
        for (let index = 0; index < (avatarRows ?? []).length; index++) {
          const avatar = avatarRows![index] as { storage_path: string; is_active: boolean; created_at: string }
          const downloaded = await supabase!.storage.from('avatars').download(avatar.storage_path)
          if (downloaded.error) throw downloaded.error
          const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
          const path = `avatars/${index}.webp`
          const entry = new ZipDeflate(path, { level: 6 }); zip.add(entry); entry.push(bytes, true)
          manifest.avatars.push({ path, mime_type: downloaded.data.type || 'image/webp', is_active: avatar.is_active, created_at: avatar.created_at, sha256: hex(sha256(bytes)) })
        }
        const finished = await syncState()
        if (finished.revision !== started.revision || finished.restoreEpoch !== started.restoreEpoch) throw new Error('导出期间数据发生变化，请重试')
        const manifestEntry = new ZipDeflate('manifest.json', { level: 6 }); zip.add(manifestEntry)
        manifestEntry.push(strToU8(JSON.stringify(manifest)), true)
        zip.end()
      })().catch((error) => controller.error(error))
    }
  })
}

export async function writeBackupV8(
  stream: ReadableStream<Uint8Array>,
  filename: string,
  options: { enforceMobileSafariLimit?: boolean } = {}
) {
  const enforceMobileSafariLimit = options.enforceMobileSafariLimit ?? true
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable: () => Promise<FileSystemWritableFileStream> }> }).showSaveFilePicker
  if (picker) {
    const handle = await picker({ suggestedName: filename, types: [{ description: 'Workbench V8', accept: { 'application/zip': ['.workbench.zip'] } }] })
    const writer = await handle.createWritable()
    const reader = stream.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        await writer.write(next.value)
      }
      await writer.close()
    } catch (error) {
      await writer.abort()
      throw error
    }
    return
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (enforceMobileSafariLimit && isMobileSafari() && total > V8_SAFARI_FULL_EXPORT_BYTES) throw new Error('移动 Safari 全量备份超过 64 MiB，请改用桌面端或按模块导出')
    chunks.push(next.value)
  }
  const blob = new Blob(chunks, { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export function isMobileSafari() {
  const agent = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)
}

function validateManifest(value: unknown, allowPartial = false) {
  const manifest = backupV8ManifestSchema.parse(value) as BackupV8Manifest
  const scope = manifest.scope ?? { kind: 'full' as const }
  if (scope.kind === 'year' && !/^\d{4}$/.test(scope.value ?? '')) throw new Error('年份导出需要四位年份')
  if (scope.kind === 'module') {
    const option = V8_MODULE_OPTIONS.find((item) => item.value === scope.value)
    if (!option) throw new Error('未选择有效的数据模块')
    const expectedTables = [...option.tables].sort().join(',')
    const actualTables = Object.keys(manifest.tables).sort().join(',')
    if (expectedTables !== actualTables) throw new Error('V8 模块清单与导出范围不一致')
  }
  if (!allowPartial && (manifest.scope?.kind ?? 'full') !== 'full') throw new Error('分范围导出仅用于查阅，不能执行全量恢复')
  let total = 0
  const paths = new Set<string>()
  const selectedTables = Object.keys(manifest.tables)
  for (const table of selectedTables) {
    if (!BACKUP_TABLES.includes(table as BackupTable)) throw new Error(`V8 清单包含未知数据表：${table}`)
    const meta = manifest.tables[table]
    if (!meta || meta.path !== `tables/${table}.ndjson`) throw new Error(`V8 清单路径无效：${table}`)
    if (meta.rows > V8_MAX_TABLE_ROWS) throw new Error(`${table} 数据超过 ${V8_MAX_TABLE_ROWS.toLocaleString()} 行`)
    if (paths.has(meta.path)) throw new Error('V8 清单包含重复路径')
    paths.add(meta.path)
    total += meta.rows
  }
  if (!allowPartial && selectedTables.length !== BACKUP_TABLES.length) throw new Error('V8 清单缺少数据表')
  if (total > V8_MAX_TOTAL_ROWS) throw new Error(`备份数据总行数超过 ${V8_MAX_TOTAL_ROWS.toLocaleString()} 行`)
  if (manifest.avatars.length > 5 || manifest.avatars.filter((avatar) => avatar.is_active).length > 1) throw new Error('V8 头像清单无效')
  for (const avatar of manifest.avatars) {
    if (!avatar.path.startsWith('avatars/') || paths.has(avatar.path)) throw new Error('V8 头像路径无效或重复')
    paths.add(avatar.path)
  }
  return manifest
}

export async function inspectBackupV8(blob: Blob): Promise<BackupV8Manifest> {
  const chunks: Uint8Array[] = []
  let manifestBytes = 0
  let seen = false
  let failure: Error | null = null
  const unzip = new Unzip((file) => {
    if (file.name === 'manifest.json') {
      if (seen) { failure = new Error('V8 包含重复清单'); return }
      seen = true
      file.ondata = (error, chunk) => {
        if (error) { failure = asError(error); return }
        manifestBytes += chunk.byteLength
        if (manifestBytes > 1024 * 1024) { failure = new Error('V8 清单过大'); return }
        chunks.push(chunk)
      }
    } else {
      file.ondata = (error) => { if (error) failure = asError(error) }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  const reader = blob.stream().getReader()
  while (true) {
    const next = await reader.read()
    unzip.push(next.value ?? new Uint8Array(), Boolean(next.done))
    if (failure) throw failure
    if (next.done) break
  }
  if (!seen) throw new Error('V8 备份缺少 manifest.json')
  const bytes = new Uint8Array(manifestBytes)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return validateManifest(JSON.parse(strFromU8(bytes)), true)
}

interface TableStreamState {
  table: BackupTable
  decoder: TextDecoder
  pending: string
  hash: ReturnType<typeof sha256.create>
  rows: number
  chunkRows: Record<string, unknown>[]
  chunkBytes: number
  chunkIndex: number
}

export async function stageBackupV8(
  input: BackupV8RestoreInput,
  restoreId: string,
  userId: string,
  result: StagedBackupV8 = { stagedPaths: [], avatarRows: [] }
): Promise<StagedBackupV8> {
  const manifest = validateManifest(input.manifest)
  const tableByPath = new Map(Object.keys(manifest.tables).map((table) => [manifest.tables[table].path, table as BackupTable]))
  const avatarByPath = new Map(manifest.avatars.map((avatar) => [avatar.path, avatar]))
  const seen = new Set<string>()
  const manifestBytes: Uint8Array[] = []
  let manifestSeen = false
  const states = new Map<BackupTable, TableStreamState>()
  const { stagedPaths, avatarRows } = result
  const encoder = new TextEncoder()
  let failure: Error | null = null
  let tasks = Promise.resolve()

  const enqueue = (task: () => Promise<void>) => { tasks = tasks.then(task) }
  const flushRows = (state: TableStreamState) => {
    if (!state.chunkRows.length) return
    const rows = state.chunkRows
    const chunkIndex = state.chunkIndex++
    state.chunkRows = []
    state.chunkBytes = 2
    enqueue(async () => {
      const staged = await supabase!.rpc('stage_restore_chunk', {
        p_restore_id: restoreId,
        p_table: state.table,
        p_chunk_index: chunkIndex,
        p_rows: rows as unknown as Json
      })
      if (staged.error) throw staged.error
    })
  }
  const addLine = (state: TableStreamState, line: string) => {
    if (!line.trim()) return
    const value: unknown = JSON.parse(line)
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isValidBackupRow(state.table, value as Record<string, unknown>)) {
      throw new Error(`${state.table} 数据字段不完整或类型错误`)
    }
    const row = value as Record<string, unknown>
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength + (state.chunkRows.length ? 1 : 0)
    if (rowBytes + 2 > TARGET_CHUNK_BYTES) throw new Error(`${state.table} 包含超过分块限制的单行数据`)
    if (state.chunkRows.length >= PAGE_SIZE || state.chunkBytes + rowBytes > TARGET_CHUNK_BYTES) flushRows(state)
    state.chunkRows.push(row)
    state.chunkBytes += rowBytes
    state.rows++
  }

  const unzip = new Unzip((file) => {
    try {
      if (file.name === 'manifest.json') {
        if (manifestSeen) throw new Error('V8 包含重复清单')
        manifestSeen = true
        let bytes = 0
        file.ondata = (error, chunk, final) => {
          if (failure) return
          try {
            if (error) throw error
            bytes += chunk.byteLength
            if (bytes > 1024 * 1024) throw new Error('V8 清单过大')
            manifestBytes.push(chunk)
            if (final) {
              const total = new Uint8Array(bytes)
              let offset = 0
              for (const part of manifestBytes) { total.set(part, offset); offset += part.byteLength }
              const archiveManifest = validateManifest(JSON.parse(strFromU8(total)))
              if (canonicalJson(archiveManifest) !== canonicalJson(manifest)) throw new Error('V8 清单与导入文件不一致')
            }
          } catch (error_) { failure = asError(error_) }
        }
      } else if (tableByPath.has(file.name)) {
        if (seen.has(file.name)) throw new Error(`V8 包含重复文件：${file.name}`)
        seen.add(file.name)
        const table = tableByPath.get(file.name)!
        const state: TableStreamState = {
          table, decoder: new TextDecoder(), pending: '', hash: sha256.create(), rows: 0,
          chunkRows: [], chunkBytes: 2, chunkIndex: 0
        }
        states.set(table, state)
        file.ondata = (error, chunk, final) => {
          if (failure) return
          try {
            if (error) throw error
            state.hash.update(chunk)
            state.pending += state.decoder.decode(chunk, { stream: !final })
            const lines = state.pending.split('\n')
            state.pending = lines.pop() ?? ''
            for (const line of lines) addLine(state, line)
            if (final) {
              if (state.pending.trim()) addLine(state, state.pending)
              state.pending = ''
              flushRows(state)
              enqueue(async () => {
                const expected = manifest.tables[table]
                if (state.rows !== expected.rows) throw new Error(`${table} 行数不匹配`)
                if (hex(state.hash.digest()) !== expected.sha256) throw new Error(`${table} 校验和不匹配`)
              })
            }
          } catch (error_) { failure = asError(error_) }
        }
      } else if (avatarByPath.has(file.name)) {
        if (seen.has(file.name)) throw new Error(`V8 包含重复文件：${file.name}`)
        seen.add(file.name)
        const meta = avatarByPath.get(file.name)!
        const chunks: Uint8Array[] = []
        const hash = sha256.create()
        let bytes = 0
        file.ondata = (error, chunk, final) => {
          if (failure) return
          try {
            if (error) throw error
            bytes += chunk.byteLength
            if (bytes > MAX_AVATAR_BYTES) throw new Error('V8 头像超过 5 MiB')
            hash.update(chunk)
            chunks.push(chunk)
            if (final) enqueue(async () => {
              if (hex(hash.digest()) !== meta.sha256) throw new Error(`头像校验和不匹配：${meta.path}`)
              const blob = new Blob(chunks, { type: meta.mime_type })
              const webp = await compressImage(new File([blob], 'avatar', { type: meta.mime_type }))
              if (webp.size > MAX_AVATAR_BYTES) throw new Error('压缩后的头像超过 5 MiB')
              const path = `${userId}/restore-${restoreId}-${crypto.randomUUID()}.webp`
              const uploaded = await supabase!.storage.from('avatars').upload(path, webp, { contentType: 'image/webp', upsert: false })
              if (uploaded.error) throw uploaded.error
              stagedPaths.push(path)
              avatarRows.push({ path, is_active: meta.is_active, created_at: meta.created_at })
            })
          } catch (error_) { failure = asError(error_) }
        }
      } else {
        throw new Error(`V8 包含清单外文件：${file.name}`)
      }
      file.start()
    } catch (error) { failure = asError(error) }
  })
  unzip.register(UnzipInflate)
  const reader = input.file.stream().getReader()
  while (true) {
    const next = await reader.read()
    unzip.push(next.value ?? new Uint8Array(), Boolean(next.done))
    if (failure) throw failure
    await tasks
    if (next.done) break
  }
  await tasks
  if (!manifestSeen) throw new Error('V8 备份缺少 manifest.json')
  for (const table of Object.keys(manifest.tables)) if (!seen.has(manifest.tables[table].path)) throw new Error(`V8 缺少 ${table} 数据文件`)
  for (const avatar of manifest.avatars) if (!seen.has(avatar.path)) throw new Error(`V8 缺少头像文件：${avatar.path}`)
  return result
}

export function estimateV8ExportBytes(totalRows: number, avatarBytes = 0) {
  // Conservative preflight estimate: NDJSON and ZIP metadata usually compress below this;
  // over-estimating is intentional so mobile Safari never starts an unsafe full export.
  return Math.max(0, Math.ceil(totalRows)) * 1024 + Math.max(0, avatarBytes) + 64 * 1024
}
