import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface BackupData {
  todos?: unknown[]
  habits?: unknown[]
  habit_logs?: unknown[]
  ledger_entries?: unknown[]
  goals?: unknown[]
  notes?: unknown[]
}

const TABLES = ['todos', 'habits', 'habit_logs', 'ledger_entries', 'goals', 'notes'] as const

/**
 * 导入备份：逐表插入（重新挂到当前用户，忽略原 id / user_id / 时间戳）。
 * 返回各表导入条数。
 */
export function useImportData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BackupData) => {
      const uid = (await supabase!.auth.getUser()).data.user?.id
      if (!uid) throw new Error('未登录')
      const counts: Record<string, number> = {}
      for (const table of TABLES) {
        const rows = payload[table] as Record<string, unknown>[] | undefined
        if (!Array.isArray(rows) || rows.length === 0) continue
        const clean = rows.map((r) => {
          const { id: _id, user_id: _uid, created_at: _c, updated_at: _u, ...rest } = r
          return { user_id: uid, ...rest }
        })
        const { error } = await supabase!.from(table).insert(clean)
        if (error) throw error
        counts[table] = clean.length
      }
      return counts
    },
    onSuccess: () => qc.invalidateQueries()
  })
}
