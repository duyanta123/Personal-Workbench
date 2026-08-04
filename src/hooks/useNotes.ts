import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Note } from '../types'

export const notesKey = ['notes']

export function useNotes() {
  return useQuery({
    queryKey: notesKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as Note[]
    },
    enabled: !!supabase
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string | null; body: string; tags: string[]; pinned?: boolean }) => {
      const { data, error } = await supabase!
        .from('notes')
        .insert({ ...input, pinned: input.pinned ?? false })
        .select()
        .single()
      if (error) throw error
      return data as Note
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey })
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { title: string | null; body: string; tags: string[] } }) => {
      const { error } = await supabase!.from('notes').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey })
  })
}

/** 切换置顶 */
export function useTogglePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase!.from('notes').update({ pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey })
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey })
  })
}
