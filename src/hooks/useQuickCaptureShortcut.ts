import { useEffect } from 'react'
import { useUiStore } from '../stores/ui'

export function useQuickCaptureShortcut() {
  const openQuickCapture = useUiStore((state) => state.openQuickCapture)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'k' || event.isComposing) return
      event.preventDefault()
      openQuickCapture()
      window.setTimeout(() => document.getElementById('quick-capture-source')?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickCapture])
}
