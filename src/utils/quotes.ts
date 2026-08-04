/** 每日一句：按星期几轮换（周一~周日 7 条） */

export const QUOTES = [
  '新的一周，从最重要的事开始。',
  '保持节奏，像流水一样从容不迫。',
  '把大目标拆小，今天只推进一步。',
  '坚持到一半时最难，想想完成后的奖励。',
  '收个尾，给这一周画个句号。',
  '允许自己慢一点，休息好再出发。',
  '复盘这一周，理清头绪，迎接新一周。'
]

/** 今天的每日一句（周一为第 0 条） */
export function dailyQuote(): string {
  const dow = (new Date().getDay() + 6) % 7
  return QUOTES[dow % QUOTES.length]
}

/** 当前周数（自然周序号） */
export function weekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return Math.ceil((diff + start.getDay() + 1) / 7)
}
