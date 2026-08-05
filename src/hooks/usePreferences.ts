import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PomodoroPrefs, UserPreferences } from '../types'

export const prefsKey = ['prefs']

export const DEFAULT_CATEGORIES: UserPreferences['categories'] = { expense: [], income: [] }

/** 番茄钟默认偏好：25 专注 / 5 短休 / 15 长休 / 4 轮长休阈值 */
export const DEFAULT_POMODORO: PomodoroPrefs = {
  focus: 25,
  break: 5,
  long_break: 15,
  rounds_per_cycle: 4
}

export function usePreferences() {
  return useQuery({
    queryKey: prefsKey,
    queryFn: async () => {
      const { data, error } = await supabase!.from('user_preferences').select('*').maybeSingle()
      if (error) throw error
      return (data ?? null) as UserPreferences | null
    },
    enabled: !!supabase
  })
}

interface PrefsPatch {
  categories?: UserPreferences['categories']
  monthly_budget?: number | null
  pomodoro?: PomodoroPrefs
}

/** 新增/更新偏好（upsert，缺省字段保持现状） */
export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: PrefsPatch) => {
      const current = qc.getQueryData<UserPreferences | null>(prefsKey)
      const payload: PrefsPatch = {
        categories: patch.categories ?? current?.categories ?? DEFAULT_CATEGORIES,
        monthly_budget:
          patch.monthly_budget !== undefined ? patch.monthly_budget : (current?.monthly_budget ?? null),
        pomodoro: patch.pomodoro ?? current?.pomodoro ?? DEFAULT_POMODORO
      }
      const { data, error } = await supabase!
        .from('user_preferences')
        .upsert(payload)
        .select()
        .single()
      if (error) throw error
      return data as UserPreferences
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prefsKey })
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
