import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Habit, HabitLog } from '../types'

const ENABLED_KEY = 'workbench:habit-reminders:v1'
const RECEIPT_PREFIX = 'workbench:habit-reminder-receipt:v1:'

function supported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function useHabitReminders(userId: string | null, habits: Habit[], logs: HabitLog[], today: string) {
  const [enabled, setEnabled] = useState(() => supported() && localStorage.getItem(ENABLED_KEY) === '1' && Notification.permission === 'granted')
  const completed = useMemo(() => new Set(logs.filter((log) => log.log_date === today).map((log) => log.habit_id)), [logs, today])

  const check = useCallback(() => {
    if (!enabled || !userId || !supported() || Notification.permission !== 'granted') return
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    for (const habit of habits) {
      if (!habit.reminder_time || completed.has(habit.id)) continue
      const [hour, minute] = habit.reminder_time.split(':').map(Number)
      if (currentMinutes < hour * 60 + minute) continue
      const receipt = `${RECEIPT_PREFIX}${userId}:${habit.id}:${today}`
      if (localStorage.getItem(receipt)) continue
      new Notification(`习惯提醒：${habit.name}`, { body: '今天还没有记录，打开工作台完成或跳过。', tag: receipt })
      localStorage.setItem(receipt, new Date().toISOString())
    }
  }, [completed, enabled, habits, today, userId])

  useEffect(() => {
    check()
    const timer = window.setInterval(check, 60_000)
    window.addEventListener('focus', check)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  async function enable() {
    if (!supported()) throw new Error('当前浏览器不支持通知')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('通知权限未开启')
    localStorage.setItem(ENABLED_KEY, '1')
    setEnabled(true)
  }

  function disable() {
    localStorage.removeItem(ENABLED_KEY)
    setEnabled(false)
  }

  return { supported: supported(), enabled, permission: supported() ? Notification.permission : 'unsupported', enable, disable }
}
