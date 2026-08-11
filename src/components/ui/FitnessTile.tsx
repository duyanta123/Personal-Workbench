import { useNavigate } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import type { WorkoutStatsSummary } from '../../hooks/useWorkbenchSummary'

const BODY_PART_LABEL: Record<string, string> = {
  chest: '胸',
  back: '背',
  leg: '腿',
  shoulder: '肩',
  arm: '手臂',
  core: '核心',
  cardio: '有氧',
  full: '全身'
}

const COLORS = ['var(--m3)', 'var(--m1)', 'var(--m2)', 'var(--m4)', 'var(--m5)']

interface FitnessTileProps {
  summary: WorkoutStatsSummary
}

/** 健身进度：本周训练次数 + 各部位训练分布（对齐模板「本周目标」进度条列表） */
export default function FitnessTile({ summary }: FitnessTileProps) {
  const navigate = useNavigate()
  const weekCount = summary.week_sessions
  const weekVol = summary.week_volume
  const parts = summary.body_parts.slice(0, 5)
  const max = Math.max(1, ...parts.map((p) => p[1]))

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Dumbbell size={15} className="text-ink-3" />
        <div className="text-sm font-extrabold text-ink">健身进度</div>
        <button
          onClick={() => navigate('/workout')}
          className="ml-auto text-xs font-bold text-accent transition-colors hover:text-accent-hover"
        >
          查看全部
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tracking-tight text-ink tabular-nums">
          {weekCount}
          <span className="text-sm font-bold text-ink-2"> 次</span>
        </span>
        <span className="text-[11px] text-ink-2 tabular-nums">本周训练 · 容量 {weekVol ? `${weekVol}kg` : '–'}</span>
      </div>

      {parts.length === 0 ? (
        <p className="mt-auto pt-4 text-center text-xs text-ink-3">还没有训练，去「健身记录」添加吧</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {parts.map(([key, count], i) => {
            const color = COLORS[i % COLORS.length]
            const pct = Math.round((count / max) * 100)
            const label = BODY_PART_LABEL[key] ?? key
            return (
              <li key={key}>
                <button
                  onClick={() => navigate('/workout')}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-0.5 text-left transition-colors duration-150 hover:bg-hover"
                >
                  <span
                    className="flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{label}部训练</span>
                    <span className="mt-0.5 block text-[11px] text-ink-2 tabular-nums">累计 {count} 次</span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-nested">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tracking-tight tabular-nums" style={{ color }}>
                    {pct}%
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
