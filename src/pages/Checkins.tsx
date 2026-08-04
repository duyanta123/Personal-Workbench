import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Flame, Plus, Trash2 } from 'lucide-react'
import { useAddHabit, useDeleteHabit, useHabitLogs, useHabits, useToggleHabitLog } from '../hooks/useHabits'
import { todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'
import { resolveIcon } from '../utils/icon'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import IconButton from '../components/ui/IconButton'
import IconPicker from '../components/ui/IconPicker'
import { cn } from '../lib/cn'

export default function Checkins() {
  const { data: habits, isLoading } = useHabits()
  const { data: logs } = useHabitLogs()
  const toggleLog = useToggleHabitLog()
  const addHabit = useAddHabit()
  const deleteHabit = useDeleteHabit()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('flame')

  const today = todayStr()
  const doneToday = new Set((logs ?? []).filter((l) => l.log_date === today).map((l) => l.habit_id))
  const byHabit = new Map<string, Set<string>>()
  for (const l of logs ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    addHabit.mutate({ name: n, emoji: icon || 'flame' })
    setName('')
    setIcon('flame')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="HABITS"
        title="习惯打卡"
        description="每天坚持一点点。"
      />

      {/* 添加习惯 */}
      <form onSubmit={handleAdd} className="flex gap-2 rounded-2xl border border-border bg-surface p-4">
        <IconPicker value={icon} onChange={setIcon} aria-label="选择图标" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="习惯名称，如：喝水 8 杯"
          className="flex-1"
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus size={16} />
          添加
        </Button>
      </form>

      {/* 习惯列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : !habits?.length ? (
        <EmptyState
          icon={<Flame size={22} />}
          title="还没有习惯"
          description="添加一个开始打卡吧。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((h) => {
            const done = doneToday.has(h.id)
            const streak = computeStreak(byHabit.get(h.id) ?? new Set(), today)
            const Icon = resolveIcon(h.emoji)
            return (
              <div
                key={h.id}
                className={cn(
                  'group rounded-2xl border bg-surface p-5 transition-all duration-150',
                  done ? 'border-m1/40 ring-2 ring-m1/30' : 'border-border hover:shadow-raised'
                )}
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => toggleLog.mutate(h.id)}
                    aria-label="打卡"
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-150',
                      done ? 'bg-m1/15' : 'bg-nested hover:bg-hover'
                    )}
                  >
                    <Icon size={20} className={done ? 'text-m1' : 'text-ink-2'} />
                  </button>
                  <IconButton
                    size="sm"
                    onClick={() => deleteHabit.mutate(h.id)}
                    aria-label="删除习惯"
                    className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <div className="mt-3 text-sm font-medium text-ink">{h.name}</div>
                <div className="mt-1 text-xs text-ink-3">
                  {done ? (
                    <span className="inline-flex items-center gap-0.5 font-medium text-m1">
                      今天已打卡 <Check size={12} />
                    </span>
                  ) : (
                    '今天还没打卡'
                  )}
                  <span className="mx-1">·</span>
                  <span className="tabular-nums">连续 {streak} 天</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
