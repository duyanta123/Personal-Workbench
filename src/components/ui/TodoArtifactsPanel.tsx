import { useEffect, useRef, useState } from 'react'
import { Bookmark, Plus, Trash2 } from 'lucide-react'
import type { Priority } from '../../types'
import { useAddTodo } from '../../hooks/useTodos'
import type { TodoDueFilter, TodoSort } from '../../hooks/useTodos'
import {
  useAddSavedView, useAddWorkbenchTemplate, useDeleteSavedView, useDeleteWorkbenchTemplate,
  useSavedViews, useWorkbenchTemplates
} from '../../hooks/useWorkbenchArtifacts'
import { dateStr } from '../../utils/date'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import IconButton from './IconButton'
import Input from './Input'
import { normalizeTemplatePayload } from '../../utils/workbenchArtifacts'

export interface TodoViewState {
  showDone: boolean
  level?: Priority
  due?: TodoDueFilter
  sort: TodoSort
}

function readView(filters: Record<string, unknown>, sort: Record<string, unknown>[]) {
  const item = sort[0]
  const column = item?.column === 'created_at' ? 'created_at' : 'sort_order'
  const direction = item?.direction === 'desc' ? 'desc' : 'asc'
  return {
    query: typeof filters.query === 'string' ? filters.query : '',
    state: {
      showDone: filters.show_done === true,
      level: filters.level === 'high' || filters.level === 'mid' || filters.level === 'low' ? filters.level : undefined,
      due: filters.due === 'overdue' || filters.due === 'today' || filters.due === 'future' || filters.due === 'none' ? filters.due : undefined,
      sort: { column, direction }
    } satisfies TodoViewState
  }
}

export default function TodoArtifactsPanel({
  draft,
  query,
  state,
  onChange,
  onApplyView
}: {
  draft: { text: string; level: Priority; due: string }
  query: string
  state: TodoViewState
  onChange: (state: TodoViewState) => void
  onApplyView: (view: { query: string; state: TodoViewState }) => void
}) {
  const templates = useWorkbenchTemplates('todo'); const savedViews = useSavedViews('todo')
  const addTemplate = useAddWorkbenchTemplate(); const deleteTemplate = useDeleteWorkbenchTemplate()
  const addView = useAddSavedView(); const deleteView = useDeleteSavedView(); const addTodo = useAddTodo()
  const push = useToastStore((state) => state.push)
  const [templateName, setTemplateName] = useState(''); const [viewName, setViewName] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const defaultApplied = useRef(false)

  useEffect(() => {
    if (defaultApplied.current || !savedViews.isSuccess) return
    defaultApplied.current = true
    const view = savedViews.data.find((item) => item.is_default)
    if (view) onApplyView(readView(view.filters, view.sort))
  }, [onApplyView, savedViews.data, savedViews.isSuccess])

  async function saveTemplate() {
    if (!templateName.trim() || !draft.text.trim()) return
    const dueOffset = draft.due ? Math.round((new Date(`${draft.due}T00:00:00`).getTime() - new Date(`${dateStr(0)}T00:00:00`).getTime()) / 86400000) : null
    try {
      await addTemplate.mutateAsync({ kind: 'todo', name: templateName.trim(), payload: { text: draft.text.trim(), level: draft.level, due_offset_days: dueOffset } })
      setTemplateName(''); push({ kind: 'success', message: '待办模板已保存' })
    } catch { push({ kind: 'error', message: '模板保存失败' }) }
  }

  async function instantiate(payload: Record<string, unknown>) {
    try {
      const normalized = normalizeTemplatePayload('todo', payload)
      const offset = typeof normalized.due_offset_days === 'number' ? normalized.due_offset_days : null
      await addTodo.mutateAsync({ text: String(normalized.text), level: normalized.level as Priority, due_date: offset === null ? null : dateStr(offset) })
      push({ kind: 'success', message: '已从模板创建待办' })
    } catch { push({ kind: 'error', message: '模板实例化失败' }) }
  }

  async function saveView() {
    if (!viewName.trim()) return
    try {
      await addView.mutateAsync({
        entity_kind: 'todo', name: viewName.trim(),
        filters: { query: query.trim(), show_done: state.showDone, ...(state.level ? { level: state.level } : {}), ...(state.due ? { due: state.due } : {}) },
        sort: [{ column: state.sort.column, direction: state.sort.direction }], is_default: makeDefault
      })
      setViewName(''); setMakeDefault(false); push({ kind: 'success', message: '视图已保存' })
    } catch { push({ kind: 'error', message: '视图保存失败' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Bookmark size={15} className="text-accent" /><h2 className="text-sm font-semibold text-ink">模板与保存视图</h2></div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex gap-2"><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="模板名称" /><Button size="sm" onClick={() => void saveTemplate()} disabled={!templateName.trim() || !draft.text.trim()}><Plus size={13} />保存当前表单</Button></div>
          <ul className="mt-2 space-y-1">{templates.data?.map((template) => <li key={template.id} className="flex items-center gap-2 rounded-lg bg-nested px-2 py-1.5 text-xs"><button className="min-w-0 flex-1 truncate text-left text-ink" onClick={() => void instantiate(template.payload)}>{template.name}</button><IconButton size="sm" aria-label="删除模板" onClick={() => void deleteTemplate.mutateAsync(template.id)}><Trash2 size={13} /></IconButton></li>)}</ul>
        </div>
        <div>
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <select aria-label="待办优先级筛选" value={state.level ?? ''} onChange={(event) => onChange({ ...state, level: event.target.value === '' ? undefined : event.target.value as Priority })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink"><option value="">全部优先级</option><option value="high">高优先级</option><option value="mid">中优先级</option><option value="low">低优先级</option></select>
            <select aria-label="待办日期筛选" value={state.due ?? ''} onChange={(event) => onChange({ ...state, due: event.target.value === '' ? undefined : event.target.value as TodoDueFilter })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink"><option value="">全部日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="future">未来</option><option value="none">无日期</option></select>
            <select aria-label="待办排序" value={`${state.sort.column}:${state.sort.direction}`} onChange={(event) => onChange({ ...state, sort: event.target.value === 'created_at:desc' ? { column: 'created_at', direction: 'desc' } : { column: 'sort_order', direction: 'asc' } })} className="rounded-lg border border-border bg-page px-3 py-2 text-sm text-ink"><option value="sort_order:asc">手动排序</option><option value="created_at:desc">最新创建</option></select>
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-page px-3 py-2 text-xs text-ink-2"><input type="checkbox" checked={state.showDone} onChange={(event) => onChange({ ...state, showDone: event.target.checked })} />包含已完成</label>
          </div>
          <div className="flex gap-2"><Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="视图名称" /><Button size="sm" onClick={() => void saveView()} disabled={!viewName.trim()}><Plus size={13} />保存筛选</Button></div>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />设为默认视图</label>
          <ul className="mt-2 space-y-1">{savedViews.data?.map((view) => <li key={view.id} className="flex items-center gap-2 rounded-lg bg-nested px-2 py-1.5 text-xs"><button className="min-w-0 flex-1 truncate text-left text-ink" onClick={() => onApplyView(readView(view.filters, view.sort))}>{view.name}{view.is_default ? ' · 默认' : ''}</button><IconButton size="sm" aria-label="删除视图" onClick={() => void deleteView.mutateAsync(view.id)}><Trash2 size={13} /></IconButton></li>)}</ul>
        </div>
      </div>
    </section>
  )
}
