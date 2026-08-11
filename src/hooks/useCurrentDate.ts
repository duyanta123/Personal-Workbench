import { useCallback, useEffect, useRef, useState } from 'react'
import { todayStr } from '../utils/date'

/**
 * A live local calendar date. It rolls over at local midnight and also checks
 * again when a suspended tab becomes visible or the window regains focus.
 */
export function useCurrentDate(): string {
  const [date, setDate] = useState(todayStr)

  useEffect(() => {
    let timer = 0
    const refresh = () => setDate((current) => {
      const next = todayStr()
      return current === next ? current : next
    })
    const scheduleMidnight = () => {
      window.clearTimeout(timer)
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(() => {
        refresh()
        scheduleMidnight()
      }, Math.max(1000, midnight.getTime() - now.getTime() + 50))
    }
    const onWake = () => {
      refresh()
      scheduleMidnight()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWake()
    }

    scheduleMidnight()
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return date
}

export function useCurrentHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    let timer = 0
    const refresh = () => setHour(new Date().getHours())
    const schedule = () => {
      window.clearTimeout(timer)
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1)
      timer = window.setTimeout(() => { refresh(); schedule() }, Math.max(1000, next.getTime() - now.getTime() + 50))
    }
    schedule()
    window.addEventListener('focus', refresh)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [])
  return hour
}

/** Date input that follows rollover until the user explicitly changes it. */
export function useTodayDateField() {
  const today = useCurrentDate()
  const previousToday = useRef(today)
  const manuallyChanged = useRef(false)
  const [value, setValueState] = useState(today)

  useEffect(() => {
    if (!manuallyChanged.current && value === previousToday.current) setValueState(today)
    previousToday.current = today
  }, [today, value])

  const setValue = useCallback((next: string) => {
    manuallyChanged.current = true
    setValueState(next)
  }, [])

  const resetToToday = useCallback(() => {
    manuallyChanged.current = false
    setValueState(today)
  }, [today])

  return { value, setValue, resetToToday, today }
}
