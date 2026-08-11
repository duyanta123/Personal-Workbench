import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cancelAllPendingDeletes, useDeferredDelete } from './useDeferredDelete'
import { useToastStore } from '../stores/toast'

const key = ['items']
interface Item {
  id: string
  name: string
}

function setup(remove: (id: string) => Promise<unknown>) {
  const qc = new QueryClient()
  qc.setQueryData<Item[]>(key, [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' }
  ])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () =>
      useDeferredDelete<Item>({
        key,
        label: (i) => i.name,
        remove
      }),
    { wrapper }
  )
  return { qc, result }
}

beforeEach(() => {
  vi.useFakeTimers()
  act(() => cancelAllPendingDeletes())
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  act(() => cancelAllPendingDeletes())
  vi.useRealTimers()
})

test('删除失败时恢复缓存中的该项并提示错误', async () => {
  const { qc, result } = setup(() => Promise.reject(new Error('network')))
  await act(async () => {
    result.current.requestDelete({ id: 'a', name: 'A' })
    await vi.advanceTimersByTimeAsync(5000)
  })
  // 缓存恢复原状
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a', 'b'])
  // 出现错误提示
  expect(useToastStore.getState().toasts.some((t) => t.kind === 'error')).toBe(true)
})

test('撤销窗口内保留原行，成功后才移除', async () => {
  const { qc, result } = setup(() => Promise.resolve())
  act(() => result.current.requestDelete({ id: 'a', name: 'A' }))
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a', 'b'])
  expect(result.current.isPending('a')).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['b'])
  expect(useToastStore.getState().toasts.some((t) => t.kind === 'error')).toBe(false)
})

test('并发删除：仅失败的项被恢复，成功删除的项不回滚', async () => {
  const { qc, result } = setup((id) => (id === 'a' ? Promise.reject(new Error('x')) : Promise.resolve()))
  await act(async () => {
    result.current.requestDelete({ id: 'a', name: 'A' })
    result.current.requestDelete({ id: 'b', name: 'B' })
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a'])
})

test('撤销时取消实际删除且原行从未隐藏', async () => {
  const remove = vi.fn(() => Promise.resolve())
  const { qc, result } = setup(remove)
  act(() => result.current.requestDelete({ id: 'a', name: 'A' }))
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a', 'b'])
  act(() => useToastStore.getState().toasts[0].onAction?.())
  await vi.advanceTimersByTimeAsync(5000)
  expect(remove).not.toHaveBeenCalled()
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a', 'b'])
})
