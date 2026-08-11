import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null
  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-ink shadow-overlay sm:bottom-4">
      <RefreshCw size={17} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">{needRefresh ? '新版本已就绪' : '离线缓存已就绪'}</span>
      {needRefresh && <button type="button" onClick={() => void updateServiceWorker(true)} className="font-medium text-accent hover:text-accent-hover">立即更新</button>}
      <button type="button" onClick={close} aria-label="关闭更新提示" className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><X size={16} /></button>
    </div>
  )
}
