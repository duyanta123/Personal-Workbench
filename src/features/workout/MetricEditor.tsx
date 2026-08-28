import type { FormEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { BodyMetric } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import IconButton from '../../components/ui/IconButton'

type MetricForm = { date: string; weight: string; body_fat: string; note: string }

export default function MetricEditor({
  form, editing, busy, metrics, pending, remainingSeconds, onChange, onSubmit, onCancel, onEdit, onDelete
}: {
  form: MetricForm
  editing: boolean
  busy: boolean
  metrics: BodyMetric[]
  pending: (id: string) => boolean
  remainingSeconds: (id: string) => number
  onChange: (form: MetricForm) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
  onEdit: (metric: BodyMetric) => void
  onDelete: (metric: BodyMetric) => void
}) {
  return <>
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="body-metric-date" className="mb-1 block text-[10px] text-ink-3">日期</label>
        <Input id="body-metric-date" type="date" disabled={editing} value={form.date} onChange={(event) => onChange({ ...form, date: event.target.value })} className="w-36 tabular-nums" />
      </div>
      <div>
        <label htmlFor="body-metric-weight" className="mb-1 block text-[10px] text-ink-3">体重 (kg)</label>
        <Input id="body-metric-weight" type="number" step="0.1" min="0" value={form.weight} onChange={(event) => onChange({ ...form, weight: event.target.value })} placeholder="60.0" max="1000" className="w-28 tabular-nums" />
      </div>
      <div>
        <label htmlFor="body-metric-fat" className="mb-1 block text-[10px] text-ink-3">体脂 (%)</label>
        <Input id="body-metric-fat" type="number" step="0.1" min="0" value={form.body_fat} onChange={(event) => onChange({ ...form, body_fat: event.target.value })} placeholder="15.0" max="100" className="w-28 tabular-nums" />
      </div>
      <Input value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} placeholder="备注" maxLength={100000} className="min-w-32 flex-1" />
      <Button type="submit" disabled={(!form.weight && !form.body_fat && !form.note.trim()) || busy}><Plus size={16} />{editing ? '更新' : '保存'}</Button>
      {editing && <IconButton type="button" onClick={onCancel} aria-label="取消编辑"><X size={16} /></IconButton>}
    </form>
    {metrics.length > 0 && <ul className="mt-3 divide-y divide-border border-t border-border">
      {[...metrics].slice(-8).reverse().map((metric) => {
        const waiting = pending(metric.id)
        return <li key={metric.id} className={`flex items-center gap-3 py-2 text-xs ${waiting ? 'opacity-60' : ''}`}>
          <span className="w-20 text-ink-3 tabular-nums">{metric.date.slice(5)}</span>
          <span className="text-ink">{metric.weight !== null ? `${metric.weight}kg` : '体重 -'}</span>
          <span className="text-ink-2">{metric.body_fat !== null ? `体脂 ${metric.body_fat}%` : '体脂 -'}</span>
          {metric.note && <span className="min-w-0 flex-1 truncate text-ink-3">{metric.note}</span>}
          {waiting && <span className="text-[10px] text-danger">待删除 {remainingSeconds(metric.id)}s</span>}
          <IconButton size="sm" onClick={() => onEdit(metric)} disabled={waiting} aria-label="编辑身体数据"><Pencil size={14} /></IconButton>
          <IconButton size="sm" onClick={() => onDelete(metric)} disabled={waiting} aria-label="删除身体数据"><Trash2 size={14} /></IconButton>
        </li>
      })}
    </ul>}
  </>
}
