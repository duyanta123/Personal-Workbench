import { Flame } from 'lucide-react'
import Ring from '../../components/ui/Ring'
import SideCard from '../../components/ui/SideCard'

interface Ranking {
  habit_id: string
  emoji: string
  name: string
  streak: number
}

export default function HabitSummary({ done, total, rankings }: { done: number; total: number; rankings: Ranking[] }) {
  const percent = total ? (done / total) * 100 : 0
  return (
    <aside className="h-fit space-y-3 lg:sticky lg:top-4">
      <SideCard title="今日打卡" icon={<Flame size={14} />}>
        <div className="flex items-center gap-4">
          <Ring value={percent} size={88} color="var(--m2)">
            <span className="text-lg font-bold tabular-nums text-ink">{done}/{total}</span>
          </Ring>
          <div className="text-xs text-ink-2">
            <div>已完成 <span className="font-bold text-ink tabular-nums">{done}</span> / {total}</div>
            <div className="mt-1 text-ink-3">完成率 {Math.round(percent)}%</div>
          </div>
        </div>
      </SideCard>
      <SideCard title="连续天数排行" icon={<Flame size={14} />}>
        {rankings.length === 0 ? <p className="py-2 text-center text-xs text-ink-3">还没有打卡记录</p> : (
          <ul className="space-y-2">
            {rankings.map((row) => (
              <li key={row.habit_id} className="flex items-center gap-2 text-xs">
                <span className="w-4 shrink-0 text-center">{row.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{row.name}</span>
                <span className="shrink-0 font-bold text-m3 tabular-nums">{row.streak} 天</span>
              </li>
            ))}
          </ul>
        )}
      </SideCard>
    </aside>
  )
}
