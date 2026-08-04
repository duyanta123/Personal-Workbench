function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 计算最近连续打卡天数。
 * dates: 已打卡日期集合（YYYY-MM-DD）；today: 今天的日期（YYYY-MM-DD）。
 * 规则：今天已打卡则从今天往前数；今天没打卡则从昨天往前数（保持连续天数不因今天未打卡而清零）。
 */
export function computeStreak(dates: Set<string>, today: string): number {
  const t = new Date(`${today}T00:00:00`)
  if (!dates.has(fmt(t))) {
    t.setDate(t.getDate() - 1)
  }
  let streak = 0
  while (dates.has(fmt(t))) {
    streak += 1
    t.setDate(t.getDate() - 1)
  }
  return streak
}
