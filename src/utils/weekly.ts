import type { HabitLog } from '../types'
import { dateStr } from './date'

/** 本周周一~周日的日期数组（YYYY-MM-DD，7 项） */
export function weekDates(): string[] {
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return out
}

/** 本周每日打卡次数序列（供趋势图使用），value 为当日打卡次数 */
export function habitSeries(logs: HabitLog[]): { date: string; label: string; value: number }[] {
  const days = weekDates()
  const counts = new Map<string, number>()
  for (const l of logs) {
    counts.set(l.log_date, (counts.get(l.log_date) ?? 0) + 1)
  }
  const names = ['一', '二', '三', '四', '五', '六', '日']
  return days.map((date, i) => ({
    date,
    label: names[i],
    value: counts.get(date) ?? 0
  }))
}

/** 今天是本周第几天（周一=0） */
export function todayWeekIndex(today = dateStr()): number {
  return weekDates().indexOf(today)
}
