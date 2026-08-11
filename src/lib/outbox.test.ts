import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  values: new Map<string, unknown>()
}))

vi.mock('./supabase', () => ({
  supabase: { rpc: mocks.rpc }
}))

vi.mock('./localData', () => {
  const localKeys = {
    queryCache: 'query-cache:v1',
    syncState: 'sync-state:v1',
    outboxPrefix: 'outbox:v1:',
    avatar: (path: string) => `avatar:v1:${path}`
  }
  const storageKey = (userId: string, key: string) => `${userId}:${key}`
  return {
    localKeys,
    getLocalValue: vi.fn((userId: string, key: string) => Promise.resolve(mocks.values.get(storageKey(userId, key)))),
    setLocalValue: vi.fn((userId: string, key: string, value: unknown) => {
      mocks.values.set(storageKey(userId, key), value)
      return Promise.resolve()
    }),
    deleteLocalValue: vi.fn((userId: string, key: string) => {
      mocks.values.delete(storageKey(userId, key))
      return Promise.resolve()
    }),
    listLocalValues: vi.fn((userId: string, prefix: string) => {
      const userPrefix = `${userId}:${prefix}`
      return Promise.resolve([...mocks.values.entries()]
        .filter(([key]) => key.startsWith(userPrefix))
        .map(([key, value]) => ({ key: key.slice(userId.length + 1), value })))
    })
  }
})

import { enqueueOperation, flushOutbox, pendingOperationCount } from './outbox'

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online })
}

describe('outbox', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.values.clear()
    setOnline(true)
  })

  test('uses the caller operation id and current restore epoch', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { revision: 4, restore_epoch: 7 }, error: null })
      .mockResolvedValueOnce({ data: { id: 'todo-1' }, error: null })

    const result = await enqueueOperation(
      'user-1',
      'todo.create',
      { text: 'ship', level: 'high' },
      'operation-fixed'
    )

    expect(result).toEqual({ status: 'applied', operationId: 'operation-fixed', data: { id: 'todo-1' } })
    expect(mocks.rpc).toHaveBeenLastCalledWith('apply_workbench_operation', {
      p_operation_id: 'operation-fixed',
      p_restore_epoch: 7,
      p_kind: 'todo.create',
      p_payload: { text: 'ship', level: 'high' }
    })
    expect(await pendingOperationCount('user-1')).toBe(0)
  })

  test('replays a timed-out operation with the same id exactly once locally', async () => {
    let applyAttempts = 0
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'get_user_sync_state') {
        return Promise.resolve({ data: { revision: 4, restore_epoch: 7 }, error: null })
      }
      applyAttempts++
      return Promise.resolve(applyAttempts === 1
        ? { data: null, error: new TypeError('Failed to fetch') }
        : { data: { id: 'todo-1' }, error: null })
    })

    const queued = await enqueueOperation(
      'user-1',
      'todo.create',
      { text: 'ship', level: 'mid' },
      'operation-retry'
    )
    expect(queued.status).toBe('queued')
    expect(await pendingOperationCount('user-1')).toBe(1)

    await expect(flushOutbox('user-1')).resolves.toEqual({ applied: 1, stale: 0, pending: 0 })
    const applyCalls = mocks.rpc.mock.calls.filter(([name]) => name === 'apply_workbench_operation')
    expect(applyCalls).toHaveLength(2)
    expect(applyCalls.map(([, args]) => args.p_operation_id)).toEqual(['operation-retry', 'operation-retry'])
  })

  test('drops operations queued before a restore instead of replaying them', async () => {
    setOnline(false)
    mocks.values.set('user-1:sync-state:v1', { revision: 4, restore_epoch: 7 })
    await enqueueOperation(
      'user-1',
      'goal.adjust',
      { goal_id: 'goal-1', delta: 1 },
      'operation-stale'
    )

    setOnline(true)
    mocks.rpc.mockResolvedValue({ data: { revision: 5, restore_epoch: 8 }, error: null })
    await expect(flushOutbox('user-1')).resolves.toEqual({ applied: 0, stale: 1, pending: 0 })
    expect(mocks.rpc).not.toHaveBeenCalledWith('apply_workbench_operation', expect.anything())
  })
})
