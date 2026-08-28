import Progress from '../../components/ui/Progress'

export default function HabitMonthOverview({ loggedDays, elapsed, rate }: { loggedDays: number; elapsed: number; rate: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">本月累计打卡</span>
        <span className="text-ink-2 tabular-nums">
          {loggedDays} / {elapsed} 天
        </span>
      </div>
      <Progress value={rate} color="bg-m2" className="mt-2" />
      <p className="mt-1 text-right text-xs text-ink-3 tabular-nums">完成率 {rate}%</p>
    </div>
  )
}
