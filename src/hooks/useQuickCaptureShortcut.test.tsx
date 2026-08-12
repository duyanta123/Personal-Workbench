import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../stores/ui'
import { useQuickCaptureShortcut } from './useQuickCaptureShortcut'

describe('useQuickCaptureShortcut', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useUiStore.setState({ quickCaptureOpen: false, quickCaptureSource: '' })
    document.body.innerHTML = '<input id="quick-capture-source" />'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('用 Ctrl/Cmd + K 打开并聚焦快速记录', () => {
    renderHook(() => useQuickCaptureShortcut())
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true })
    act(() => {
      window.dispatchEvent(event)
      vi.runAllTimers()
    })
    expect(event.defaultPrevented).toBe(true)
    expect(useUiStore.getState().quickCaptureOpen).toBe(true)
    expect(document.getElementById('quick-capture-source')).toHaveFocus()
  })

  it('输入法组合或带 Shift 时不触发', () => {
    renderHook(() => useQuickCaptureShortcut())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, isComposing: true }))
    })
    expect(useUiStore.getState().quickCaptureOpen).toBe(false)
  })
})
