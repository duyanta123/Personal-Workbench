import { useMemo } from 'react'
import type { BodyMetric } from '../../types'

/** 最近 30 天体重折线（纯 SVG） */
export default function WeightChart({ metrics }: { metrics: BodyMetric[] }) {
  const points = useMemo(() => {
    const list = metrics
      .filter((m) => m.weight !== null)
      .slice(-30)
      .map((m) => ({ date: m.date, weight: m.weight as number }))
    return list
  }, [metrics])

  if (points.length < 2) return null

  const W = 280
  const H = 80
  const PAD = 6
  const min = Math.min(...points.map((p) => p.weight))
  const max = Math.max(...points.map((p) => p.weight))
  const range = max - min || 1
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1)
  const y = (w: number) => H - PAD - ((w - min) / range) * (H - PAD * 2)

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label="体重趋势">
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.weight)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-m1"
        />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="2.5" className="fill-m1" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3 tabular-nums">
        <span>{points[0].date.slice(5)}</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}
