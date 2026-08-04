import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'
export const THEME_KEY = 'wb-theme'
export const THEME_KEY_SIDEBAR = 'wb-sidebar-collapsed'

interface ThemeState {
  theme: ThemeMode
  resolved: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  syncSystem: () => void
  init: () => void
}

function resolve(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function apply(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#111112' : '#f8f4ed')
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolved: 'light',
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
    const resolved = resolve(theme)
    apply(resolved)
    set({ theme, resolved })
  },
  syncSystem: () => {
    if (get().theme !== 'system') return
    const resolved = resolve('system')
    apply(resolved)
    set({ resolved })
  },
  init: () => {
    let stored: ThemeMode = 'system'
    try {
      const raw = localStorage.getItem(THEME_KEY)
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw
    } catch {
      /* ignore */
    }
    const resolved = resolve(stored)
    apply(resolved)
    set({ theme: stored, resolved })
  }
}))
