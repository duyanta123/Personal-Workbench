import type { BodyMetric } from '../types'

/** 最新体重与相对上一次的变化（按日期升序取最后两条） */
export function weightDelta(metrics: BodyMetric[]): {
  latest: number | null
  delta: number | null
} {
  const withWeight = metrics
    .filter((metric) => metric.weight !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (withWeight.length === 0) return { latest: null, delta: null }
  const latest = withWeight[withWeight.length - 1].weight as number
  const previous = withWeight.length >= 2 ? (withWeight[withWeight.length - 2].weight as number) : latest
  return { latest, delta: Math.round((latest - previous) * 100) / 100 }
}
