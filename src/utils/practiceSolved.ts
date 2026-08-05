import type { PracticeStatus } from '../types'

/** AC 类状态：视为已解决 */
const SOLVED_STATUSES: PracticeStatus[] = ['ac_solo', 'ac_hint']

export function isSolved(status: PracticeStatus): boolean {
  return SOLVED_STATUSES.includes(status)
}

export interface SolvedState {
  status: PracticeStatus
  solved_at: string | null
}

/**
 * 计算状态变更后的 solved_at：
 * - 进入 AC：原已是 AC 且有 solved_at 则保留（不因 ac_solo↔ac_hint 重置为今天），否则置为 today
 * - 离开 AC：清空
 * - 非 AC → 非 AC：保持 null
 */
export function resolveSolvedAt(
  prev: SolvedState | null,
  next: PracticeStatus,
  today: string
): string | null {
  if (isSolved(next)) {
    if (prev && isSolved(prev.status) && prev.solved_at) return prev.solved_at
    return today
  }
  return null
}
