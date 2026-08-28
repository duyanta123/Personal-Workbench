import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'
import { clearUserLocalData } from '../lib/localData'

export interface AuthState {
  session: Session | null
  userId: string | null
  loading: boolean
  mode: 'online' | 'offline' | 'offline-readonly' | 'signed-out'
  canWrite: boolean
  assuranceLevel: 'aal1' | 'aal2' | null
  hasVerifiedMfa: boolean
  refreshSecurityState: () => Promise<void>
  reauthenticate: (password: string, totpCode?: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const LAST_USER_KEY = 'workbench:last-user:v1'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [offlineUserId, setOfflineUserId] = useState<string | null>(null)
  const [assuranceLevel, setAssuranceLevel] = useState<'aal1' | 'aal2' | null>(null)
  const [hasVerifiedMfa, setHasVerifiedMfa] = useState(false)
  const previousUserId = useRef<string | null | undefined>(undefined)

  const applySession = useCallback((next: Session | null, connectionOnline = navigator.onLine) => {
      const nextUserId = next?.user.id ?? null
      let nextOfflineUserId: string | null = null
      let staleUserId: string | null = null

      if (nextUserId) {
        try { localStorage.setItem(LAST_USER_KEY, nextUserId) } catch { /* ignore */ }
      } else if (!connectionOnline) {
        try { nextOfflineUserId = localStorage.getItem(LAST_USER_KEY) } catch { /* ignore */ }
      } else {
        try {
          staleUserId = localStorage.getItem(LAST_USER_KEY)
          localStorage.removeItem(LAST_USER_KEY)
        } catch { /* ignore */ }
      }

      const effectiveUserId = nextUserId ?? nextOfflineUserId
      if (previousUserId.current !== undefined && previousUserId.current !== effectiveUserId) {
        queryClient.clear()
      }
      if (staleUserId) void clearUserLocalData(staleUserId)

      previousUserId.current = effectiveUserId
      setSession(next)
      setOfflineUserId(nextOfflineUserId)
      setLoading(false)
  }, [])

  const verifyOnlineSession = useCallback(async () => {
    if (!supabase) return
    try {
      const sessionResult = await supabase.auth.getSession()
      const nextSession = sessionResult.data.session
      if (sessionResult.error || !nextSession) {
        applySession(null, navigator.onLine)
        return
      }

      // getSession may only read the locally cached token. getUser performs the
      // authoritative server check required before restoring write access.
      const userResult = await supabase.auth.getUser()
      if (userResult.error || userResult.data.user?.id !== nextSession.user.id) {
        applySession(null, navigator.onLine)
        return
      }
      applySession(nextSession, navigator.onLine)
    } catch {
      applySession(null, navigator.onLine)
    }
  }, [applySession])

  const refreshSecurityState = useCallback(async () => {
    if (!supabase || !navigator.onLine) {
      setAssuranceLevel(null)
      setHasVerifiedMfa(false)
      return
    }
    const [factors, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ])
    if (factors.error) throw factors.error
    if (assurance.error) throw assurance.error
    setHasVerifiedMfa(factors.data.totp.some((factor) => factor.status === 'verified'))
    const level = assurance.data.currentLevel
    setAssuranceLevel(level === 'aal1' || level === 'aal2' ? level as 'aal1' | 'aal2' : null)
  }, [])

  const reauthenticate = useCallback(async (password: string, totpCode?: string) => {
    if (!supabase || !session?.user.email) throw new Error('当前账号无法重新验证')
    if (!navigator.onLine) throw new Error('敏感操作需要联网验证')
    const signedIn = await supabase.auth.signInWithPassword({ email: session.user.email, password })
    if (signedIn.error) throw signedIn.error
    const factors = await supabase.auth.mfa.listFactors()
    if (factors.error) throw factors.error
    const factor = factors.data.totp.find((item) => item.status === 'verified')
    if (factor) {
      if (!totpCode?.trim()) throw new Error('请输入身份验证器中的 6 位动态验证码')
      const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode.trim() })
      if (verified.error) throw verified.error
    }
    const current = await supabase.auth.getSession()
    if (current.error || !current.data.session) throw current.error ?? new Error('重新验证失败')
    const encoded = current.data.session.access_token.split('.')[1] ?? ''
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const claims = JSON.parse(atob(padded)) as { iat?: number; aal?: string }
    const age = Date.now() / 1000 - (claims.iat ?? 0)
    if (!claims.iat || age > 300 || age < -60) throw new Error('重新验证已过期')
    if (factor && claims.aal !== 'aal2') throw new Error('动态验证码验证未达到 AAL2')
    applySession(current.data.session, true)
    await refreshSecurityState()
  }, [applySession, refreshSecurityState, session])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    if (navigator.onLine) {
      void verifyOnlineSession()
    } else {
      supabase.auth.getSession()
        .then(({ data }) => applySession(data.session, false))
        .catch(() => applySession(null, false))
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // The initial event may contain an unverified cached session. Startup and
      // reconnect paths above validate it before enabling writes.
      if (event !== 'INITIAL_SESSION') applySession(nextSession, navigator.onLine)
    })
    return () => sub.subscription.unsubscribe()
  }, [applySession, verifyOnlineSession])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void verifyOnlineSession()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [verifyOnlineSession])

  useEffect(() => {
    if (!session || !online) {
      setAssuranceLevel(null)
      setHasVerifiedMfa(false)
      return
    }
    void refreshSecurityState().catch(() => {
      setAssuranceLevel(null)
      setHasVerifiedMfa(false)
    })
  }, [online, refreshSecurityState, session])

  const userId = session?.user.id ?? offlineUserId
  // 有 session（服务器确认过）才可写：纯离线只读（仅 lastUser 缓存）不能产生新写入。
  const mode: AuthState['mode'] = session
    ? online ? 'online' : 'offline'
    : offlineUserId ? 'offline-readonly' : 'signed-out'

  return createElement(
    AuthContext.Provider,
    { value: {
      session, userId, loading, mode, canWrite: Boolean(session), assuranceLevel,
      hasVerifiedMfa, refreshSecurityState, reauthenticate
    } },
    children
  )
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
