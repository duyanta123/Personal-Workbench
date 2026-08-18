import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureException } from '../lib/monitoring'

const RELOAD_KEY = 'workbench:chunk-reload:v1'
const CHUNK_ERROR = /Loading chunk|ChunkLoadError|dynamically imported module|module script failed/i

export default class ChunkErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  private clearTimer: number | null = null

  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidMount() {
    this.clearTimer = window.setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 10_000)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { kind: CHUNK_ERROR.test(error.message) ? 'chunk_load' : 'render', componentStack: info.componentStack })
    if (!CHUNK_ERROR.test(error.message)) return
    const previous = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (!previous || Date.now() - previous > 60_000) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
    }
  }

  componentWillUnmount() {
    if (this.clearTimer !== null) window.clearTimeout(this.clearTimer)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-ink">页面资源加载失败</h1>
          <p role="alert" className="mt-2 text-sm text-ink-2">请检查网络后重新加载页面。</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">重新加载</button>
        </div>
      </main>
    )
  }
}
