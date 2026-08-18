import { AlertTriangle, CheckCircle2, Clock3, Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { useCommandSync } from '../../hooks/useCommandSync'
import { useOnline } from '../../hooks/useOnline'
import Button from './Button'
import Modal from './Modal'
import { useAuth } from '../../hooks/useAuth'
import { getCachedSyncState } from '../../lib/outbox'
import { buildSyncDiagnostics } from '../../lib/syncDiagnostics'
import { downloadFile } from '../../utils/export'

const STATUS_LABEL = {
  pending: '等待同步', syncing: '正在同步', conflict: '需要处理', failed: '同步失败', stale: '恢复后失效', resolved: '已解决'
} as const

export default function SyncCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const online = useOnline()
  const { userId } = useAuth()
  const state = useCommandSync()
  const active = state.commands.filter((command) => command.status !== 'resolved')

  async function downloadDiagnostics() {
    const syncState = userId ? await getCachedSyncState(userId) : null
    const payload = buildSyncDiagnostics({ online, commands: state.commands, metadata: state.metadata, syncState })
    downloadFile(`工作台同步诊断-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json')
  }

  return (
    <Modal open={open} onClose={onClose} title="同步中心" panelClassName="max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {online ? <CheckCircle2 size={18} className="text-m2" /> : <WifiOff size={18} className="text-m3" />}
          <div>
            <h2 className="text-sm font-bold text-ink">{online ? '设备已联网' : '当前离线，操作会保存在本机'}</h2>
            <p className="text-[11px] text-ink-3">最后成功：{state.metadata.lastSuccessAt ? new Date(state.metadata.lastSuccessAt).toLocaleString() : '尚无记录'}</p>
          </div>
          <button onClick={onClose} aria-label="关闭同步中心" className="ml-auto text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-2">{active.length} 条待处理操作</p>
            <Button size="sm" variant="secondary" disabled={!online || state.syncing} onClick={() => void state.sync()}>
              <RefreshCw size={14} className={state.syncing ? 'animate-spin' : ''} />{state.syncing ? '同步中…' : '立即重试'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void downloadDiagnostics()}>
              <Download size={14} />导出诊断
            </Button>
          </div>
          {active.length === 0 ? (
            <div className="mt-6 rounded-xl bg-nested p-5 text-center text-xs text-ink-3">所有本地操作均已同步。</div>
          ) : (
            <ul className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
              {active.map((command) => (
                <li key={command.commandId} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    {command.status === 'conflict' || command.status === 'failed' || command.status === 'stale'
                      ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-m3" />
                      : <Clock3 size={15} className="mt-0.5 shrink-0 text-ink-3" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink">{command.kind}</span>
                        <span className="rounded-full bg-nested px-2 py-0.5 text-[10px] text-ink-3">{STATUS_LABEL[command.status]}</span>
                      </div>
                      <p className="mt-1 break-words text-[11px] text-ink-3">{command.result?.message || command.lastError || command.entityId}</p>
                      {command.result?.conflictingFields.length ? <p className="mt-1 text-[11px] text-m3">冲突字段：{command.result.conflictingFields.join('、')}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {command.status === 'conflict' && <>
                          <Button size="sm" variant="secondary" onClick={() => void state.resolve(command.commandId, 'keep_remote')}>保留远端</Button>
                          <Button size="sm" onClick={() => void state.resolve(command.commandId, 'reapply')}>重新应用本地</Button>
                        </>}
                        {(command.status === 'failed' || command.status === 'stale') && <Button size="sm" variant="secondary" onClick={() => void state.discard(command.commandId)}>放弃记录</Button>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
