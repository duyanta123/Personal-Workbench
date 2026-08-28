import { useEffect, useState } from 'react'
import { Bell, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { listCommands, discardCommand } from '../../lib/commands'
import { discardPendingOperations, pendingOperationCount } from '../../lib/outbox'
import { clearUserLocalData } from '../../lib/localData'
import { clearPomodoroRuntime } from '../../utils/pomodoroRuntime'
import { queryClient } from '../../lib/queryClient'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import Field from './Field'
import Input from './Input'
import Modal from './Modal'
import SensitiveAuthDialog from './SensitiveAuthDialog'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { usePreferences, useUpdatePreferences } from '../../hooks/usePreferences'

interface TotpFactor {
  id: string
  friendly_name?: string
  status: string
}

export default function SecuritySettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId, refreshSecurityState } = useAuth()
  const push = useToastStore((state) => state.push)
  const [factors, setFactors] = useState<TotpFactor[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [deleteText, setDeleteText] = useState('')
  const [backupAcknowledged, setBackupAcknowledged] = useState(false)
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const pushNotifications = usePushNotifications()
  const preferences = usePreferences()
  const updatePreferences = useUpdatePreferences()

  async function loadFactors() {
    const result = await supabase!.auth.mfa.listFactors()
    if (result.error) throw result.error
    setFactors(result.data.totp)
    await refreshSecurityState()
  }

  useEffect(() => {
    if (!open) { setUnlocked(false); setUnlockedAt(null); setEnrollment(null); setVerifyCode(''); setDeleteText(''); setBackupAcknowledged(false); return }
    void loadFactors().catch((cause) => push({ kind: 'error', message: `安全设置加载失败：${(cause as Error).message}` }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!unlockedAt) return
    const timer = window.setTimeout(() => { setUnlocked(false); setUnlockedAt(null) }, 300_000)
    return () => window.clearTimeout(timer)
  }, [unlockedAt])

  async function startEnrollment() {
    if (!unlocked) { setAuthOpen(true); return }
    setBusy(true)
    try {
      const result = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Personal Workbench' })
      if (result.error) throw result.error
      setEnrollment({ factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret })
    } catch (cause) {
      push({ kind: 'error', message: `MFA 注册失败：${(cause as Error).message}` })
    } finally { setBusy(false) }
  }

  async function verifyEnrollment() {
    if (!enrollment || verifyCode.length !== 6) return
    setBusy(true)
    try {
      const result = await supabase!.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: verifyCode })
      if (result.error) throw result.error
      setEnrollment(null)
      setVerifyCode('')
      await loadFactors()
      push({ kind: 'success', message: '身份验证器已启用' })
    } catch (cause) {
      push({ kind: 'error', message: `验证码校验失败：${(cause as Error).message}` })
    } finally { setBusy(false) }
  }

  async function removeFactor(id: string) {
    if (!unlocked) { setAuthOpen(true); return }
    if (!window.confirm('移除身份验证器会降低账号安全性，确定继续吗？')) return
    setBusy(true)
    try {
      const result = await supabase!.auth.mfa.unenroll({ factorId: id })
      if (result.error) throw result.error
      await loadFactors()
      setUnlocked(false)
      push({ kind: 'success', message: '身份验证器已移除' })
    } catch (cause) {
      push({ kind: 'error', message: `移除失败：${(cause as Error).message}` })
    } finally { setBusy(false) }
  }

  async function deleteAccount() {
    if (!unlocked) { setAuthOpen(true); return }
    if (!backupAcknowledged || deleteText !== 'DELETE' || !userId) return
    const [legacy, commands] = await Promise.all([pendingOperationCount(userId), listCommands(userId)])
    const unresolved = commands.filter((command) => command.status !== 'resolved')
    if (legacy + unresolved.length > 0 && !window.confirm(`将永久丢弃 ${legacy + unresolved.length} 条未同步操作并删除账号，确定继续吗？`)) return
    setBusy(true)
    try {
      await discardPendingOperations(userId)
      await Promise.all(unresolved.map((command) => discardCommand(userId, command.commandId)))
      const result = await supabase!.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } })
      if (result.error) throw result.error
      clearPomodoroRuntime(localStorage, userId)
      queryClient.clear()
      await clearUserLocalData(userId)
      localStorage.removeItem('workbench:last-user:v1')
      window.location.assign('/login')
    } catch (cause) {
      push({ kind: 'error', message: `账号删除失败：${(cause as Error).message}` })
      setBusy(false)
    }
  }

  const verified = factors.filter((factor) => factor.status === 'verified')

  return <>
    <Modal open={open} onClose={onClose} title="账号安全" panelClassName="max-w-lg">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-overlay">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink">账号安全</h2>
          <button className="ml-auto text-ink-3" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </div>
        <section className="mt-5 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2"><KeyRound size={16} /><h3 className="text-sm font-medium text-ink">TOTP 身份验证器</h3></div>
          <p className="mt-1 text-xs text-ink-3">恢复数据、删除账号和修改安全设置前要求重新验证。</p>
          {verified.length ? (
            <div className="mt-3 space-y-2">{verified.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between rounded-lg bg-nested px-3 py-2 text-xs text-ink-2">
                <span>{factor.friendly_name || '身份验证器'} · 已验证</span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void removeFactor(factor.id)}>移除</Button>
              </div>
            ))}</div>
          ) : <Button className="mt-3" size="sm" disabled={busy} onClick={() => void startEnrollment()}>启用身份验证器</Button>}
          {enrollment && (
            <div className="mt-4 space-y-3 rounded-xl bg-nested p-3">
              <img src={enrollment.qr} alt="TOTP 二维码" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" referrerPolicy="no-referrer" />
              <p className="break-all text-center font-mono text-[11px] text-ink-3">{enrollment.secret}</p>
              <Field label="输入应用显示的 6 位验证码"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verifyCode} onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
              <Button size="sm" disabled={busy || verifyCode.length !== 6} onClick={() => void verifyEnrollment()}>完成启用</Button>
            </div>
          )}
        </section>
        <section className="mt-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2"><Bell size={16} /><h3 className="text-sm font-medium text-ink">后台提醒</h3></div>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">习惯提醒和每日待办摘要通过 Web Push 发送，默认只显示非敏感摘要。</p>
          {pushNotifications.supported ? (
            <Button className="mt-3" size="sm" variant="secondary" disabled={pushNotifications.busy} onClick={() => void (pushNotifications.enabled ? pushNotifications.disable() : pushNotifications.enable())}>
              {pushNotifications.busy ? '处理中…' : pushNotifications.enabled ? '停用后台提醒' : '启用后台提醒'}
            </Button>
          ) : <p className="mt-3 text-xs text-ink-3">当前浏览器或环境不支持 Web Push。</p>}
          {pushNotifications.error && <p role="alert" className="mt-2 text-xs text-danger">{pushNotifications.error}</p>}
          {preferences.data ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label htmlFor="todo-digest-time" className="text-xs text-ink-2">摘要时间
              <Input id="todo-digest-time" type="time" className="mt-1" value={(preferences.data.todo_digest_time ?? '09:00').slice(0, 5)} disabled={updatePreferences.isPending} onChange={(event) => void updatePreferences.mutateAsync({ todo_digest_time: event.target.value })} />
            </label>
            <label htmlFor="push-preview-mode" className="text-xs text-ink-2">推送预览
              <select id="push-preview-mode" className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink" value={preferences.data.push_preview_mode ?? 'summary'} disabled={updatePreferences.isPending} onChange={(event) => void updatePreferences.mutateAsync({ push_preview_mode: event.target.value as 'summary' | 'content' })}>
                <option value="summary">仅显示数量/通用提醒（推荐）</option>
                <option value="content">显示任务或习惯名称</option>
              </select>
            </label>
            <label htmlFor="preference-timezone" className="text-xs text-ink-2 sm:col-span-2">时区
              <Input id="preference-timezone" key={preferences.data.timezone} className="mt-1" defaultValue={preferences.data.timezone ?? 'Asia/Shanghai'} disabled={updatePreferences.isPending} onBlur={(event) => { if (event.target.value !== preferences.data?.timezone) void updatePreferences.mutateAsync({ timezone: event.target.value }) }} />
            </label>
            {updatePreferences.error && <p role="alert" className="sm:col-span-2 text-xs text-danger">偏好更新失败：{(updatePreferences.error as Error).message}</p>}
          </div> : null}
        </section>
        <section className="mt-4 rounded-xl border border-danger/30 p-4">
          <div className="flex items-center gap-2 text-danger"><Trash2 size={16} /><h3 className="text-sm font-medium">永久删除账号</h3></div>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">请先导出备份。删除将清除服务器和本机数据，不能撤销。</p>
          <label className="mt-3 flex items-start gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={backupAcknowledged} onChange={(event) => setBackupAcknowledged(event.target.checked)} />
            <span>我已导出并确认备份可用，理解账号删除不可撤销。</span>
          </label>
          <Field label="输入 DELETE 确认"><Input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></Field>
          <Button className="mt-3" size="sm" variant="danger" disabled={busy || !backupAcknowledged || deleteText !== 'DELETE'} onClick={() => void deleteAccount()}>删除账号</Button>
        </section>
      </div>
    </Modal>
    <SensitiveAuthDialog open={authOpen} title="验证安全设置" onClose={() => setAuthOpen(false)} onVerified={() => { setUnlocked(true); setUnlockedAt(Date.now()); push({ kind: 'success', message: '安全设置已解锁 5 分钟' }) }} />
  </>
}
