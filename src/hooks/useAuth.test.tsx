import { act, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './useAuth'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  clearUserLocalData: vi.fn(),
  clearQueryClient: vi.fn()
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange
    }
  }
}))

vi.mock('../lib/localData', () => ({
  clearUserLocalData: mocks.clearUserLocalData
}))

vi.mock('../lib/queryClient', () => ({
  queryClient: { clear: mocks.clearQueryClient }
}))

const LAST_USER_KEY = 'workbench:last-user:v1'
const USER_ID = '11111111-1111-4111-8111-111111111111'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

function Probe() {
  const auth = useAuth()
  return (
    <output data-testid="auth-state">
      {auth.loading ? 'loading' : `${auth.mode}|${auth.userId ?? 'none'}|${String(auth.canWrite)}`}
    </output>
  )
}

function renderAuth() {
  return render(<AuthProvider><Probe /></AuthProvider>)
}

describe('AuthProvider offline session validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } }
    })
    mocks.clearUserLocalData.mockResolvedValue(undefined)
  })

  it('hydrates only the last user in offline read-only mode', async () => {
    setOnline(false)
    localStorage.setItem(LAST_USER_KEY, USER_ID)
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderAuth()

    expect(await screen.findByTestId('auth-state')).toHaveTextContent(`offline-readonly|${USER_ID}|false`)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('clears offline access and cached data when reconnecting without a session', async () => {
    setOnline(false)
    localStorage.setItem(LAST_USER_KEY, USER_ID)
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderAuth()
    await screen.findByText(`offline-readonly|${USER_ID}|false`)

    setOnline(true)
    act(() => window.dispatchEvent(new Event('online')))

    await screen.findByText('signed-out|none|false')
    await waitFor(() => expect(mocks.clearUserLocalData).toHaveBeenCalledWith(USER_ID))
    expect(mocks.clearQueryClient).toHaveBeenCalled()
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull()
  })

  it('restores online write access only after the server confirms the user', async () => {
    setOnline(false)
    localStorage.setItem(LAST_USER_KEY, USER_ID)
    const session = { user: { id: USER_ID } } as Session
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null })

    renderAuth()
    await screen.findByText(`offline-readonly|${USER_ID}|false`)

    setOnline(true)
    act(() => window.dispatchEvent(new Event('online')))

    await screen.findByText(`online|${USER_ID}|true`)
    expect(mocks.getUser).toHaveBeenCalledTimes(1)
    expect(mocks.clearUserLocalData).not.toHaveBeenCalled()
  })

  it('rejects a cached session when server verification fails', async () => {
    setOnline(true)
    localStorage.setItem(LAST_USER_KEY, USER_ID)
    const session = { user: { id: USER_ID } } as Session
    mocks.getSession.mockResolvedValue({ data: { session }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid session') })

    renderAuth()

    expect(await screen.findByTestId('auth-state')).toHaveTextContent('signed-out|none|false')
    await waitFor(() => expect(mocks.clearUserLocalData).toHaveBeenCalledWith(USER_ID))
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull()
  })
})
