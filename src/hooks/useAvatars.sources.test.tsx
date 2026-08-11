import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useAvatarSources } from './useAvatars'
import type { UserAvatar } from '../types'

const mocks = vi.hoisted(() => ({
  getLocalValue: vi.fn(),
  setLocalValue: vi.fn(),
  createSignedUrls: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:cached-avatar'),
  revokeObjectURL: vi.fn()
}))

vi.mock('./useAuth', () => ({ useAuth: () => ({ userId: 'user-1' }) }))
vi.mock('../lib/localData', () => ({
  localKeys: { avatar: (path: string) => `avatar:v1:${path}` },
  getLocalValue: mocks.getLocalValue,
  setLocalValue: mocks.setLocalValue
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls: mocks.createSignedUrls }) }
  }
}))

const avatar = {
  id: 'avatar-1',
  user_id: 'user-1',
  storage_path: 'user-1/avatar.webp',
  is_active: true,
  created_at: '2026-08-10T00:00:00.000Z'
} as UserAvatar

function Harness() {
  const sources = useAvatarSources([avatar])
  return <img alt="avatar" src={sources[avatar.storage_path]} />
}

describe('useAvatarSources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mocks.createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeObjectURL })
  })

  test('uses the per-user cached Blob while offline without requesting a signed URL', async () => {
    mocks.getLocalValue.mockResolvedValue(new Blob(['avatar'], { type: 'image/webp' }))
    render(<Harness />)

    await waitFor(() => expect(screen.getByRole('img', { name: 'avatar' })).toHaveAttribute('src', 'blob:cached-avatar'))
    expect(mocks.getLocalValue).toHaveBeenCalledWith('user-1', 'avatar:v1:user-1/avatar.webp')
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()
  })
})
