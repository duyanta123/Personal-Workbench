import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { WorkbenchCommandV2 } from './commands'
import { replayPendingCommands } from './domainCommands'

vi.mock('./commands', async (importOriginal) => {
  const original = await importOriginal<typeof import('./commands')>()
  return { ...original, enqueueCommand: vi.fn() }
})
vi.mock('./supabase', () => ({ supabase: null }))

function command(input: Partial<WorkbenchCommandV2> & Pick<WorkbenchCommandV2, 'commandId' | 'entityId' | 'kind'>): WorkbenchCommandV2 {
  return {
    version: 2, userId: 'user-1', payload: {}, expected: {}, baseVersion: null,
    restoreEpoch: 1, createdAt: '2026-08-16T00:00:00.000Z', dependsOnCommandIds: [], status: 'pending', attempts: 0,
    ...input
  }
}

describe('offline command projection replay', () => {
  it('rebuilds create, update, and tombstone projections idempotently after reload', () => {
    const client = new QueryClient()
    const key = ['todos', 'user-1', 'page', 0]
    client.setQueryData(key, { items: [
      { id: 'todo-1', text: 'remote', row_version: 2 },
      { id: 'todo-3', text: 'remove me', row_version: 1 }
    ], total: 2 })
    const commands = [
      command({ commandId: 'create', entityId: 'todo-2', kind: 'todo.create', payload: { text: 'offline', level: 'mid' } }),
      command({ commandId: 'update', entityId: 'todo-1', kind: 'todo.update', payload: { text: 'local' }, baseVersion: 2 }),
      command({ commandId: 'delete', entityId: 'todo-3', kind: 'todo.delete', baseVersion: 1 })
    ]
    replayPendingCommands(client, commands)
    replayPendingCommands(client, commands)
    const data = client.getQueryData<{ items: Array<Record<string, unknown>>; total: number }>(key)!
    expect(data.items.map((item) => item.id)).toEqual(['todo-2', 'todo-1'])
    expect(data.items.find((item) => item.id === 'todo-1')).toMatchObject({ text: 'local', _local_pending: true })
    expect(data.items.find((item) => item.id === 'todo-2')).toMatchObject({ text: 'offline', _local_pending: true })
    expect(data.total).toBe(2)
  })

  it('does not leak an offline create into incompatible saved-view caches', () => {
    const client = new QueryClient()
    const expenseKey = ['ledger_entries', 'user-1', 'page', 0, '', { kind: 'expense' }, { column: 'entry_date', direction: 'desc' }, '']
    const incomeKey = ['ledger_entries', 'user-1', 'page', 0, '', { kind: 'income' }, { column: 'entry_date', direction: 'desc' }, '']
    client.setQueryData(expenseKey, { items: [], total: 0 })
    client.setQueryData(incomeKey, { items: [], total: 0 })
    replayPendingCommands(client, [command({
      commandId: 'ledger-create', entityId: 'ledger-1', kind: 'ledger.create',
      payload: { kind: 'expense', category: '餐饮', amount_minor: 4500, entry_date: '2026-08-16', status: 'posted' }
    })])
    expect(client.getQueryData<{ items: unknown[] }>(expenseKey)?.items).toHaveLength(1)
    expect(client.getQueryData<{ items: unknown[] }>(incomeKey)?.items).toHaveLength(0)
  })

  it('moves an offline update between matching saved-view caches', () => {
    const client = new QueryClient()
    const expenseKey = ['ledger_entries', 'user-1', 'page', 0, '', { kind: 'expense' }, { column: 'entry_date', direction: 'desc' }, '']
    const incomeKey = ['ledger_entries', 'user-1', 'page', 0, '', { kind: 'income' }, { column: 'entry_date', direction: 'desc' }, '']
    const row = { id: 'ledger-1', kind: 'expense', category: '调整', amount_minor: 100, entry_date: '2026-08-16', status: 'posted', row_version: 1 }
    client.setQueryData(expenseKey, { items: [row], total: 1 })
    client.setQueryData(incomeKey, { items: [], total: 0 })
    replayPendingCommands(client, [command({ commandId: 'change-kind', entityId: 'ledger-1', kind: 'ledger.update', payload: { kind: 'income' }, baseVersion: 1 })])
    expect(client.getQueryData<{ items: unknown[]; total: number }>(expenseKey)).toMatchObject({ items: [], total: 0 })
    expect(client.getQueryData<{ items: Array<Record<string, unknown>>; total: number }>(incomeKey)).toMatchObject({ items: [expect.objectContaining({ id: 'ledger-1', kind: 'income' })], total: 1 })
  })
})
