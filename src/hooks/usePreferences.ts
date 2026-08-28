import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PomodoroPrefs, UserPreferences } from '../types'
import { useAuth } from './useAuth'
import type { PreferencesPatch } from '../utils/dataConsistency'
import { enqueueCommand } from '../lib/commands'

export const prefsKey = (userId: string | null) => ['prefs', userId] as const

export const DEFAULT_CATEGORIES: UserPreferences['categories'] = { expense: [], income: [] }

/** 番茄钟默认偏好：25 专注 / 5 短休 / 15 长休 / 4 轮长休阈值 */
export const DEFAULT_POMODORO: PomodoroPrefs = {
  focus: 25,
  break: 5,
  long_break: 15,
  rounds_per_cycle: 4
}

export function usePreferences() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: prefsKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase!.from('user_preferences').select('*').maybeSingle()
      if (error) throw error
      return (data ?? null) as UserPreferences | null
    },
    enabled: !!supabase && !!userId
  })
}

/** 新增/更新偏好（upsert，缺省字段保持现状） */
export function useUpdatePreferences() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (patch: PreferencesPatch) => {
      if (!userId) throw new Error('未登录')
      let current = qc.getQueryData<UserPreferences | null>(prefsKey(userId)) ?? null
      if (!current && navigator.onLine) {
        const { data, error } = await supabase!.from('user_preferences').select('*').maybeSingle()
        if (error) throw error
        current = data as UserPreferences | null
      }
      if (!current) throw new Error('偏好尚未同步，无法修改')
      const payload = patch as Record<string, unknown>
      const expected = Object.fromEntries(Object.keys(payload).map((key) => [key, (current as unknown as Record<string, unknown>)[key]]))
      const result = await enqueueCommand(userId, {
        kind: 'preference.update', entityId: userId, payload, expected, baseVersion: current.row_version
      })
      qc.setQueryData(prefsKey(userId), { ...current, ...patch, row_version: current.row_version + 1, _local_pending: true })
      return result.data as unknown as UserPreferences
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prefsKey(userId) })
  })
}

/** 自定义分类：合并内置 + 用户自定义，返回去重后的列表 */
export function mergeCategories(
  builtin: readonly string[],
  custom: string[] | undefined,
  extra: string[] = []
): string[] {
  return [...new Set([...builtin, ...(custom ?? []), ...extra])]
}
