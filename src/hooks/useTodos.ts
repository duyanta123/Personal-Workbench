import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Priority, Todo } from '../types'

export const todosKey = ['todos']

export function useTodos() {
  return useQuery({
    queryKey: todosKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('todos')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as Todo[]
    },
    enabled: !!supabase
  })
}

export function useAddTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { text: string; level: Priority }) => {
      const { data, error } = await supabase!
        .from('todos')
        .insert({ ...input, sort_order: Date.now() })
        .select()
        .single()
      if (error) throw error
      return data as Todo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todosKey })
  })
}

export function useToggleTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase!.from('todos').update({ done }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: todosKey })
      const prev = qc.getQueryData<Todo[]>(todosKey)
      qc.setQueryData<Todo[]>(todosKey, (old) => old?.map((t) => (t.id === id ? { ...t, done } : t)))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(todosKey, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: todosKey })
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('todos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: todosKey })
  })
}
