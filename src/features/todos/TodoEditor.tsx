import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import type { Priority } from '../../types'
import { dateStr } from '../../utils/date'
import { cn } from '../../lib/cn'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Input from '../../components/ui/Input'
import Segmented from '../../components/ui/Segmented'

const LEVEL_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'high', label: '高优先级' },
  { value: 'mid', label: '中优先级' },
  { value: 'low', label: '低优先级' }
]

export default function TodoEditor({
  text, level, due, editing, busy, onTextChange, onLevelChange, onDueChange, onSubmit, onCancel
}: {
  text: string
  level: Priority
  due: string
  editing: boolean
  busy: boolean
  onTextChange: (value: string) => void
  onLevelChange: (value: Priority) => void
  onDueChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  function quickDue(offset: number | null) {
    onDueChange(offset === null ? '' : dateStr(offset))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <Input value={text} onChange={(event) => onTextChange(event.target.value)} placeholder="今天要做什么？" maxLength={1000} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={level} onChange={onLevelChange} options={LEVEL_OPTIONS} />
          <Input type="date" value={due} onChange={(event) => onDueChange(event.target.value)} aria-label="截止日期" className="w-40 tabular-nums" />
          <div className="flex items-center gap-1 text-xs">
            {[
              { label: '今天', value: 0 },
              { label: '明天', value: 1 },
              { label: '清空', value: null }
            ].map((choice) => (
              <button
                key={String(choice.value)}
                type="button"
                onClick={() => quickDue(choice.value)}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium transition-colors',
                  due === dateStr(choice.value ?? 999)
                    ? 'bg-accent-2 text-accent'
                    : 'bg-nested text-ink-2 hover:bg-hover hover:text-ink'
                )}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!text.trim() || busy}>
            <Plus size={16} />
            {editing ? '保存' : '添加'}
          </Button>
          {editing && <IconButton type="button" onClick={onCancel} aria-label="取消编辑"><X size={16} /></IconButton>}
        </div>
      </div>
    </form>
  )
}
