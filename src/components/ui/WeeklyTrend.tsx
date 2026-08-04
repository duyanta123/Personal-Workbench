import { useId } from 'react'

export interface TrendPoint {
  date: string
  label: string
  value: number
}

interface WeeklyTrendProps {
  series: TrendPoint[]
  unit?: string
  title?: string
}

/** 近 7 天折线 + 面积趋势图 */
export default function WeeklyTrend({ series, unit = '次', title = '本周打卡趋势' }: WeeklyTrendProps) {
  const gid = useId()
  const n = series.length
  const w = 600
  const h = 150
  const pad = 12
  const maxV = Math.max(1, ...series.map((s) => s.value))
  const px = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const py = (v: number) => h - pad - (v / maxV) * (h - pad * 2)

  const line = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(s.value).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${px(n - 1).toFixed(1)},${h} L${px(0).toFixed(1)},${h} Z`
  const has = series.some((s) => s.value > 0)
  const avg = n ? Math.round(series.reduce((a, s) => a + s.value, 0) / n) : 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-ink">{title}</div>
          <div className="mt-0.5 text-[10px] text-ink-3">近 7 天 · 每日完成情况</div>
        </div>
        {has && (
          <span className="text-xs text-ink-3 tabular-nums">
            日均 <span className="font-bold text-ink">{avg}</span> {unit}
          </span>
        )}
      </div>
      {!has ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-ink-3">
          <span className="text-xs">本周还没有打卡数据</span>
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {series.map((s, i) =>
              s.value > 0 ? (
                <circle key={s.date} cx={px(i)} cy={py(s.value)} r="3.2" fill="var(--accent)" />
              ) : null
            )}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-ink-3">
            {series.map((s) => (
              <span key={s.date}>{s.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
