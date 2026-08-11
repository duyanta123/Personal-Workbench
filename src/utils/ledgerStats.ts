export interface DonutSegment {
  label: string
  value: number
  /** 0-100 */
  pct: number
  color: string
  /** conic-gradient 累计停靠点（百分比） */
  stop: number
}

/** 饼图配色：跟随主题令牌（m1-m5 + 扩展 m6-m9），深浅色自动切换 */
export const DONUT_COLORS = [
  'var(--m1)',
  'var(--m2)',
  'var(--m3)',
  'var(--m4)',
  'var(--m6)',
  'var(--m7)',
  'var(--m8)',
  'var(--m9)'
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
