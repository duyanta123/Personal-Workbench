import { useState } from 'react'
import { Layers3, Plus, Trash2 } from 'lucide-react'
import type { TemplateKind } from '../../types'
import {
  useAddWorkbenchTemplate,
  useDeleteWorkbenchTemplate,
  useWorkbenchTemplates
} from '../../hooks/useWorkbenchArtifacts'
import { useToastStore } from '../../stores/toast'
import Button from './Button'
import IconButton from './IconButton'
import Input from './Input'
import { normalizeTemplatePayload } from '../../utils/workbenchArtifacts'

const LABELS: Record<TemplateKind, string> = {
  todo: '待办',
  habit: '习惯',
  goal: '目标',
  workout: '训练'
}

export default function EntityTemplatePanel({
  kind,
  draft,
  canSave,
  instantiate
}: {
  kind: Exclude<TemplateKind, 'todo'>
  draft: Record<string, unknown>
  canSave: boolean
  instantiate: (payload: Record<string, unknown>) => Promise<unknown>
}) {
  const templates = useWorkbenchTemplates(kind)
  const addTemplate = useAddWorkbenchTemplate()
  const deleteTemplate = useDeleteWorkbenchTemplate()
  const push = useToastStore((state) => state.push)
  const [name, setName] = useState('')

  async function save() {
    if (!name.trim() || !canSave) return
    try {
      await addTemplate.mutateAsync({ kind, name: name.trim(), payload: draft })
      setName('')
      push({ kind: 'success', message: `${LABELS[kind]}模板已保存` })
    } catch (cause) {
      push({ kind: 'error', message: cause instanceof Error ? cause.message : '模板保存失败' })
    }
  }

  async function apply(payload: Record<string, unknown>) {
    try {
      await instantiate(normalizeTemplatePayload(kind, payload))
      push({ kind: 'success', message: `已从模板创建${LABELS[kind]}` })
    } catch (cause) {
      push({ kind: 'error', message: cause instanceof Error ? cause.message : '模板实例化失败' })
    }
  }

  async function remove(id: string) {
    try { await deleteTemplate.mutateAsync(id) }
    catch { push({ kind: 'error', message: '模板删除失败' }) }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Layers3 size={15} className="text-accent" /><h2 className="text-sm font-semibold text-ink">{LABELS[kind]}模板</h2></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="模板名称" className="min-w-44 flex-1" />
        <Button size="sm" onClick={() => void save()} disabled={!name.trim() || !canSave || addTemplate.isPending}><Plus size={13} />保存当前表单</Button>
      </div>
      {(templates.data?.length ?? 0) > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {templates.data?.map((template) => (
            <li key={template.id} className="flex items-center gap-2 rounded-lg bg-nested px-2 py-1.5 text-xs">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-ink" onClick={() => void apply(template.payload)}>{template.name}</button>
              <IconButton size="sm" aria-label={`删除模板 ${template.name}`} onClick={() => void remove(template.id)} disabled={deleteTemplate.isPending}><Trash2 size={13} /></IconButton>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-xs text-ink-3">暂无模板；填写表单后可保存复用。</p>}
    </section>
  )
}
