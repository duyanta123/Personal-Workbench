import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { useDeferredDelete } from './useDeferredDelete'
import { useToastStore } from '../stores/toast'

const key = ['items']
interface Item {
  id: string
  name: string
}

function setup(remove: (id: string) => void | Promise<unknown>) {
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
        remove,
        restore: () => {}
      }),
    { wrapper }
  )
  return { qc, result }
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

test('删除失败时恢复缓存中的该项并提示错误', async () => {
  const { qc, result } = setup(() => Promise.reject(new Error('network')))
  await act(async () => {
    result.current.requestDelete({ id: 'a', name: 'A' })
    await Promise.resolve()
    await Promise.resolve()
  })
  // 缓存恢复原状
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a', 'b'])
  // 出现错误提示
  expect(useToastStore.getState().toasts.some((t) => t.kind === 'error')).toBe(true)
})

test('删除成功时保留乐观移除结果，不出现错误提示', async () => {
  const { qc, result } = setup(() => Promise.resolve())
  await act(async () => {
    result.current.requestDelete({ id: 'a', name: 'A' })
    await Promise.resolve()
  })
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['b'])
  expect(useToastStore.getState().toasts.some((t) => t.kind === 'error')).toBe(false)
})

test('并发删除：仅失败的项被恢复，成功删除的项不回滚', async () => {
  const { qc, result } = setup((id) => (id === 'a' ? Promise.reject(new Error('x')) : Promise.resolve()))
  await act(async () => {
    result.current.requestDelete({ id: 'a', name: 'A' })
    result.current.requestDelete({ id: 'b', name: 'B' })
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(qc.getQueryData<Item[]>(key)?.map((i) => i.id)).toEqual(['a'])
})
