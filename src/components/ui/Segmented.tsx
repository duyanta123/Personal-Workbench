import { cn } from '../../lib/cn'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
}

export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  className
}: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex rounded-xl bg-nested p-1 text-sm', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-selected={value === o.value}
          role="tab"
          className={cn(
            'rounded-lg px-3 py-1.5 font-medium transition-colors duration-150',
            value === o.value
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
