import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { collectIdMap, remapColumn, stripMeta } from '../utils/importData'

export interface BackupData {
  todos?: unknown[]
  habits?: unknown[]
  habit_logs?: unknown[]
  ledger_entries?: unknown[]
  goals?: unknown[]
  notes?: unknown[]
  practice_problems?: unknown[]
  workout_sessions?: unknown[]
  workout_exercises?: unknown[]
  body_metrics?: unknown[]
}

const TABLES = [
  'todos',
  'habits',
  'habit_logs',
  'ledger_entries',
  'goals',
  'notes',
  'practice_problems',
  'workout_sessions',
  'workout_exercises',
  'body_metrics'
] as const

/** 带 user_id 的插入；返回插入后的行（用于回读新 id） */
async function insertRows(
  table: string,
  rows: Record<string, unknown>[],
  uid: string
): Promise<{ id: string }[] | null> {
  if (rows.length === 0) return null
  const { data, error } = await supabase!
    .from(table)
    .insert(rows.map((r) => ({ user_id: uid, ...r })))
    .select('id')
  if (error) throw error
  return (data ?? []) as { id: string }[]
}

/**
 * 导入备份：逐表插入（重新挂到当前用户）。
 * 父表（habits / workout_sessions）先插并回读新 id，
 * 子表（habit_logs / workout_exercises）的外键重映射到新 id，
 * body_metrics 按 (user_id, date) upsert 避免主键冲突。
 */
export function useImportData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BackupData) => {
      const uid = (await supabase!.auth.getUser()).data.user?.id
      if (!uid) throw new Error('未登录')
      const counts: Record<string, number> = {}

      // 父表：习惯 / 训练会话（先插，拿到新 id 供子表重映射）
      const habitRows = payload.habits as { id: string }[] | undefined
      const habitClean = stripMeta((payload.habits ?? []) as Record<string, unknown>[])
      const insertedHabits = await insertRows('habits', habitClean, uid)
      if (insertedHabits) {
        counts.habits = habitClean.length
        const habitMap = collectIdMap(habitRows ?? [], insertedHabits)

        const logClean = remapColumn(
          stripMeta((payload.habit_logs ?? []) as Record<string, unknown>[]),
          habitMap,
          'habit_id'
        )
        if (logClean.length) {
          await insertRows('habit_logs', logClean, uid)
          counts.habit_logs = logClean.length
        }
      }

      const sessionRows = payload.workout_sessions as { id: string }[] | undefined
      const sessionClean = stripMeta((payload.workout_sessions ?? []) as Record<string, unknown>[])
      const insertedSessions = await insertRows('workout_sessions', sessionClean, uid)
      if (insertedSessions) {
        counts.workout_sessions = sessionClean.length
        const sessionMap = collectIdMap(sessionRows ?? [], insertedSessions)

        const exClean = remapColumn(
          stripMeta((payload.workout_exercises ?? []) as Record<string, unknown>[]),
          sessionMap,
          'session_id'
        )
        if (exClean.length) {
          await insertRows('workout_exercises', exClean, uid)
          counts.workout_exercises = exClean.length
        }
      }

      // 独立表
      for (const table of TABLES) {
        if (table === 'habits' || table === 'habit_logs' || table === 'workout_sessions' || table === 'workout_exercises') {
          continue
        }
        const rows = payload[table] as Record<string, unknown>[] | undefined
        if (!Array.isArray(rows) || rows.length === 0) continue
        const clean = stripMeta(rows)
        if (table === 'body_metrics') {
          // 主键 (user_id, date)：用 upsert 覆盖同日期记录，避免导入失败
          const { error } = await supabase!
            .from(table)
            .upsert(clean.map((r) => ({ user_id: uid, ...r })), { onConflict: 'user_id,date' })
          if (error) throw error
        } else {
          await insertRows(table, clean, uid)
        }
        counts[table] = clean.length
      }

      return counts
    },
    onSuccess: () => qc.invalidateQueries()
  })
}
