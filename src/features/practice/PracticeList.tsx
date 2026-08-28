import { Code2, Pencil, Trash2 } from 'lucide-react'
import type { PracticeProblem } from '../../types'
import Badge from '../../components/ui/Badge'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import { cn } from '../../lib/cn'
import { safeExternalUrlOrNull } from '../../utils/validation'
import { DIFFICULTY_META, STATUS_META } from './meta'

export default function PracticeList({ loading, problems, hasFilter, touch, isDeletePending, remainingSeconds, onEdit, onDelete, onCycleStatus }: {
  loading: boolean
  problems: PracticeProblem[]
  hasFilter: boolean
  touch: boolean
  isDeletePending: (id: string) => boolean
  remainingSeconds: (id: string) => number
  onEdit: (problem: PracticeProblem) => void
  onDelete: (problem: PracticeProblem) => void
  onCycleStatus: (problem: PracticeProblem) => void
}) {
  return loading ? (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  ) : !problems.length ? (
    <EmptyState
      icon={<Code2 size={22} />}
      title={hasFilter ? '没有匹配的题目' : '还没有题目'}
      description={hasFilter ? undefined : '从上面添加第一道题吧。'}
    />
  ) : (
    <ul className="space-y-2">
      {problems.map((p) => (
        <li
          key={p.id}
          className={cn('group flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-colors duration-150 hover:bg-hover', isDeletePending(p.id) ? 'border-danger/40 opacity-60' : 'border-border')}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-ink">{p.title}</span>
              {safeExternalUrlOrNull(p.url) && (
                <a
                  href={safeExternalUrlOrNull(p.url)!}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-ink-3 underline-offset-2 hover:text-accent hover:underline"
                >
                  链接
                </a>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">{p.platform}</Badge>
              <Badge variant={DIFFICULTY_META[p.difficulty].variant}>
                {DIFFICULTY_META[p.difficulty].label}
              </Badge>
              <button
                type="button"
                onClick={() => onCycleStatus(p)}
                disabled={isDeletePending(p.id)}
                title="点击切换状态"
                className="cursor-pointer"
              >
                <Badge variant={STATUS_META[p.status].variant}>{STATUS_META[p.status].label}</Badge>
              </button>
              {p.tags.map((t) => (
                <Badge key={t} variant="neutral">
                  #{t}
                </Badge>
              ))}
              {p.solved_at && (
                <span className="text-[11px] text-ink-3 tabular-nums">{p.solved_at.slice(5).replace('-', '/')}</span>
              )}
            </div>
            {p.note && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{p.note}</p>}
            {isDeletePending(p.id) && <p className="mt-1 text-[10px] font-medium text-danger">待删除 {remainingSeconds(p.id)}s</p>}
          </div>
          <div
            className={cn(
              'flex shrink-0 items-center gap-0.5',
              touch ? '' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'
            )}
          >
            <IconButton size="sm" onClick={() => onEdit(p)} disabled={isDeletePending(p.id)} aria-label="编辑">
              <Pencil size={15} />
            </IconButton>
            <IconButton size="sm" onClick={() => onDelete(p)} disabled={isDeletePending(p.id)} aria-label="删除">
              <Trash2 size={15} />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  )
}
