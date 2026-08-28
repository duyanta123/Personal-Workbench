import { Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import type { Todo } from '../../types'
import Badge from '../../components/ui/Badge'
import IconButton from '../../components/ui/IconButton'
import { cn } from '../../lib/cn'
import { LEVEL_META } from './levelMeta'

export default function TodoDoneSection({
  doneCount, showDone, doneList, touch, isDeletePending, remainingSeconds,
  onToggleShowDone, onToggle, onEdit, onDelete
}: {
  doneCount: number
  showDone: boolean
  doneList: Todo[]
  touch: boolean
  isDeletePending: (id: string) => boolean
  remainingSeconds: (id: string) => number
  onToggleShowDone: () => void
  onToggle: (todo: Todo) => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        onClick={onToggleShowDone}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <span>
          已完成 <span className="tabular-nums">{showDone ? doneList.length : doneCount}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn('transition-transform duration-150', showDone && 'rotate-180')}
        />
      </button>
      {showDone && (
        <ul className="space-y-1 px-2 pb-2">
          {doneList.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-hover"
            >
              <button
                onClick={() => onToggle(t)}
                disabled={isDeletePending(t.id)}
                aria-label="恢复未完成"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-m1 bg-m1 text-white"
              >
                <Check size={14} strokeWidth={3} />
              </button>
              <span className="flex-1 text-sm text-ink-3 line-through">{t.text}</span>
              {isDeletePending(t.id) && <Badge variant="danger">待删除 {remainingSeconds(t.id)}s</Badge>}
              <Badge variant={LEVEL_META[t.level].variant}>{LEVEL_META[t.level].label}</Badge>
              <IconButton size="sm" onClick={() => onEdit(t)} disabled={isDeletePending(t.id)} aria-label="编辑"><Pencil size={15} /></IconButton>
              <IconButton
                size="sm"
                onClick={() => onDelete(t)}
                disabled={isDeletePending(t.id)}
                aria-label="删除"
                className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
