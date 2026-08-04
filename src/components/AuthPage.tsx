import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export default function AuthPage() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-card">
          <div className="text-4xl">🛠️</div>
          <h1 className="mt-3 text-lg font-semibold">尚未连接后端</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            复制 <code className="rounded bg-nested px-1">.env.example</code> 为{' '}
            <code className="rounded bg-nested px-1">.env</code>
            ，填入 Supabase 项目的 URL 与 anon 公钥，重启开发服务器后即可使用。
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const action =
      mode === 'login'
        ? supabase!.auth.signInWithPassword({ email, password })
        : supabase!.auth.signUp({ email, password })
    const { error: err } = await action
    if (err) setError(err.message)
    setBusy(false)
  }

  const inputCls =
    'w-full rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-card">
        <div className="text-center">
          <div className="text-3xl">🧭</div>
          <h1 className="mt-2 text-lg font-semibold">个人工作台</h1>
          <p className="mt-1 text-xs text-ink-3">登录后同步你的计划、打卡、记账与笔记</p>
        </div>

        <div className="mt-6 flex rounded-xl bg-nested p-1 text-sm">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-1.5 transition ${
                mode === m ? 'bg-accent font-medium text-page' : 'text-ink-2'
              }`}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-page disabled:opacity-50"
          >
            {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
