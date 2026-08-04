import { useEffect } from 'react'
import { useThemeStore } from '../stores/theme'

export function useTheme() {
  const theme = useThemeStore((s) => s.theme)
  const resolved = useThemeStore((s) => s.resolved)
  const setTheme = useThemeStore((s) => s.setTheme)

  useEffect(() => {
    useThemeStore.getState().init()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => useThemeStore.getState().syncSystem()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return {
    theme,
    resolved,
    setTheme,
    toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark')
  }
}
