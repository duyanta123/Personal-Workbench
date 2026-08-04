import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus, Target, Trash2 } from 'lucide-react'
import { useAddGoal, useDeleteGoal, useGoals, useIncrementGoal } from '../hooks/useGoals'
import { resolveIcon } from '../utils/icon'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import IconPicker from '../components/ui/IconPicker'
import { cn } from '../lib/cn'

export default function Goals() {
  const { data: goals, isLoading } = useGoals()
  const addGoal = useAddGoal()
  const incrementGoal = useIncrementGoal()
  const deleteGoal = useDeleteGoal()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('target')
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = Number(target)
    if (!name.trim() || !t || t <= 0) return
    addGoal.mutate({ name: name.trim(), emoji: icon || 'target', current: 0, target: t, unit: unit.trim() || null })
    setName('')
    setIcon('target')
    setTarget('')
    setUnit('')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="GOALS"
        title="长期目标"
        description="慢慢靠近，稳稳抵达。"
      />

      {/* 添加目标 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex gap-2">
          <IconPicker value={icon} onChange={setIcon} aria-label="选择图标" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="目标名称，如：读完 24 本书"
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min="1"
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
            className="min-w-36 flex-1"
          />
          <Button type="submit" disabled={!name.trim() || !target || Number(target) <= 0}>
            <Plus size={16} />
            创建
          </Button>
        </div>
      </form>

      {/* 目标列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !goals?.length ? (
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
                className="group rounded-2xl border border-border bg-surface p-4 transition-colors duration-150 hover:bg-hover"
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
                      onClick={() => incrementGoal.mutate(g.id)}
                      disabled={done}
                      aria-label="加一"
                      className="!px-2"
                    >
                      <Plus size={14} />
                    </Button>
                    <IconButton
                      size="sm"
                      onClick={() => deleteGoal.mutate(g.id)}
                      aria-label="删除目标"
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
    </div>
  )
}
