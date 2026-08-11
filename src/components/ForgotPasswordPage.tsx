import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import Button from './ui/Button'
import Input from './ui/Input'
import Field from './ui/Field'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: authError } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`
    })
    if (authError) setError(authError.message)
    else setSent(true)
    setBusy(false)
  }

  if (!isSupabaseConfigured) return <p className="p-8 text-center">尚未连接后端</p>
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold text-ink">找回密码</h1>
        <p className="mt-1 text-xs text-ink-3">输入受邀账号邮箱，我们会发送一次性重置链接。</p>
        {sent ? <p className="mt-5 text-sm text-ink-2">如果邮箱已登记，重置链接已经发送，请检查收件箱。</p> : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <Field label="邮箱"><Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            {error && <p role="alert" className="text-xs text-danger">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? '发送中…' : '发送重置链接'}</Button>
          </form>
        )}
        <Link to="/login" className="mt-5 block text-center text-xs text-accent hover:text-accent-hover">返回登录</Link>
      </div>
    </div>
  )
}
