import { useState } from 'react'
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note } from '../../types'
import Badge from '../../components/ui/Badge'
import IconButton from '../../components/ui/IconButton'
import MarkdownPreview from '../../components/ui/MarkdownPreview'
import { cn } from '../../lib/cn'
import { renderTag, safeExternalUrlOrNull } from '../../utils/validation'

function NoteImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  const safeSrc = safeExternalUrlOrNull(src)
  if (!safeSrc || failed) return <div role="img" aria-label="图片加载失败" className="flex h-40 items-center justify-center bg-nested text-xs text-ink-3">图片无法加载</div>
  return <img src={safeSrc} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-40 w-full object-cover" />
}

export default function NoteCard({ note, touch, pending, remainingSeconds, onPin, onEdit, onDelete }: {
  note: Note
  touch: boolean
  pending: boolean
  remainingSeconds: number
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const actions = (
    <div className={cn('flex gap-1', touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100')}>
      <IconButton size="sm" onClick={onPin} disabled={pending} aria-label={note.pinned ? '取消置顶' : '置顶'}>{note.pinned ? <PinOff size={15} /> : <Pin size={15} />}</IconButton>
      <IconButton size="sm" onClick={onEdit} disabled={pending} aria-label="编辑"><Pencil size={15} /></IconButton>
      <IconButton size="sm" onClick={onDelete} disabled={pending} aria-label="删除"><Trash2 size={15} /></IconButton>
    </div>
  )
  const pendingBadge = pending ? <Badge variant="danger">待删除 {remainingSeconds}s</Badge> : null

  if (note.layout === 'quote') {
    return (
      <li className={cn('group rounded-2xl border bg-surface px-6 py-5 transition-colors duration-150 hover:bg-hover', pending ? 'border-danger/40 opacity-60' : 'border-border')}>
        <div className="flex items-center justify-end gap-2">{pendingBadge}{actions}</div>
        <div className="pt-1 text-center text-base font-medium leading-relaxed text-ink"><MarkdownPreview source={note.body} className="text-center" /></div>
        <div className="mt-3 text-center text-xs text-ink-3">{note.tags.length > 0 && note.tags.map(renderTag).join(' ')}{note.tags.length > 0 && ' · '}{note.updated_at.slice(0, 10)}</div>
      </li>
    )
  }

  if (note.layout === 'feature' && note.image_url) {
    return (
      <li className={cn('group overflow-hidden rounded-2xl border bg-surface transition-colors duration-150 hover:bg-hover', pending ? 'border-danger/40 opacity-60' : 'border-border')}>
        <div className="relative"><NoteImage src={note.image_url} /><div className="absolute right-2 top-2 rounded-xl bg-surface/90 p-1 backdrop-blur">{pendingBadge}{actions}</div></div>
        <div className="p-4">
          <div className="flex items-center gap-1.5">{note.title && <div className="text-sm font-medium text-ink">{note.title}</div>}{note.pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-m3"><Pin size={11} /> 置顶</span>}</div>
          <div className="mt-1 line-clamp-4 text-sm leading-relaxed text-ink-2"><MarkdownPreview source={note.body} /></div>
          {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{note.tags.map((tag) => <Badge key={tag} variant="neutral">{renderTag(tag)}</Badge>)}</div>}
        </div>
      </li>
    )
  }

  return (
    <li className={cn('group rounded-2xl border bg-surface p-4 transition-colors duration-150 hover:bg-hover', pending ? 'border-danger/40 opacity-60' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">{note.title && <div className="text-sm font-medium text-ink">{note.title}</div>}{note.pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-m3"><Pin size={11} /> 置顶</span>}</div>
          <div className="mt-1 text-sm leading-relaxed text-ink-2"><MarkdownPreview source={note.body} /></div>
          {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{note.tags.map((tag) => <Badge key={tag} variant="neutral">{renderTag(tag)}</Badge>)}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">{pendingBadge}<span className="text-xs text-ink-3 tabular-nums">{note.updated_at.slice(0, 10)}</span>{actions}</div>
      </div>
    </li>
  )
}
