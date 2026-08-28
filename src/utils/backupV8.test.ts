import { describe, expect, test, vi } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import { strToU8, zipSync } from 'fflate'
import {
  estimateV8ExportBytes,
  inspectBackupV8,
  isMobileSafari,
  V8_MAX_TABLE_ROWS,
  V8_SAFARI_FULL_EXPORT_BYTES
} from './backupV8'

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function archive(manifest: Record<string, unknown>, files: Record<string, string> = {}) {
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest))
  }
  for (const [path, value] of Object.entries(files)) entries[path] = strToU8(value)
  const bytes = zipSync(entries)
  // jsdom's Blob does not expose Blob.stream(); provide the same readable
  // contract used by browsers so these tests exercise the incremental parser.
  return {
    stream: () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    })
  } as unknown as Blob
}

function tableMeta(table: string, content: string, rows = 1) {
  return {
    path: `tables/${table}.ndjson`,
    rows,
    sha256: hex(sha256(strToU8(content)))
  }
}

describe('backup V8 archive validation', () => {
  test('inspects a partial module archive without materializing table contents', async () => {
    const content = '{"id":"todo-1"}\n'
    const manifest = {
      version: 8,
      exported_at: '2026-08-22T00:00:00.000Z',
      source_revision: 4,
      restore_epoch: 2,
      scope: { kind: 'module', value: 'todo' },
      tables: {
        todos: tableMeta('todos', content),
        recurrence_rules: tableMeta('recurrence_rules', '' , 0),
        todo_status_history: tableMeta('todo_status_history', '', 0),
        inbox_items: tableMeta('inbox_items', '', 0)
      },
      avatars: []
    }

    const inspected = await inspectBackupV8(archive(manifest, { 'tables/todos.ndjson': content }))
    expect(inspected).toMatchObject({ version: 8, scope: { kind: 'module', value: 'todo' } })
    expect(inspected.tables.todos.rows).toBe(1)
  })

  test('rejects unknown table paths and oversized table declarations', async () => {
    const unknown = {
      version: 8,
      exported_at: '2026-08-22T00:00:00.000Z',
      source_revision: 0,
      restore_epoch: 0,
      tables: { secrets: { path: 'tables/secrets.ndjson', rows: 1, sha256: '0'.repeat(64) } },
      avatars: []
    }
    await expect(inspectBackupV8(archive(unknown))).rejects.toThrow('未知数据表')

    const oversized = {
      version: 8,
      exported_at: '2026-08-22T00:00:00.000Z',
      source_revision: 0,
      restore_epoch: 0,
      tables: { todos: { path: 'tables/todos.ndjson', rows: V8_MAX_TABLE_ROWS + 1, sha256: '0'.repeat(64) } },
      avatars: []
    }
    await expect(inspectBackupV8(archive(oversized))).rejects.toThrow('500,000')

    const mismatchedModule = {
      version: 8,
      exported_at: '2026-08-22T00:00:00.000Z',
      source_revision: 0,
      restore_epoch: 0,
      scope: { kind: 'module', value: 'todo' },
      tables: { habits: tableMeta('habits', '') },
      avatars: []
    }
    await expect(inspectBackupV8(archive(mismatchedModule))).rejects.toThrow('模块清单')

    const invalidYear = { ...mismatchedModule, scope: { kind: 'year', value: '26' }, tables: {} }
    await expect(inspectBackupV8(archive(invalidYear))).rejects.toThrow('四位年份')
  })

  test('keeps the mobile Safari full-export guard at 64 MiB', () => {
    const original = navigator.userAgent
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    expect(isMobileSafari()).toBe(true)
    expect(estimateV8ExportBytes(65_000)).toBeLessThan(V8_SAFARI_FULL_EXPORT_BYTES)
    expect(estimateV8ExportBytes(70_000)).toBeGreaterThan(V8_SAFARI_FULL_EXPORT_BYTES)
    vi.stubGlobal('navigator', { userAgent: original })
  })
})
