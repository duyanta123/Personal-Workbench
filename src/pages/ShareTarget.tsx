import { useMemo, useState } from 'react'
import { Inbox, LogIn } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAddInboxItem } from '../hooks/useTodayWorkspace'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

function idsForShare(key: string) {
  const storageKey = `workbench:share-target:${key}`
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (stored) return JSON.parse(stored) as { commandId: string; entityId: string }
    const ids = { commandId: crypto.randomUUID(), entityId: crypto.randomUUID() }
    sessionStorage.setItem(storageKey, JSON.stringify(ids))
    return ids
  } catch {
    return { commandId: crypto.randomUUID(), entityId: crypto.randomUUID() }
  }
}

export default function ShareTarget() {
  const { userId, loading } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const addInbox = useAddInboxItem()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const rawText = [params.get('title'), params.get('text'), params.get('url')].map((value) => value?.trim()).filter(Boolean).join('\n')
  const ids = useMemo(() => idsForShare(rawText), [rawText])
  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`

  async function save() {
    if (!rawText || !userId || saved) return
    setError('')
    try {
      await addInbox.mutateAsync({ raw_text: rawText, source: 'share_target', ...ids })
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存到 Inbox 失败，请重试')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 p-4">
      <PageHeader eyebrow="SHARE TARGET" title="保存到工作台" description="分享内容会先进入 Inbox，由你稍后确认分流。" />
      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Inbox size={16} className="text-accent" />待确认内容</div>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-nested p-3 text-sm text-ink-2">{rawText || '没有收到可保存的内容'}</pre>
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {loading ? <span className="text-xs text-ink-3">正在确认身份…</span> : userId ? (
            <Button onClick={() => void save()} disabled={!rawText || saved || addInbox.isPending}>{saved ? '已保存到 Inbox' : '确认保存'}</Button>
          ) : (
            <Link to={loginUrl}><Button><LogIn size={15} />登录后确认</Button></Link>
          )}
        </div>
      </Card>
    </main>
  )
}
