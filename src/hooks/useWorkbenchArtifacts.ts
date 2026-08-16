import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createEntity, deleteEntity } from '../lib/domainCommands'
import type { EntityLink, SavedView, TemplateKind, WorkbenchTemplate } from '../types'
import { useAuth } from './useAuth'
import { normalizeSavedViewInput, normalizeTemplatePayload } from '../utils/workbenchArtifacts'

export type LinkKind = 'todo' | 'habit' | 'ledger' | 'goal' | 'note' | 'practice' | 'workout'

const artifactKey = (userId: string | null, kind: string, id?: string | null) => ['workbench_artifact', kind, userId, id ?? null] as const

export function useEntityLinks(sourceKind: LinkKind, sourceId: string | null) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: artifactKey(userId, 'links', `${sourceKind}:${sourceId ?? ''}`),
    queryFn: async () => {
      const { data, error } = await supabase!.from('entity_links').select('*').or(`and(source_kind.eq.${sourceKind},source_id.eq.${sourceId}),and(target_kind.eq.${sourceKind},target_id.eq.${sourceId})`).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as EntityLink[]
    },
    enabled: !!supabase && !!userId && !!sourceId
  })
}

export function useEntityOptions(kind: LinkKind) {
  const { userId } = useAuth()
  const table = kind === 'todo' ? 'todos' : kind === 'habit' ? 'habits' : kind === 'ledger' ? 'ledger_entries' : kind === 'goal' ? 'goals' : kind === 'note' ? 'notes' : kind === 'practice' ? 'practice_problems' : 'workout_sessions'
  const titleField = kind === 'todo' ? 'text' : kind === 'ledger' ? 'category' : kind === 'workout' ? 'body_part' : kind === 'note' || kind === 'practice' ? 'title' : 'name'
  return useQuery({
    queryKey: artifactKey(userId, 'options', kind),
    queryFn: async () => {
      const { data, error } = await supabase!.from(table).select(`id,${titleField}`).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []).map((row) => {
        const value = row as Record<string, unknown>
        return { id: String(value.id), title: String(value[titleField] ?? '无标题') }
      })
    },
    enabled: !!supabase && !!userId
  })
}

export function useAddEntityLink() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { sourceKind: LinkKind; sourceId: string; targetKind: LinkKind; targetId: string }) => {
      if (!userId) throw new Error('未登录')
      return createEntity(qc, userId, 'entity_link', { source_kind: input.sourceKind, source_id: input.sourceId, target_kind: input.targetKind, target_id: input.targetId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'links', userId] })
  })
}

export function useDeleteEntityLink() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'entity_link', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'links', userId] })
  })
}

export function useWorkbenchTemplates(kind: TemplateKind) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: artifactKey(userId, 'templates', kind),
    queryFn: async () => {
      const { data, error } = await supabase!.from('workbench_templates').select('*').eq('kind', kind).order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkbenchTemplate[]
    },
    enabled: !!supabase && !!userId
  })
}

export function useAddWorkbenchTemplate() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: { kind: TemplateKind; name: string; payload: Record<string, unknown> }) => {
      if (!userId) throw new Error('未登录')
      const name = input.name.trim()
      if (!name || name.length > 200) throw new Error('模板名称长度应为 1-200 个字符')
      return createEntity(qc, userId, 'template', { ...input, name, payload: normalizeTemplatePayload(input.kind, input.payload) })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'templates', userId] })
  })
}

export function useDeleteWorkbenchTemplate() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'template', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'templates', userId] })
  })
}

export function useSavedViews(entityKind: SavedView['entity_kind']) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: artifactKey(userId, 'saved_views', entityKind),
    queryFn: async () => {
      const { data, error } = await supabase!.from('saved_views').select('*').eq('entity_kind', entityKind).order('is_default', { ascending: false }).order('name')
      if (error) throw error
      return (data ?? []) as SavedView[]
    },
    enabled: !!supabase && !!userId
  })
}

export function useAddSavedView() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (input: Pick<SavedView, 'entity_kind' | 'name' | 'filters' | 'sort' | 'is_default'>) => {
      if (!userId) throw new Error('未登录')
      const name = input.name.trim()
      if (!name || name.length > 200) throw new Error('视图名称长度应为 1-200 个字符')
      const normalized = normalizeSavedViewInput(input.entity_kind, input.filters, input.sort)
      return createEntity(qc, userId, 'saved_view', { ...input, name, ...normalized })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'saved_views', userId] })
  })
}

export function useDeleteSavedView() {
  const qc = useQueryClient(); const { userId } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('未登录')
      return deleteEntity(qc, userId, 'saved_view', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench_artifact', 'saved_views', userId] })
  })
}
