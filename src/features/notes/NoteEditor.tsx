import { useState } from 'react'
import type { FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import type { NoteLayout } from '../../types'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Segmented from '../../components/ui/Segmented'
import MarkdownPreview from '../../components/ui/MarkdownPreview'
import { cn } from '../../lib/cn'
import { LIMITS, parseTags, renderTag } from '../../utils/validation'

export interface NoteDraft {
  title: string
  body: string
  tags: string
  layout: NoteLayout
  imageUrl: string
}

const LAYOUT_OPTIONS = [
  { value: 'default' as const, label: '标准' },
  { value: 'quote' as const, label: '引文' },
  { value: 'feature' as const, label: '大图' }
]

function TagInput({ value, onChange, allTags }: { value: string; onChange: (value: string) => void; allTags: string[] }) {
  const [highlight, setHighlight] = useState(0)
  const activeToken = (value.split(/[,，\s]+/).at(-1) ?? '').replace(/^#/, '')
  const existing = new Set(parseTags(value))
  const suggestions = activeToken ? allTags.filter((tag) => tag.startsWith(activeToken) && !existing.has(tag)).slice(0, 8) : []

  function pick(tag: string) {
    const head = value.split(/[,，\s]+/).slice(0, -1).filter(Boolean)
    onChange([...head, tag].join(', '))
    setHighlight(0)
  }

  return (
    <div className="relative min-w-48 flex-1">
      <Input
        value={value}
        onChange={(event) => { onChange(event.target.value); setHighlight(0) }}
        onKeyDown={(event) => {
          if (!suggestions.length) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((current) => (current + 1) % suggestions.length) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length) }
          else if (event.key === 'Enter') { event.preventDefault(); pick(suggestions[highlight] ?? suggestions[0]) }
        }}
        placeholder="标签，用逗号分隔（可选），输入 # 或文字获得补全"
        maxLength={LIMITS.tags * (LIMITS.tag + 1)}
        aria-label="标签"
      />
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="标签补全" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-overlay">
          {suggestions.map((tag, index) => (
            <li key={tag} role="option" aria-selected={index === highlight}>
              <button type="button" onMouseEnter={() => setHighlight(index)} onMouseDown={(event) => { event.preventDefault(); pick(tag) }} className={cn('block w-full px-3 py-1.5 text-left text-xs', index === highlight ? 'bg-hover text-ink' : 'text-ink-2')}>
                {renderTag(tag)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function NoteEditor({ form, onChange, allTags, preview, onPreviewChange, editing, busy, onSubmit, onCancel }: {
  form: NoteDraft
  onChange: (form: NoteDraft) => void
  allTags: string[]
  preview: boolean
  onPreviewChange: (value: boolean) => void
  editing: boolean
  busy: boolean
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <Input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} placeholder="标题（可选）" maxLength={LIMITS.title} />
      {preview ? (
        <div className="min-h-32 rounded-lg border border-border bg-page p-3"><MarkdownPreview source={form.body || '暂无内容'} /></div>
      ) : (
        <Textarea value={form.body} onChange={(event) => onChange({ ...form, body: event.target.value })} placeholder="写点什么：支持 Markdown、层级标签和安全链接……" rows={4} noResize maxLength={LIMITS.body} />
      )}
      <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => onPreviewChange(!preview)}>{preview ? '编辑 Markdown' : '预览 Markdown'}</Button></div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={form.layout} onChange={(layout) => onChange({ ...form, layout })} options={LAYOUT_OPTIONS} />
        {form.layout === 'feature' && <Input value={form.imageUrl} onChange={(event) => onChange({ ...form, imageUrl: event.target.value })} placeholder="图片 URL（可选）" maxLength={LIMITS.url} className="min-w-40 flex-1" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TagInput value={form.tags} onChange={(tags) => onChange({ ...form, tags })} allTags={allTags} />
        <div className="flex gap-2">
          {editing && <Button type="button" variant="ghost" onClick={onCancel}><X size={16} />取消</Button>}
          <Button type="submit" disabled={!form.body.trim() || busy}><Save size={16} />{editing ? '保存修改' : '保存'}</Button>
        </div>
      </div>
    </form>
  )
}
