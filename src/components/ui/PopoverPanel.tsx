import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { cn } from '../../lib/cn'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"]):not([type="file"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

export default function PopoverPanel({
  open,
  onClose,
  title,
  rootRef,
  triggerRef,
  id,
  children,
  className,
  style
}: {
  open: boolean
  onClose: () => void
  title: string
  rootRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
  id?: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const restoreTarget = triggerRef.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const panel = panelRef.current
    const timer = window.setTimeout(() => {
      ;(panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus()
    })
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onCloseRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      restoreTarget?.focus()
    }
  }, [open, rootRef, triggerRef])

  if (!open) return null
  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn('rounded-2xl border border-border bg-surface shadow-raised', className)}
      style={style}
    >
      <h2 id={titleId} className="sr-only">{title}</h2>
      {children}
    </div>
  )
}
