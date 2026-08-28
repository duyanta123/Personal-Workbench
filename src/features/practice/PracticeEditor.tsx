import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { PracticeDifficulty, PracticeStatus } from '../../types'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Segmented from '../../components/ui/Segmented'
import { LIMITS } from '../../utils/validation'

export interface PracticeDraft {
  title: string
  platform: string
  difficulty: PracticeDifficulty
  status: PracticeStatus
  tags: string
  url: string
  note: string
}

const PLATFORMS = [
  { value: 'leetcode', label: 'LeetCode' }, { value: 'nowcoder', label: '牛客' },
  { value: 'luogu', label: '洛谷' }, { value: 'codeforces', label: 'Codeforces' }, { value: 'other', label: '其他' }
] as const

export default function PracticeEditor({ form, editing, busy, onChange, onSubmit, onCancel }: {
  form: PracticeDraft
  editing: boolean
  busy: boolean
  onChange: (form: PracticeDraft) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <Input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} placeholder="题目名称，例如：两数之和" maxLength={LIMITS.title} />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={form.platform} onChange={(value) => onChange({ ...form, platform: value })} options={[...PLATFORMS]} />
        <Segmented value={form.difficulty} onChange={(value) => onChange({ ...form, difficulty: value })} options={[{ value: 'easy', label: '简单' }, { value: 'medium', label: '中等' }, { value: 'hard', label: '困难' }]} />
        <Segmented value={form.status} onChange={(value) => onChange({ ...form, status: value })} options={[{ value: 'todo', label: '待做' }, { value: 'doing', label: '进行中' }, { value: 'ac_solo', label: '独立 AC' }, { value: 'ac_hint', label: '看题解 AC' }, { value: 'failed', label: '未 AC' }]} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={form.tags} onChange={(event) => onChange({ ...form, tags: event.target.value })} placeholder="标签，用逗号分隔（可选）" maxLength={LIMITS.tags * (LIMITS.tag + 1)} className="min-w-40 flex-1" />
        <Input value={form.url} onChange={(event) => onChange({ ...form, url: event.target.value })} placeholder="题目链接（可选）" maxLength={LIMITS.url} className="min-w-40 flex-1" />
        <div className="flex gap-2">{editing && <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>}<Button type="submit" disabled={!form.title.trim() || busy}><Plus size={16} />{editing ? '保存修改' : '添加'}</Button></div>
      </div>
      <Textarea value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} placeholder="解题思路或复盘（可选）" rows={3} maxLength={LIMITS.body} />
    </form>
  )
}
