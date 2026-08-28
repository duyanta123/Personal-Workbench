import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import IconPicker from '../../components/ui/IconPicker'
import Input, { Textarea } from '../../components/ui/Input'

export default function GoalEditor({
  name, icon, current, target, unit, note, editing, busy,
  onNameChange, onIconChange, onCurrentChange, onTargetChange, onUnitChange, onNoteChange, onSubmit, onCancel
}: {
  name: string; icon: string; current: string; target: string; unit: string; note: string; editing: boolean; busy: boolean
  onNameChange: (value: string) => void; onIconChange: (value: string) => void; onCurrentChange: (value: string) => void
  onTargetChange: (value: string) => void; onUnitChange: (value: string) => void; onNoteChange: (value: string) => void
  onSubmit: (event: FormEvent) => void; onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex gap-2">
        <IconPicker value={icon} onChange={onIconChange} aria-label="选择图标" />
        <Input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="目标名称，如：读完 24 本书" maxLength={200} className="flex-1" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input type="number" min="0" max="1000000000000" value={current} onChange={(event) => onCurrentChange(event.target.value)} placeholder="当前进度" className="w-28 tabular-nums" />
        <Input type="number" min="1" max="1000000000000" required value={target} onChange={(event) => onTargetChange(event.target.value)} placeholder="目标数值" className="w-32 tabular-nums" />
        <Input value={unit} onChange={(event) => onUnitChange(event.target.value)} placeholder="单位（本/次/公里…）" maxLength={200} className="min-w-36 flex-1" />
        <Button type="submit" disabled={!name.trim() || !target || Number(target) <= 0 || Number(current) < 0 || Number(current) > Number(target) || busy}><Plus size={16} />{editing ? '保存' : '创建'}</Button>
        {editing && <IconButton type="button" onClick={onCancel} aria-label="取消编辑"><X size={16} /></IconButton>}
      </div>
      <Textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="备注（可选）" rows={2} maxLength={100000} />
    </form>
  )
}
