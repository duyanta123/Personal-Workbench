import { useState } from 'react'
import type { FormEvent } from 'react'
import { Compass, Wrench } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import Button from './ui/Button'
import Input from './ui/Input'
import Field from './ui/Field'
import Segmented from './ui/Segmented'

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
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-nested text-ink-3">
            <Wrench size={22} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-ink">尚未连接后端</h1>
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
    if (err) {
      setError(
        /fetch|abort|network|timeout/i.test(err.message)
          ? '网络连接不稳定，已自动重试，请稍后再试'
          : err.message
      )
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-surface p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white">
              <Compass size={24} />
            </div>
            <h1 className="mt-3 text-lg font-semibold text-ink">个人工作台</h1>
            <p className="mt-1 text-xs text-ink-3">登录后同步你的计划、打卡、记账与笔记</p>
          </div>

          <div className="mt-6 flex justify-center">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'login', label: '登录' },
                { value: 'signup', label: '注册' }
              ]}
            />
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <Field label="邮箱">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="密码">
              <Input
                type="password"
                required
                minLength={6}
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="submit" disabled={busy} size="lg" className="w-full">
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
