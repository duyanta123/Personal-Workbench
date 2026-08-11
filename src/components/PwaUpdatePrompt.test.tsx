import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import PwaUpdatePrompt from './PwaUpdatePrompt'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  needRefresh: true,
  offlineReady: false
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [mocks.offlineReady, mocks.setOfflineReady],
    needRefresh: [mocks.needRefresh, mocks.setNeedRefresh],
    updateServiceWorker: mocks.update
  })
}))

describe('PwaUpdatePrompt', () => {
  beforeEach(() => vi.clearAllMocks())

  test('does not activate an update until the user explicitly confirms', () => {
    render(<PwaUpdatePrompt />)
    expect(screen.getByText('新版本已就绪')).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '立即更新' }))
    expect(mocks.update).toHaveBeenCalledWith(true)
  })

  test('can dismiss the prompt without activating the new worker', () => {
    render(<PwaUpdatePrompt />)
    fireEvent.click(screen.getByRole('button', { name: '关闭更新提示' }))
    expect(mocks.setOfflineReady).toHaveBeenCalledWith(false)
    expect(mocks.setNeedRefresh).toHaveBeenCalledWith(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
