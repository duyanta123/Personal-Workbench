import * as Sentry from '@sentry/react'

const SENSITIVE_KEY = /(?:token|authorization|password|secret|email|body|note|amount|payload|query|text|title|signed)/i

function safeUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0]
  }
}

export function redactMonitoringValue(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return '[Filtered]'
  if (depth > 5) return '[Truncated]'
  if (typeof value === 'string') return key.toLowerCase().includes('url') ? safeUrl(value) : value.slice(0, 500)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactMonitoringValue(item, '', depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([childKey, child]) => [childKey, redactMonitoringValue(child, childKey, depth + 1)]))
  }
  return value
}

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 0,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      event.user = undefined
      event.request = event.request ? {
        method: event.request.method,
        url: event.request.url ? safeUrl(event.request.url) : undefined
      } : undefined
      event.extra = redactMonitoringValue(event.extra) as typeof event.extra
      event.contexts = redactMonitoringValue(event.contexts) as typeof event.contexts
      event.tags = redactMonitoringValue(event.tags) as typeof event.tags
      if (event.breadcrumbs) event.breadcrumbs = redactMonitoringValue(event.breadcrumbs) as typeof event.breadcrumbs
      return event
    }
  })
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.captureException(error, { extra: redactMonitoringValue(context) as Record<string, unknown> })
}
