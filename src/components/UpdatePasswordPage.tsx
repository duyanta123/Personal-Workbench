import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Button from './ui/Button'
import Input from './ui/Input'
import Field from './ui/Field'

export default function UpdatePasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isSupabaseConfigured) return <p className="p-8 text-center">尚未连接后端</p>
  if (loading) return <p className="p-8 text-center">正在验证链接…</p>
  if (!session) return <div className="p-8 text-center text-sm text-ink-2">链接已失效，请<Link to="/forgot-password" className="ml-1 text-accent">重新申请</Link>。</div>

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 12) { setError('密码至少需要 12 位'); return }
    if (password !== confirm) { setError('两次输入的密码不一致'); return }
    setBusy(true)
    setError('')
    const { error: authError } = await supabase!.auth.updateUser({ password })
    if (authError) setError(authError.message)
    else navigate('/', { replace: true })
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold text-ink">设置新密码</h1>
        <p className="text-xs text-ink-3">邀请和密码重置链接都在这里完成。</p>
        <Field label="新密码"><Input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
        <Field label="确认密码"><Input type="password" required minLength={12} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? '保存中…' : '保存密码'}</Button>
      </form>
    </div>
  )
}
