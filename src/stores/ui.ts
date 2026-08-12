import { create } from 'zustand'

interface UiState {
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  quickCaptureOpen: boolean
  quickCaptureSource: string
  openQuickCapture: (source?: string) => void
  closeQuickCapture: () => void
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  quickCaptureOpen: false,
  quickCaptureSource: '',
  openQuickCapture: (source = '') => set({ quickCaptureOpen: true, quickCaptureSource: source }),
  closeQuickCapture: () => set({ quickCaptureOpen: false, quickCaptureSource: '' })
}))
