import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronLeft, ChevronRight, Minus, Pencil, Pin, PinOff, Plus, Target, Trash2, X } from 'lucide-react'
import { GOALS_PAGE_SIZE, goalsListKey, useAddGoal, useAdjustGoal, useDeleteGoal, useGoals, useToggleGoalPin, useUpdateGoal } from '../hooks/useGoals'
import type { GoalPage } from '../hooks/useGoals'
import { useDeferredDelete } from '../hooks/useDeferredDelete'
import { useTouch } from '../hooks/useTouch'
import { useToastStore } from '../stores/toast'
import { resolveIcon } from '../utils/icon'
import type { Goal } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useClampPage } from '../hooks/useClampPage'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import IconPicker from '../components/ui/IconPicker'
import { cn } from '../lib/cn'
import QueryError from '../components/ui/QueryError'
import { isGoalProgressValid } from '../utils/dataConsistency'

export default function Goals() {
  const [page, setPage] = useState(0)
  const goalsQuery = useGoals(page)
  useClampPage(goalsQuery.data?.total, GOALS_PAGE_SIZE, page, setPage)
  const goals = goalsQuery.data?.items ?? []
  const isLoading = goalsQuery.isLoading
  const addGoal = useAddGoal()
  const adjustGoal = useAdjustGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const togglePin = useToggleGoalPin()
  const push = useToastStore((s) => s.push)
  const touch = useTouch()
  const { userId } = useAuth()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('target')
  const [target, setTarget] = useState('')
  const [current, setCurrent] = useState('0')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { requestDelete, isPending: isDeletePending, remainingSeconds } = useDeferredDelete<Goal, GoalPage>({
    key: goalsListKey(userId, page),
    label: (g) => g.name,
    remove: (id) => deleteGoal.mutateAsync(id),
    cache: {
      getItems: (cache) => cache?.items ?? [],
      remove: (cache, id) => cache && { items: cache.items.filter((item) => item.id !== id), total: Math.max(0, cache.total - 1) },
      restore: (cache) => cache
    }
  })

  function resetForm() {
    setName('')
    setIcon('target')
    setTarget('')
    setCurrent('0')
    setUnit('')
    setNote('')
    setEditingId(null)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = Number(target)
    const c = Number(current)
    if (!name.trim() || !isGoalProgressValid(c, t)) return
    const payload = { name: name.trim(), emoji: icon || 'target', current: c, target: t, unit: unit.trim() || null, note: note.trim() || null }
    try {
      if (editingId) {
        await updateGoal.mutateAsync({ id: editingId, patch: payload })
        push({ kind: 'success', message: `已更新目标「${name.trim()}」` })
      } else {
        await addGoal.mutateAsync(payload)
        push({ kind: 'success', message: `已创建目标「${name.trim()}」` })
      }
      resetForm()
    } catch {
      push({ kind: 'error', message: editingId ? '目标更新失败，请重试' : '目标创建失败，请重试' })
    }
  }

  async function adjust(g: Goal, delta: number) {
    if ((delta > 0 && g.current >= g.target) || (delta < 0 && g.current <= 0)) return
    try {
      await adjustGoal.mutateAsync({ id: g.id, delta })
      if (delta > 0 && g.current + delta >= g.target) push({ kind: 'success', message: `目标「${g.name}」达成` })
    } catch {
      push({ kind: 'error', message: '目标进度更新失败，请重试' })
    }
  }

  async function handlePin(g: Goal) {
    try {
      await togglePin.mutateAsync({ id: g.id, pinned: !g.pinned })
      push({ kind: 'info', message: g.pinned ? '已取消置顶' : '已置顶' })
    } catch {
      push({ kind: 'error', message: '目标置顶保存失败，请重试' })
    }
  }

  function startEdit(g: Goal) {
    setEditingId(g.id)
    setName(g.name)
    setIcon(g.emoji)
    setCurrent(String(g.current))
    setTarget(String(g.target))
    setUnit(g.unit ?? '')
    setNote(g.note ?? '')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="GOALS"
        title="长期目标"
        description="慢慢靠近，稳稳抵达。"
      />

      {goalsQuery.isError && <QueryError onRetry={() => goalsQuery.refetch()} />}

      {/* 添加目标 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex gap-2">
          <IconPicker value={icon} onChange={setIcon} aria-label="选择图标" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="目标名称，如：读完 24 本书"
            maxLength={200}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min="0"
            max="1000000000000"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="当前进度"
            className="w-28 tabular-nums"
          />
          <Input
            type="number"
            min="1"
            max="1000000000000"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="目标数值"
            className="w-32 tabular-nums"
          />
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="单位（本/次/公里…）"
            maxLength={200}
            className="min-w-36 flex-1"
          />
          <Button type="submit" disabled={!name.trim() || !target || Number(target) <= 0 || Number(current) < 0 || Number(current) > Number(target) || addGoal.isPending || updateGoal.isPending}>
            <Plus size={16} />
            {editingId ? '保存' : '创建'}
          </Button>
          {editingId && <IconButton type="button" onClick={resetForm} aria-label="取消编辑"><X size={16} /></IconButton>}
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（可选）" rows={2} maxLength={100000} />
      </form>

      {/* 目标列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !goals.length ? (
        <EmptyState
          icon={<Target size={22} />}
          title="还没有目标"
          description="创建一个长期目标吧。"
        />
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.current / g.target) * 100))
            const done = g.current >= g.target
            const Icon = resolveIcon(g.emoji)
            return (
              <div
                key={g.id}
                className={cn('group rounded-2xl border bg-surface p-4 transition-colors duration-150 hover:bg-hover', isDeletePending(g.id) ? 'border-danger/40 opacity-60' : 'border-border')}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nested">
                    <Icon size={18} className="text-ink-2" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{g.name}</span>
                      <span
                        className={cn(
                          'shrink-0 text-xs tabular-nums',
                          done ? 'font-medium text-m1' : 'text-ink-3'
                        )}
                      >
                        {done ? (
                          <span className="inline-flex items-center gap-0.5">
                            已完成 <Check size={12} />
                          </span>
                        ) : (
                          `${g.current}/${g.target}${g.unit ?? ''}`
                        )}
                      </span>
                    </div>
                    {g.note && <p className="mt-1 truncate text-xs text-ink-3">{g.note}</p>}
                    {isDeletePending(g.id) && <p className="mt-1 text-[10px] font-medium text-danger">待删除 {remainingSeconds(g.id)}s</p>}
                    <Progress
                      value={pct}
                      color={done ? 'bg-m1' : 'bg-m4'}
                      className="mt-2"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => adjust(g, -1)}
                      disabled={isDeletePending(g.id) || g.current <= 0}
                      aria-label="减一"
                      className="!px-2"
                    >
                      <Minus size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => adjust(g, 1)}
                      disabled={isDeletePending(g.id) || done}
                      aria-label="加一"
                      className="!px-2"
                    >
                      <Plus size={14} />
                    </Button>
                    <IconButton size="sm" onClick={() => startEdit(g)} disabled={isDeletePending(g.id)} aria-label="编辑目标" className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}>
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => void handlePin(g)}
                      disabled={togglePin.isPending || isDeletePending(g.id)}
                      aria-label={g.pinned ? '取消置顶' : '置顶'}
                      className={cn(
                        touch || g.pinned ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                        g.pinned && 'text-m3'
                      )}
                    >
                      {g.pinned ? <Pin size={15} /> : <PinOff size={15} />}
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => requestDelete(g)}
                      disabled={isDeletePending(g.id)}
                      aria-label="删除目标"
                      className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {(goalsQuery.data?.total ?? 0) > GOALS_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <IconButton onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || goalsQuery.isFetching} aria-label="上一页"><ChevronLeft size={17} /></IconButton>
          <span className="text-xs text-ink-3 tabular-nums">第 {page + 1} / {Math.ceil((goalsQuery.data?.total ?? 0) / GOALS_PAGE_SIZE)} 页</span>
          <IconButton onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * GOALS_PAGE_SIZE >= (goalsQuery.data?.total ?? 0) || goalsQuery.isFetching} aria-label="下一页"><ChevronRight size={17} /></IconButton>
        </div>
      )}
    </div>
  )
}
