import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import type { HabitTargetMode, HabitTrackingType } from '../../types'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import IconPicker from '../../components/ui/IconPicker'
import Input from '../../components/ui/Input'

export default function HabitEditor({
  name, icon, trackingType, periodDays, targetCount, targetValue, targetMode, reminderTime,
  editing, onNameChange, onIconChange, onTrackingTypeChange, onPeriodDaysChange,
  onTargetCountChange, onTargetValueChange, onTargetModeChange, onReminderTimeChange,
  onSubmit, onCancel
}: {
  name: string
  icon: string
  trackingType: HabitTrackingType
  periodDays: number
  targetCount: number
  targetValue: string
  targetMode: HabitTargetMode
  reminderTime: string
  editing: boolean
  onNameChange: (value: string) => void
  onIconChange: (value: string) => void
  onTrackingTypeChange: (value: HabitTrackingType) => void
  onPeriodDaysChange: (value: number) => void
  onTargetCountChange: (value: number) => void
  onTargetValueChange: (value: string) => void
  onTargetModeChange: (value: HabitTargetMode) => void
  onReminderTimeChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex gap-2">
        <IconPicker value={icon} onChange={onIconChange} aria-label="选择图标" />
        <Input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="习惯名称，如：喝水" maxLength={200} className="flex-1" />
        <Button type="submit" disabled={!name.trim() || (trackingType === 'numeric' && !(Number(targetValue) >= 0))}>
          <Plus size={16} />{editing ? '保存' : '添加'}
        </Button>
        {editing && <IconButton type="button" onClick={onCancel} aria-label="取消编辑"><X size={16} /></IconButton>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label htmlFor="habit-tracking-type" className="text-xs text-ink-2">类型
          <select id="habit-tracking-type" value={trackingType} onChange={(event) => onTrackingTypeChange(event.target.value as HabitTrackingType)} className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
            <option value="boolean">完成次数</option><option value="numeric">数值目标</option>
          </select>
        </label>
        <label htmlFor="habit-period-days" className="text-xs text-ink-2">周期天数
          <Input id="habit-period-days" className="mt-1" type="number" min="1" max="365" value={periodDays} onChange={(event) => onPeriodDaysChange(Number(event.target.value))} />
        </label>
        {trackingType === 'boolean' ? (
          <label htmlFor="habit-target-count" className="text-xs text-ink-2">目标次数
            <Input id="habit-target-count" className="mt-1" type="number" min="1" max="365" value={targetCount} onChange={(event) => onTargetCountChange(Number(event.target.value))} />
          </label>
        ) : <>
          <label htmlFor="habit-target-value" className="text-xs text-ink-2">目标值
            <Input id="habit-target-value" className="mt-1" type="number" step="any" value={targetValue} onChange={(event) => onTargetValueChange(event.target.value)} />
          </label>
          <label htmlFor="habit-target-mode" className="text-xs text-ink-2">判断
            <select id="habit-target-mode" value={targetMode} onChange={(event) => onTargetModeChange(event.target.value as HabitTargetMode)} className="mt-1 w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink">
              <option value="at_least">至少</option><option value="at_most">至多</option>
            </select>
          </label>
        </>}
        <label htmlFor="habit-reminder-time" className="text-xs text-ink-2">提醒时间
          <Input id="habit-reminder-time" className="mt-1" type="time" value={reminderTime} onChange={(event) => onReminderTimeChange(event.target.value)} />
        </label>
      </div>
    </form>
  )
}
