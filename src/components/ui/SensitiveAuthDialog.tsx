import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Button from './Button'
import Field from './Field'
import Input from './Input'
import Modal from './Modal'

export default function SensitiveAuthDialog({
  open, title, onClose, onVerified
}: {
  open: boolean
  title: string
  onClose: () => void
  onVerified: () => Promise<void> | void
}) {
  const { hasVerifiedMfa, reauthenticate } = useAuth()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    if (!password) { setError('请输入当前密码'); return }
    setBusy(true)
    setError('')
    try {
      await reauthenticate(password, code)
      setPassword('')
      setCode('')
      await onVerified()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重新验证失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title}>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-overlay">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button className="ml-auto text-ink-3" aria-label="关闭" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">敏感操作需要在 5 分钟内重新验证。密码只发送给 Supabase Auth。</p>
        <div className="mt-4 space-y-3">
          <Field label="当前密码"><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          {hasVerifiedMfa && <Field label="动态验证码"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>}
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button onClick={() => void verify()} disabled={busy}>{busy ? '验证中…' : '验证'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
