import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ICON_CHOICES, resolveIcon } from '../../utils/icon'
import { cn } from '../../lib/cn'

interface IconPickerProps {
  /** 当前选中的图标名 */
  value: string
  /** 选中新图标时回调图标名 */
  onChange: (value: string) => void
  'aria-label'?: string
}

/** 图标选择器：点击展开图标面板，替代原 emoji 文本输入 */
export default function IconPicker({ value, onChange, 'aria-label': ariaLabel }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const Current = resolveIcon(value)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel ?? '选择图标'}
        aria-expanded={open}
        className="flex h-9 w-14 items-center justify-center gap-1 rounded-xl border border-border bg-nested text-ink transition-colors hover:bg-hover"
      >
        <Current size={16} />
        <ChevronDown size={12} className="text-ink-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-2xl border border-border bg-surface p-2 shadow-raised">
          <div className="grid grid-cols-6 gap-1">
            {ICON_CHOICES.map((name) => {
              const Icon = resolveIcon(name)
              const active = name === value
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  onClick={() => {
                    onChange(name)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink',
                    active && 'bg-m1/15 text-m1'
                  )}
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
