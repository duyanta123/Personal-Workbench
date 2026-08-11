import { supabase } from '../lib/supabase'
import { LIMITS, safeExternalUrlOrNull } from './validation'

export const BACKUP_TABLES = [
  'todos',
  'habits',
  'habit_logs',
  'ledger_entries',
  'goals',
  'notes',
  'practice_problems',
  'workout_sessions',
  'workout_exercises',
  'body_metrics',
  'pomodoro_sessions',
  'user_preferences'
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export interface BackupAvatar {
  mime_type: string
  data_base64: string
  is_active: boolean
  created_at: string
}

export interface BackupV3 {
  metadata: { version: 3; exported_at: string; source_revision: number; source_version?: 1 | 2 | 3 }
  tables: Record<BackupTable, Record<string, unknown>[]>
  avatars: BackupAvatar[]
}

/** Kept as an input-only compatibility shape for callers/tests using V2. */
export interface BackupV2 {
  metadata: { version: 2; exported_at: string }
  tables: BackupV3['tables']
  avatars: BackupAvatar[]
}

const PAGE_SIZE = 500
export const MAX_BACKUP_BYTES = 40 * 1024 * 1024
export const MAX_BACKUP_TABLE_ROWS = 50_000
export const MAX_BACKUP_TOTAL_ROWS = 200_000
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function rows(value: unknown, name: string): Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) throw new Error(`${name} 数据格式错误`)
  return value as Record<string, unknown>[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegative(value: unknown) {
  return isFiniteNumber(value) && value >= 0
}

function isNonNegativeInteger(value: unknown) {
  return isNonNegative(value) && Number.isInteger(value)
}

function validCategories(value: unknown) {
  return isRecord(value) && validTags(value.expense) && validTags(value.income)
}

function validText(value: unknown, max: number, min = 0) {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function validTags(value: unknown): value is string[] {
  return isStringArray(value) && value.length <= LIMITS.tags && value.every((item) => item.length <= LIMITS.tag)
}

function validUrl(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && safeExternalUrlOrNull(value) !== null)
}

function validPomodoro(value: unknown) {
  if (!isRecord(value)) return false
  return [15, 25, 45].includes(Number(value.focus))
    && [5, 10, 15].includes(Number(value.break))
    && [10, 15, 20, 30].includes(Number(value.long_break))
    && [2, 3, 4].includes(Number(value.rounds_per_cycle))
    && [value.focus, value.break, value.long_break, value.rounds_per_cycle].every(isNonNegativeInteger)
}

function withSafeDefaults(table: BackupTable, row: Record<string, unknown>) {
  switch (table) {
    case 'todos': return { level: 'mid', done: false, pinned: false, sort_order: 0, ...row }
    case 'habits': return { emoji: 'flame', pinned: false, ...row }
    case 'goals': return { current: 0, target: 1, pinned: false, ...row }
    case 'notes': return { title: null, tags: [], pinned: false, layout: 'default', image_url: null, ...row }
    case 'practice_problems': return { platform: 'leetcode', difficulty: 'medium', status: 'todo', tags: [], ...row }
    case 'workout_exercises': return { sets: 0, reps: 0, weight: 0, ...row }
    case 'pomodoro_sessions': return { count: 0, minutes: 0, ...row }
    case 'user_preferences': return {
      categories: { expense: [], income: [] },
      monthly_budget: null,
      pomodoro: { focus: 25, break: 5, long_break: 15, rounds_per_cycle: 4 },
      ...row
    }
    default: return row
  }
}

function optional(value: unknown, check: (input: unknown) => boolean) {
  return value === undefined || value === null || check(value)
}

function validRow(table: BackupTable, row: Record<string, unknown>): boolean {
  const id = typeof row.id === 'string' && row.id.length > 0
  switch (table) {
    case 'todos':
      return id && validText(row.text, LIMITS.title, 1) && optional(row.level, (value) => ['high', 'mid', 'low'].includes(String(value))) && optional(row.done, (value) => typeof value === 'boolean')
    case 'habits':
      return id && validText(row.name, LIMITS.short, 1) && optional(row.emoji, (value) => validText(value, LIMITS.short, 1))
    case 'habit_logs':
      return id && typeof row.habit_id === 'string' && typeof row.log_date === 'string'
    case 'ledger_entries':
      return id && (row.kind === 'income' || row.kind === 'expense') && validText(row.category, LIMITS.short, 1)
        && isNonNegative(row.amount) && Number(row.amount) <= 9999999999.99 && typeof row.entry_date === 'string'
        && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'goals':
      return id && validText(row.name, LIMITS.short, 1) && isNonNegative(row.current) && isFiniteNumber(row.target)
        && Number(row.target) > 0 && Number(row.current) <= Number(row.target) && Number(row.target) <= 1e12
        && optional(row.unit, (value) => validText(value, LIMITS.short))
        && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'notes':
      return id && validText(row.body, LIMITS.body, 1) && validTags(row.tags)
        && optional(row.title, (value) => validText(value, LIMITS.title)) && validUrl(row.image_url)
    case 'practice_problems':
      return id && validText(row.title, LIMITS.title, 1) && validText(row.platform, LIMITS.short, 1)
        && ['easy', 'medium', 'hard'].includes(String(row.difficulty))
        && ['todo', 'doing', 'ac_solo', 'ac_hint', 'failed'].includes(String(row.status)) && validTags(row.tags)
        && validUrl(row.url) && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'workout_sessions':
      return id && typeof row.date === 'string' && validText(row.body_part, LIMITS.short, 1)
        && optional(row.duration_min, (value) => isNonNegativeInteger(value) && Number(value) <= 1440)
        && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'workout_exercises':
      return id && typeof row.session_id === 'string' && validText(row.name, LIMITS.short, 1)
        && isNonNegativeInteger(row.sets) && Number(row.sets) <= 10000
        && isNonNegativeInteger(row.reps) && Number(row.reps) <= 10000
        && isNonNegative(row.weight) && Number(row.weight) <= 10000
        && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'body_metrics':
      return id && typeof row.date === 'string'
        && optional(row.weight, (value) => isNonNegative(value) && Number(value) <= 1000)
        && optional(row.body_fat, (value) => isNonNegative(value) && Number(value) <= 100)
        && optional(row.note, (value) => validText(value, LIMITS.body))
    case 'pomodoro_sessions':
      return id && typeof row.date === 'string' && isNonNegativeInteger(row.count) && isNonNegativeInteger(row.minutes)
    case 'user_preferences':
      return typeof row.user_id === 'string' && validCategories(row.categories) && validPomodoro(row.pomodoro)
        && optional(row.monthly_budget, (value) => isFiniteNumber(value) && value > 0 && Number(value) <= 9999999999.99)
  }
}

function validateTables(tables: BackupV3['tables']) {
  let totalRows = 0
  for (const table of BACKUP_TABLES) {
    if (tables[table].length > MAX_BACKUP_TABLE_ROWS) throw new Error(`${table} 数据超过 50,000 行`)
    totalRows += tables[table].length
    if (tables[table].some((row) => !validRow(table, row))) throw new Error(`${table} 数据字段不完整或类型错误`)
    if (table !== 'user_preferences') {
      const ids = tables[table].map((row) => row.id)
      if (new Set(ids).size !== ids.length) throw new Error(`${table} 包含重复 ID`)
    }
  }
  if (totalRows > MAX_BACKUP_TOTAL_ROWS) throw new Error('备份数据总行数超过 200,000 行')
  if (tables.user_preferences.length > 1) throw new Error('user_preferences 只能有一条记录')
  const uniqueBy = (table: BackupTable, field: string, message: string) => {
    const values = tables[table].map((row) => row[field]).filter((value) => value !== undefined && value !== null)
    if (new Set(values).size !== values.length) throw new Error(message)
  }
  uniqueBy('body_metrics', 'date', '身体指标包含重复日期')
  uniqueBy('pomodoro_sessions', 'date', '番茄统计包含重复日期')
  const logKeys = tables.habit_logs.map((row) => `${String(row.habit_id)}:${String(row.log_date)}`)
  if (new Set(logKeys).size !== logKeys.length) throw new Error('习惯打卡包含重复日期')
}

export function normalizeBackup(value: unknown): BackupV3 {
  if (!isRecord(value)) throw new Error('备份文件不是有效对象')
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('备份文件不能超过 40 MiB')
  }
  const metadata = isRecord(value.metadata) ? value.metadata : null
  const version = metadata?.version ?? 1
  if (![1, 2, 3].includes(Number(version))) throw new Error(`不支持的备份版本：${String(version)}`)
  const versioned = Number(version) >= 2
  if (versioned && !isRecord(value.tables)) throw new Error(`BackupV${version} 缺少 tables 对象`)
  const source = versioned ? (value.tables as Record<string, unknown>) : value
  const tables = Object.fromEntries(BACKUP_TABLES.map((name) => [
    name,
    rows(source[name], name).map((row) => withSafeDefaults(name, row))
  ])) as BackupV3['tables']
  const avatars = versioned ? rows(value.avatars, 'avatars').map((avatar) => {
    const mime = avatar.mime_type
    const data = avatar.data_base64
    if (
      typeof mime !== 'string' ||
      !mime.startsWith('image/') ||
      typeof data !== 'string' ||
      data.length === 0 ||
      data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
    ) {
      throw new Error('头像数据格式错误')
    }
    return {
      mime_type: mime,
      data_base64: data,
      is_active: Boolean(avatar.is_active),
      created_at: typeof avatar.created_at === 'string' ? avatar.created_at : new Date().toISOString()
    }
  }) : []
  if (avatars.length > 5) throw new Error('头像数量超过 5 张')
  for (const avatar of avatars) {
    const decodedBytes = Math.floor(avatar.data_base64.length * 3 / 4)
      - (avatar.data_base64.endsWith('==') ? 2 : avatar.data_base64.endsWith('=') ? 1 : 0)
    if (decodedBytes > MAX_AVATAR_BYTES) throw new Error('备份中的头像超过 5 MiB')
  }
  if (avatars.filter((avatar) => avatar.is_active).length > 1) throw new Error('只能有一张激活头像')

  validateTables(tables)

  const habitIds = new Set(tables.habits.map((row) => row.id).filter((id): id is string => typeof id === 'string'))
  if (tables.habit_logs.some((row) => typeof row.habit_id !== 'string' || !habitIds.has(row.habit_id))) {
    throw new Error('打卡记录引用了不存在的习惯')
  }
  const sessionIds = new Set(tables.workout_sessions.map((row) => row.id).filter((id): id is string => typeof id === 'string'))
  if (tables.workout_exercises.some((row) => typeof row.session_id !== 'string' || !sessionIds.has(row.session_id))) {
    throw new Error('训练动作引用了不存在的训练')
  }

  return {
    metadata: {
      version: 3,
      exported_at: versioned && typeof metadata?.exported_at === 'string'
        ? metadata.exported_at
        : new Date().toISOString(),
      source_revision: Number.isSafeInteger(Number(metadata?.source_revision)) && Number(metadata?.source_revision) >= 0
        ? Number(metadata?.source_revision)
        : 0,
      source_version: Number(version) as 1 | 2 | 3
    },
    tables,
    avatars
  }
}

export async function fetchAllTableRows<T extends object>(table: string, orderColumn?: string): Promise<T[]> {
  const sortColumn = orderColumn ?? (table === 'user_preferences' ? 'user_id' : 'id')
  return collectPages(
    async (from) => {
      const { data, error } = await supabase!
        .from(table)
        .select('*')
        .order(sortColumn, { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return (data ?? []) as T[]
    },
    PAGE_SIZE
  )
}

export async function collectPages<T>(
  readPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('分页大小必须为正整数')
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await readPage(from, from + pageSize - 1)
    all.push(...page)
    if (page.length < pageSize) return all
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('头像读取失败'))
    reader.readAsDataURL(blob)
  })
}

export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function createBackupV3(): Promise<BackupV3> {
  const readSyncState = async () => {
    const { data, error } = await supabase!.rpc('get_user_sync_state')
    if (error) throw error
    const value = data as { revision?: unknown; restore_epoch?: unknown } | null
    const revision = Number(value?.revision)
    const restoreEpoch = Number(value?.restore_epoch)
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(restoreEpoch) || restoreEpoch < 0) {
      throw new Error('服务端同步状态无效')
    }
    return { revision, restoreEpoch }
  }

  const started = await readSyncState()
  const tables = Object.fromEntries(await Promise.all(BACKUP_TABLES.map(async (name) => [
    name,
    await fetchAllTableRows<Record<string, unknown>>(name)
  ]))) as BackupV3['tables']
  const { data: avatarData, error: avatarError } = await supabase!
    .from('user_avatars')
    .select('storage_path,is_active,created_at')
    .order('id', { ascending: true })
  if (avatarError) throw avatarError
  const avatarRows = (avatarData ?? []) as {
    storage_path: string
    is_active: boolean
    created_at: string
  }[]
  const avatars: BackupAvatar[] = []
  for (const avatar of avatarRows) {
    if (typeof avatar.storage_path !== 'string') throw new Error('头像清单格式错误')
    const { data, error } = await supabase!.storage.from('avatars').download(avatar.storage_path)
    if (error) throw error
    avatars.push({
      mime_type: data.type || 'image/webp',
      data_base64: await blobToBase64(data),
      is_active: avatar.is_active,
      created_at: avatar.created_at
    })
  }
  const finished = await readSyncState()
  if (finished.revision !== started.revision || finished.restoreEpoch !== started.restoreEpoch) {
    throw new Error('导出期间数据发生变化，请重试')
  }
  const backup = {
    metadata: {
      version: 3 as const,
      exported_at: new Date().toISOString(),
      source_revision: started.revision
    },
    tables,
    avatars
  }
  return normalizeBackup(backup)
}

/** @deprecated Use createBackupV3. */
export const createBackupV2 = createBackupV3

export function backupCounts(backup: BackupV3): Record<string, number> {
  return {
    ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, backup.tables[table].length])),
    avatars: backup.avatars.length
  }
}
