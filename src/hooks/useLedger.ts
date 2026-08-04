import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { LedgerEntry } from '../types'

export const ledgerKey = ['ledger_entries']

export function useLedgerEntries() {
  return useQuery({
    queryKey: ledgerKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('ledger_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as LedgerEntry[]
    },
    enabled: !!supabase
  })
}

export interface NewLedgerEntry {
  kind: LedgerEntry['kind']
  category: string
  amount: number
  note: string | null
  entry_date: string
}

export function useAddLedgerEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewLedgerEntry) => {
      const { data, error } = await supabase!.from('ledger_entries').insert(input).select().single()
      if (error) throw error
      return data as LedgerEntry
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ledgerKey })
  })
}

/** 编辑账单 */
export function useUpdateLedgerEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewLedgerEntry> }) => {
      const { error } = await supabase!.from('ledger_entries').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ledgerKey })
  })
}

export function useDeleteLedgerEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('ledger_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ledgerKey })
  })
}
