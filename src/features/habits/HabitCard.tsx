import { Check, CircleSlash2, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Habit } from '../../types'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Input from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { resolveIcon } from '../../utils/icon'
import type { HabitStrengthRow } from '../../utils/habitStrength'
import HabitMonthCalendar from './HabitMonthCalendar'
import HabitStrengthDetails from './HabitStrengthDetails'

export default function HabitCard({
  habit, done, skipped, streak, logged, rate, strength, grid, today, touch,
  numericValue, onNumericValueChange, deletePending, getDeleteRemainingSeconds,
  logPending, pinPending, onRecord, onSkip, onEdit, onTogglePin, onDelete, onBackfill
}: {
  habit: Habit
  done: boolean
  skipped: boolean
  streak: number
  logged: Set<string>
  rate: number
  strength: HabitStrengthRow | undefined
  grid: (string | null)[]
  today: string
  touch: boolean
  numericValue: string
  onNumericValueChange: (value: string) => void
  deletePending: boolean
  getDeleteRemainingSeconds: () => number
  logPending: (date: string) => boolean
  pinPending: boolean
  onRecord: () => void
  onSkip: () => void
  onEdit: () => void
  onTogglePin: () => void
  onDelete: () => void
  onBackfill: (date: string) => void
}) {
  const Icon = resolveIcon(habit.emoji)
  return (
    <div
      className={cn(
        'group rounded-2xl border bg-surface p-5 transition-all duration-150',
        deletePending ? 'border-danger/40 opacity-60' : done ? 'border-m1/40 ring-2 ring-m1/30' : 'border-border hover:shadow-raised'
      )}
    >
      <div className="flex items-start justify-between">
        <button
          onClick={onRecord}
          disabled={deletePending || logPending(today)}
          aria-label="打卡"
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-150',
            done ? 'bg-m1/15' : skipped ? 'bg-m3/10' : 'bg-nested hover:bg-hover'
          )}
        >
          <Icon size={20} className={done ? 'text-m1' : skipped ? 'text-m3' : 'text-ink-2'} />
        </button>
        <div className="flex gap-0.5">
          <IconButton size="sm" onClick={onSkip} disabled={deletePending || logPending(today)} aria-label="跳过今天" title="跳过今天"><CircleSlash2 size={15} /></IconButton>
          <IconButton
            size="sm"
            onClick={onEdit}
            disabled={deletePending}
            aria-label="编辑习惯"
            className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
          >
            <Pencil size={15} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={onTogglePin}
            disabled={pinPending || deletePending}
            aria-label={habit.pinned ? '取消置顶' : '置顶'}
            className={cn(
              touch || habit.pinned ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
              habit.pinned && 'text-m3'
            )}
          >
            {habit.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </IconButton>
          <IconButton
            size="sm"
            onClick={onDelete}
            disabled={deletePending}
            aria-label="删除习惯"
            className={touch ? 'text-ink-3' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100'}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 text-sm font-medium text-ink">{habit.name}</div>
      {(habit.tracking_type ?? 'boolean') === 'numeric' && !done && !skipped && <div className="mt-2 flex items-center gap-2"><Input type="number" step="any" aria-label={`${habit.name} 本次数值`} value={numericValue} onChange={(event) => onNumericValueChange(event.target.value)} placeholder={`${habit.target_mode === 'at_most' ? '至多' : '至少'} ${habit.target_value ?? 0}`} /><Button size="sm" onClick={onRecord}>记录</Button></div>}
      {deletePending && <div className="mt-1 text-[10px] font-medium text-danger">待删除 {getDeleteRemainingSeconds()}s</div>}
      <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
        {done ? (
          <span className="inline-flex items-center gap-0.5 font-medium text-m1">
            今天已打卡 <Check size={12} />
          </span>
        ) : skipped ? '今天已跳过' : '今天还没打卡'}
        <span className="mx-0.5">·</span>
        <span className="tabular-nums">连续 {streak} 天</span>
        <span className="mx-0.5">·</span>
        <span className="tabular-nums">本月 {rate}%</span>
      </div>

      {strength && <HabitStrengthDetails strength={strength} />}

      {/* 月度日历 */}
      <HabitMonthCalendar
        grid={grid}
        today={today}
        logged={logged}
        deletePending={deletePending}
        logPending={logPending}
        onRecord={onRecord}
        onBackfill={onBackfill}
      />
    </div>
  )
}
