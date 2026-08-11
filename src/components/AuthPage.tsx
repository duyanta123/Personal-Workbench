import { useState } from 'react'
import type { FormEvent } from 'react'
import { Compass, Mail, Wrench } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import Button from './ui/Button'
import Input from './ui/Input'
import Field from './ui/Field'

export default function AuthPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-nested text-ink-3"><Wrench size={22} /></div>
          <h1 className="mt-4 text-lg font-semibold text-ink">尚未连接后端</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">配置 Supabase 环境变量后即可登录。</p>
        </div>
      </div>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: authError } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (authError) {
      setError(/fetch|abort|network|timeout/i.test(authError.message) ? '网络连接不稳定，请稍后重试' : authError.message)
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white"><Compass size={24} /></div>
          <h1 className="mt-3 text-lg font-semibold text-ink">个人工作台</h1>
          <p className="mt-1 text-xs text-ink-3">受邀后登录，同步你的计划、打卡、记账与笔记</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <Field label="邮箱">
            <Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="密码">
            <Input type="password" required minLength={12} autoComplete="current-password" placeholder="至少 12 位" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <Button type="submit" disabled={busy} size="lg" className="w-full">{busy ? '请稍候…' : '登录'}</Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
          <Link to="/forgot-password" className="inline-flex items-center gap-1 hover:text-accent"><Mail size={13} />忘记密码</Link>
          <span>账号由受信后台邀请</span>
        </div>
      </div>
    </div>
  )
}
