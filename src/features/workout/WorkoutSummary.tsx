import { cn } from '../../lib/cn'

export default function WorkoutSummary({ weekCount, weekVolume, latest, delta }: { weekCount: number; weekVolume: number; latest: number | null; delta: number | null }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-2xl border border-border bg-surface p-4"><div className="text-xs text-ink-3">本周训练</div><div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{weekCount} 次</div></div>
      <div className="rounded-2xl border border-border bg-surface p-4"><div className="text-xs text-ink-3">本周容量</div><div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{weekVolume ? `${weekVolume}kg` : '–'}</div></div>
      <div className="rounded-2xl border border-border bg-surface p-4"><div className="text-xs text-ink-3">最新体重</div><div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{latest ? `${latest}kg` : '–'}</div>{delta !== null && latest !== null && <div className={cn('mt-0.5 text-xs tabular-nums', delta === 0 ? 'text-ink-3' : delta < 0 ? 'text-m1' : 'text-m3')}>{delta > 0 ? `+${delta}` : delta} kg</div>}</div>
    </div>
  )
}
