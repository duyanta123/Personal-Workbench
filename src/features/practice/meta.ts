import type { PracticeDifficulty, PracticeStatus } from '../../types'

export const DIFFICULTY_META: Record<PracticeDifficulty, { label: string; variant: 'accent' | 'warning' | 'danger' }> = {
  easy: { label: '简单', variant: 'accent' },
  medium: { label: '中等', variant: 'warning' },
  hard: { label: '困难', variant: 'danger' }
}

export const STATUS_META: Record<PracticeStatus, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  todo: { label: '待做', variant: 'neutral' },
  doing: { label: '进行中', variant: 'warning' },
  ac_solo: { label: '独立 AC', variant: 'success' },
  ac_hint: { label: '看题解 AC', variant: 'success' },
  failed: { label: '未 AC', variant: 'danger' }
}
