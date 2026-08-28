const POSTPONE_OPTIONS = [
  { days: 1, label: '1 天' },
  { days: 7, label: '1 周' },
  { days: 30, label: '1 月' }
] as const

export default function TodoPostponePanel({ pending, onPostpone }: {
  pending: boolean
  onPostpone: (days: number, label: string) => void
}) {
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-border bg-nested px-4 py-3 text-xs text-ink-2">
      <span className="font-semibold text-ink">顺延</span>
      {POSTPONE_OPTIONS.map((option) => (
        <button
          key={option.days}
          type="button"
          disabled={pending}
          onClick={() => onPostpone(option.days, option.label)}
          className="rounded-full bg-surface px-2.5 py-1 font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {option.label}
        </button>
      ))}
    </li>
  )
}
