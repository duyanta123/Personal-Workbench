import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { useAddTodo, useDeleteTodo, useTodos, useToggleTodo } from '../hooks/useTodos'
import type { Priority } from '../types'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Segmented from '../components/ui/Segmented'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import { cn } from '../lib/cn'

const LEVEL_META: Record<Priority, { label: string; variant: 'danger' | 'warning' | 'accent' }> = {
  high: { label: '高', variant: 'danger' },
  mid: { label: '中', variant: 'warning' },
  low: { label: '低', variant: 'accent' }
}

const LEVEL_OPTIONS = (Object.keys(LEVEL_META) as Priority[]).map((lv) => ({
  value: lv,
  label: `${LEVEL_META[lv].label}优先级`
}))

export default function Todos() {
  const { data: todos, isLoading } = useTodos()
  const addTodo = useAddTodo()
  const toggleTodo = useToggleTodo()
  const deleteTodo = useDeleteTodo()

  const [text, setText] = useState('')
  const [level, setLevel] = useState<Priority>('mid')

  const doneCount = todos?.filter((t) => t.done).length ?? 0
  const totalCount = todos?.length ?? 0
  const pct = totalCount ? (doneCount / totalCount) * 100 : 0

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    addTodo.mutate({ text: t, level })
    setText('')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="TODAY"
        title="每日计划"
        description={
          totalCount
            ? `${doneCount} / ${totalCount} 已完成`
            : '把今天要做的事写下来。'
        }
        actions={
          totalCount > 0 ? (
            <span className="text-sm font-semibold text-m1 tabular-nums">
              {Math.round(pct)}%
            </span>
          ) : undefined
        }
      />

      {/* 完成进度 */}
      {totalCount > 0 && <Progress value={pct} color="bg-m1" />}

      {/* 添加表单 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天要做什么？"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
          <Button type="submit" disabled={!text.trim()}>
            <Plus size={16} />
            添加
          </Button>
        </div>
      </form>

      {/* 待办列表 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !todos?.length ? (
        <EmptyState
          icon={<ClipboardList size={22} />}
          title="暂无待办"
          description="从上面添加第一条吧。"
        />
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors duration-150 hover:bg-hover"
            >
              <button
                onClick={() => toggleTodo.mutate({ id: t.id, done: !t.done })}
                aria-label="切换完成"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                  t.done
                    ? 'border-m1 bg-m1 text-white'
                    : 'border-ink-3 text-transparent hover:border-accent'
                )}
              >
                <Check size={14} strokeWidth={3} />
              </button>
              <span
                className={cn(
                  'flex-1 text-sm transition-colors',
                  t.done ? 'text-ink-3 line-through' : 'text-ink'
                )}
              >
                {t.text}
              </span>
              <Badge variant={LEVEL_META[t.level].variant}>{LEVEL_META[t.level].label}</Badge>
              <IconButton
                size="sm"
                onClick={() => deleteTodo.mutate(t.id)}
                aria-label="删除"
                className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
