import { useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { useAddEntityLink, useDeleteEntityLink, useEntityLinks, useEntityOptions } from '../../hooks/useWorkbenchArtifacts'
import type { LinkKind } from '../../hooks/useWorkbenchArtifacts'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import IconButton from './IconButton'

const KINDS: Array<{ value: LinkKind; label: string }> = [
  { value: 'todo', label: '待办' }, { value: 'habit', label: '习惯' }, { value: 'ledger', label: '账目' },
  { value: 'goal', label: '目标' }, { value: 'note', label: '笔记' }, { value: 'practice', label: '练习' }, { value: 'workout', label: '训练' }
]

export default function EntityLinksPanel({ sourceKind, sourceId }: { sourceKind: LinkKind; sourceId: string }) {
  const [targetKind, setTargetKind] = useState<LinkKind>('todo'); const [targetId, setTargetId] = useState('')
  const links = useEntityLinks(sourceKind, sourceId); const options = useEntityOptions(targetKind)
  const addLink = useAddEntityLink(); const deleteLink = useDeleteEntityLink(); const push = useToastStore((state) => state.push)

  async function add() {
    if (!targetId || (targetKind === sourceKind && targetId === sourceId)) return
    try {
      await addLink.mutateAsync({ sourceKind, sourceId, targetKind, targetId })
      setTargetId(''); push({ kind: 'success', message: '关联已建立' })
    } catch { push({ kind: 'error', message: '关联创建失败或已存在' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Link2 size={15} className="text-accent" /><h2 className="text-sm font-semibold text-ink">实体关联</h2></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={targetKind} onChange={(e) => { setTargetKind(e.target.value as LinkKind); setTargetId('') }} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink" aria-label="目标类型">
          {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
        </select>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="min-w-48 flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink" aria-label="目标实体">
          <option value="">选择目标</option>
          {options.data?.filter((option) => option.id !== sourceId || targetKind !== sourceKind).map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
        </select>
        <Button size="sm" onClick={() => void add()} disabled={!targetId || addLink.isPending}><Plus size={13} />关联</Button>
      </div>
      {(links.data?.length ?? 0) > 0 ? (
        <ul className="mt-3 space-y-1">
          {links.data?.map((link) => {
            const outgoing = link.source_kind === sourceKind && link.source_id === sourceId
            const kind = outgoing ? link.target_kind : link.source_kind
            const id = outgoing ? link.target_id : link.source_id
            return <li key={link.id} className="flex items-center gap-2 rounded-lg bg-nested px-2 py-1.5 text-xs"><span className="rounded bg-surface px-1.5 py-0.5 text-ink-3">{outgoing ? '链接到' : '反向链接'}</span><span className="flex-1 truncate text-ink">{kind} · {id}</span><IconButton size="sm" aria-label="删除关联" onClick={() => void deleteLink.mutateAsync(link.id)}><Trash2 size={13} /></IconButton></li>
          })}
        </ul>
      ) : <p className="mt-3 text-xs text-ink-3">暂无关联</p>}
    </section>
  )
}
