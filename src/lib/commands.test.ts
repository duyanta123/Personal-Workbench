import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  values: new Map<string, unknown>(),
  syncState: { revision: 1, restore_epoch: 7 }
}))

vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('./outbox', () => ({
  getCachedSyncState: vi.fn(() => Promise.resolve({ ...mocks.syncState })),
  refreshSyncState: vi.fn(() => Promise.resolve({ ...mocks.syncState })),
  isNetworkError: (error: unknown) => /network|fetch|offline/i.test(error instanceof Error ? error.message : String(error))
}))
vi.mock('./localData', () => {
  const localKeys = {
    commandPrefix: 'command:v2:', syncHistoryPrefix: 'sync-history:v2:', syncMetadata: 'sync-metadata:v2'
  }
  const storageKey = (userId: string, key: string) => `${userId}:${key}`
  return {
    localKeys,
    getLocalValue: vi.fn((userId: string, key: string) => Promise.resolve(mocks.values.get(storageKey(userId, key)))),
    setLocalValue: vi.fn((userId: string, key: string, value: unknown) => { mocks.values.set(storageKey(userId, key), value); return Promise.resolve() }),
    deleteLocalValue: vi.fn((userId: string, key: string) => { mocks.values.delete(storageKey(userId, key)); return Promise.resolve() }),
    listLocalValues: vi.fn((userId: string, prefix: string) => {
      const match = `${userId}:${prefix}`
      return Promise.resolve([...mocks.values.entries()].filter(([key]) => key.startsWith(match)).map(([key, value]) => ({ key: key.slice(userId.length + 1), value })))
    })
  }
})

import { enqueueCommand, flushCommands, listCommands } from './commands'

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online })
}

describe('WorkbenchCommandV2 outbox', () => {
  beforeEach(() => {
    mocks.values.clear()
    mocks.rpc.mockReset()
    mocks.syncState.revision = 1
    mocks.syncState.restore_epoch = 7
    setOnline(false)
  })

  it('folds edits into an unsynced create while preserving its idempotency key', async () => {
    await enqueueCommand('user-1', { kind: 'todo.create', commandId: 'command-create', entityId: 'todo-1', payload: { text: 'draft', level: 'mid' } })
    const result = await enqueueCommand('user-1', { kind: 'todo.update', commandId: 'command-edit', entityId: 'todo-1', payload: { text: 'final' }, expected: { text: 'draft' }, baseVersion: 1 })
    const commands = await listCommands('user-1')
    expect(result).toMatchObject({ status: 'queued', commandId: 'command-create', entityId: 'todo-1' })
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ commandId: 'command-create', kind: 'todo.create', payload: { text: 'final', level: 'mid' } })
  })

  it('cancels an unsynced create and all dependent child creates', async () => {
    await enqueueCommand('user-1', { kind: 'workout_session.create', commandId: 'parent', entityId: 'session-1', payload: { date: '2026-08-16', body_part: 'leg' } })
    await enqueueCommand('user-1', { kind: 'workout_exercise.create', commandId: 'child', entityId: 'exercise-1', payload: { session_id: 'session-1', name: 'squat' }, dependsOnCommandIds: ['parent'] })
    await enqueueCommand('user-1', { kind: 'workout_session.delete', commandId: 'delete', entityId: 'session-1', baseVersion: 1 })
    expect(await listCommands('user-1')).toEqual([])
  })

  it('merges consecutive patches and retains the oldest expected value per field', async () => {
    await enqueueCommand('user-1', { kind: 'goal.update', commandId: 'first', entityId: 'goal-1', payload: { name: 'B' }, expected: { name: 'A' }, baseVersion: 1 })
    await enqueueCommand('user-1', { kind: 'goal.update', commandId: 'second', entityId: 'goal-1', payload: { name: 'C', note: 'new' }, expected: { name: 'B', note: null }, baseVersion: 1 })
    const [command] = await listCommands('user-1')
    expect(command).toMatchObject({ commandId: 'first', payload: { name: 'C', note: 'new' }, expected: { name: 'A', note: null } })
  })

  it('keeps pre-restore commands as visible stale records instead of deleting them', async () => {
    await enqueueCommand('user-1', { kind: 'note.create', commandId: 'stale-command', entityId: 'note-1', payload: { body: 'offline' } })
    mocks.syncState.restore_epoch = 8
    setOnline(true)
    await expect(flushCommands('user-1')).resolves.toMatchObject({ stale: 1, applied: 0 })
    const [command] = await listCommands('user-1')
    expect(command).toMatchObject({ commandId: 'stale-command', status: 'stale', result: { status: 'stale_restore' } })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
