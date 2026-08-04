/** 构建某月日历网格（周一起始），返回 7 列扁平数组，null 表示空位 */
export function buildMonthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // getDay(): 周日=0 … 周六=6；转成周一起始偏移（周一=0）
  const startOffset = (first.getDay() + 6) % 7
  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** 判断某年月是否为未来月份 */
function isFutureMonth(year: number, month: number, today: string): boolean {
  const t = today.slice(0, 7)
  const cur = `${year}-${String(month).padStart(2, '0')}`
  return cur > t
}

/**
 * 当月打卡完成率（0-100）。
 * logged: 已打卡日期集合；当月以"今天已过的天数"为分母，过去月份以整月为分母，未来月份为 0。
 */
export function monthCompletion(
  logged: Set<string>,
  year: number,
  month: number,
  today: string
): number {
  if (isFutureMonth(year, month, today)) return 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const inCurrentMonth = today.slice(0, 7) === prefix
  const elapsed = inCurrentMonth ? Math.min(Number(today.slice(8, 10)), daysInMonth) : daysInMonth
  if (elapsed <= 0) return 0
  let done = 0
  for (const d of logged) {
    if (d.startsWith(prefix) && Number(d.slice(8, 10)) <= elapsed) done++
  }
  return Math.round((done / elapsed) * 100)
}
