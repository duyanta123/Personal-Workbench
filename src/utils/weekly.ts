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

export function weekCompletionRate(completed: number, elapsedDays: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(elapsedDays) || elapsedDays <= 0) return 0
  return Math.round((Math.max(0, completed) / elapsedDays) * 100)
}
