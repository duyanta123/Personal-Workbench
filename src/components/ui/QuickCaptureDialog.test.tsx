import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../../stores/ui'
import QuickCaptureDialog from './QuickCaptureDialog'

const mocks = vi.hoisted(() => ({
  canWrite: true,
  submit: vi.fn(),
  push: vi.fn()
}))
const preferences = { categories: { expense: [] as string[], income: [] as string[] } }

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userId: 'u1', canWrite: mocks.canWrite }) }))
vi.mock('../../hooks/useCurrentDate', () => ({ useCurrentDate: () => '2026-08-12' }))
vi.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ data: preferences }),
  mergeCategories: (builtin: readonly string[], custom?: string[]) => [...new Set([...builtin, ...(custom ?? [])])]
}))
vi.mock('../../lib/quickCaptureSubmit', () => ({ submitQuickCapture: mocks.submit }))
vi.mock('../../stores/toast', () => ({ useToastStore: (selector: (state: { push: typeof mocks.push }) => unknown) => selector({ push: mocks.push }) }))

describe('QuickCaptureDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canWrite = true
    mocks.submit.mockResolvedValue({ status: 'applied', operationId: 'op', data: null })
    useUiStore.setState({ quickCaptureOpen: false, quickCaptureSource: '' })
  })

  function open(source: string) {
    act(() => useUiStore.getState().openQuickCapture(source))
  }

  it('展示歧义候选并允许修正缺失金额', () => {
    render(<QuickCaptureDialog />)
    open('午饭 45 打车 20')
    expect(screen.getByRole('tab', { name: '记账' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('金额必须大于 0')
    fireEvent.change(screen.getByLabelText('金额'), { target: { value: '65' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: '确认保存为记账' })).toBeEnabled()
  })

  it('失败重试复用同一个 operationId', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('暂时失败')).mockResolvedValueOnce({ status: 'applied', operationId: 'op', data: null })
    render(<QuickCaptureDialog />)
    open('中午吃饭 45')
    fireEvent.click(screen.getByRole('button', { name: '确认保存为记账' }))
    await screen.findByText('暂时失败')
    fireEvent.click(screen.getByRole('button', { name: '确认保存为记账' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2))
    expect(mocks.submit.mock.calls[0][2]).toBe(mocks.submit.mock.calls[1][2])
  })

  it('提交中途断网时提示已加入待同步', async () => {
    mocks.submit.mockResolvedValueOnce({ status: 'queued', operationId: 'op', data: null })
    render(<QuickCaptureDialog />)
    open('笔记：稍后同步')
    fireEvent.click(screen.getByRole('button', { name: '确认保存为笔记' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith({ kind: 'info', message: '网络中断，记录已加入待同步' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('离线只读时禁用输入和提交', () => {
    mocks.canWrite = false
    useUiStore.setState({ quickCaptureOpen: true, quickCaptureSource: '待办：交周报' })
    render(<QuickCaptureDialog />)
    expect(screen.getByLabelText('一句话记录')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('离线只读')
    expect(screen.getByRole('button', { name: '确认保存为待办' })).toBeDisabled()
  })

  it('Escape 关闭并恢复先前焦点', async () => {
    render(<><button>触发器</button><QuickCaptureDialog /></>)
    const trigger = screen.getByRole('button', { name: '触发器' })
    trigger.focus()
    open('笔记：测试内容')
    await waitFor(() => expect(screen.getByLabelText('一句话记录')).toHaveFocus())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
