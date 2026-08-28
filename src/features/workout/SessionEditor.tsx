import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Segmented from '../../components/ui/Segmented'
import IconButton from '../../components/ui/IconButton'

export default function SessionEditor({ form, bodyParts, editing, busy, onChange, onSubmit, onCancel }: {
  form: { date: string; body_part: string; duration: string; note: string }
  bodyParts: Array<{ value: string; label: string }>
  editing: boolean
  busy: boolean
  onChange: (form: { date: string; body_part: string; duration: string; note: string }) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Input type="date" value={form.date} onChange={(event) => onChange({ ...form, date: event.target.value })} aria-label="训练日期" className="w-40 tabular-nums" /><Input type="number" min="0" value={form.duration} onChange={(event) => onChange({ ...form, duration: event.target.value })} placeholder="时长（分钟）" max="1440" className="w-32 tabular-nums" /></div><div className="flex gap-2"><Button type="submit" disabled={busy}><Plus size={16} />{editing ? '保存训练' : '添加训练'}</Button>{editing && <IconButton type="button" onClick={onCancel} aria-label="取消编辑"><X size={16} /></IconButton>}</div></div>
      <Segmented value={form.body_part} onChange={(value) => onChange({ ...form, body_part: value })} options={bodyParts} />
      <Textarea value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} placeholder="训练备注（可选）" rows={2} maxLength={100000} />
    </form>
  )
}
