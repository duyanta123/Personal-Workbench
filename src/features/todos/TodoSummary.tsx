import { ClipboardList } from 'lucide-react'
import Ring from '../../components/ui/Ring'
import SideCard from '../../components/ui/SideCard'

const LEVEL_ROWS = [
  { key: 'high', label: '高优先级', color: 'var(--danger)' },
  { key: 'mid', label: '中优先级', color: 'var(--m3)' },
  { key: 'low', label: '低优先级', color: 'var(--accent)' }
] as const

export default function TodoSummary({
  percent, done, total, byLevel
}: {
  percent: number
  done: number
  total: number
  byLevel: Record<'high' | 'mid' | 'low', number>
}) {
  return (
    <aside className="h-fit space-y-3 lg:sticky lg:top-4">
      <SideCard title="完成情况" icon={<ClipboardList size={14} />}>
        <div className="flex items-center gap-4">
          <Ring value={percent} size={88} color="var(--m1)">
            <span className="text-lg font-bold tabular-nums text-ink">{Math.round(percent)}%</span>
          </Ring>
          <div className="text-xs text-ink-2">
            <div>已完成 <span className="font-bold text-ink tabular-nums">{done}</span> / {total}</div>
            <div className="mt-1 text-ink-3">剩余 {total - done} 项</div>
          </div>
        </div>
      </SideCard>
      <SideCard title="优先级分布" icon={<ClipboardList size={14} />}>
        <ul className="space-y-2">
          {LEVEL_ROWS.map((row) => (
            <li key={row.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
              <span className="text-ink-2">{row.label}</span>
              <span className="ml-auto font-bold text-ink tabular-nums">{byLevel[row.key]} 项</span>
            </li>
          ))}
        </ul>
      </SideCard>
    </aside>
  )
}
