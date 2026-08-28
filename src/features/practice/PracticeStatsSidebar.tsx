import { Code2, Flame } from 'lucide-react'
import type { PracticeDifficulty } from '../../types'
import Ring from '../../components/ui/Ring'
import SideCard from '../../components/ui/SideCard'

interface DiffRow {
  key: PracticeDifficulty
  label: string
  color: string
  count: number
}

export default function PracticeStatsSidebar({ acRate, acCount, problemTotal, streak, todaySolved, diffRows, platformRows }: {
  acRate: number
  acCount: number
  problemTotal: number
  streak: number
  todaySolved: number
  diffRows: readonly DiffRow[]
  platformRows: [string, number][]
}) {
  return (
    <aside className="h-fit space-y-3 lg:sticky lg:top-4">
      <SideCard title="完成情况" icon={<Code2 size={14} />}>
        <div className="flex items-center gap-4">
          <Ring value={acRate} size={88} color="var(--m5)">
            <span className="text-lg font-bold tabular-nums text-ink">{acRate}%</span>
          </Ring>
          <div className="text-xs text-ink-2">
            <div>
              已 AC <span className="font-bold text-ink tabular-nums">{acCount}</span> /{' '}
              {problemTotal}
            </div>
            <div className="mt-1 text-ink-3">其余进行中或待做</div>
          </div>
        </div>
      </SideCard>
      <SideCard title="连续刷题" icon={<Flame size={14} />}>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-ink">{streak}</span>
          <span className="text-xs text-ink-2">天</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          {todaySolved > 0 ? `今日已 AC ${todaySolved} 题，继续保持` : '今天还没刷题，来一道吧'}
        </p>
      </SideCard>
      <SideCard title="难度分布" icon={<Code2 size={14} />}>
        <ul className="space-y-2">
          {diffRows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="shrink-0 text-ink-2">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.count / Math.max(1, ...diffRows.map((d) => d.count))) * 100}%`,
                    background: r.color
                  }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-ink-3 tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      </SideCard>
      <SideCard title="平台分布" icon={<Code2 size={14} />}>
        {platformRows.length === 0 ? (
          <p className="py-2 text-center text-xs text-ink-3">暂无题目</p>
        ) : (
          <ul className="space-y-2">
            {platformRows.map(([p, c]) => {
              const max = platformRows[0][1]
              return (
                <li key={p} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 truncate text-ink-2">{p}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nested">
                    <div className="h-full rounded-full bg-m2" style={{ width: `${(c / max) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-ink-3 tabular-nums">{c}</span>
                </li>
              )
            })}
          </ul>
        )}
      </SideCard>
    </aside>
  )
}
