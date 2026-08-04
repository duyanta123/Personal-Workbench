export interface DonutSegment {
  label: string
  value: number
  /** 0-100 */
  pct: number
  color: string
  /** conic-gradient 累计停靠点（百分比） */
  stop: number
}

/** 饼图配色：与主题模块色一致，先绿后蓝再琥珀，末位红 */
export const DONUT_COLORS = [
  '#0d8626',
  '#0b66cc',
  '#a67500',
  '#6e6155',
  '#8aa394',
  '#7a8da3',
  '#c4a572',
  '#b8837a'
]

/** 把「分类 → 金额」转成饼图渐变分段（按金额降序传入） */
export function donutStops(catTotals: [string, number][]): DonutSegment[] {
  const total = catTotals.reduce((s, [, v]) => s + v, 0)
  let acc = 0
  return catTotals.map(([label, value], i) => {
    const pct = total ? (value / total) * 100 : 0
    acc += pct
    return { label, value, pct, color: DONUT_COLORS[i % DONUT_COLORS.length], stop: acc }
  })
}

/** 某月每日支出明细（未记账日补 0），用于柱状趋势 */
export function dailyBars(
  entries: { entry_date: string; amount: number }[],
  year: number,
  month: number
): { day: number; date: string; total: number }[] {
  const days = new Date(year, month, 0).getDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const byDay = new Map<number, number>()
  for (const e of entries) {
    if (!e.entry_date.startsWith(prefix)) continue
    const d = Number(e.entry_date.slice(8, 10))
    byDay.set(d, (byDay.get(d) ?? 0) + e.amount)
  }
  const out: { day: number; date: string; total: number }[] = []
  for (let d = 1; d <= days; d++) {
    out.push({ day: d, date: `${prefix}-${String(d).padStart(2, '0')}`, total: byDay.get(d) ?? 0 })
  }
  return out
}

/** 环比（本月 vs 上月）。上月为 0 时返回 null 表示无法比较 */
export function calcMoM(current: number, prev: number): { pct: number | null; up: boolean } {
  if (!prev) return { pct: null, up: true }
  const pct = Math.round(((current - prev) / prev) * 100)
  return { pct, up: pct >= 0 }
}
