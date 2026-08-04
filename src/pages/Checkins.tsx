import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAddHabit, useDeleteHabit, useHabitLogs, useHabits, useToggleHabitLog } from '../hooks/useHabits'
import { todayStr } from '../utils/date'
import { computeStreak } from '../utils/streak'

export default function Checkins() {
  const { data: habits, isLoading } = useHabits()
  const { data: logs } = useHabitLogs()
  const toggleLog = useToggleHabitLog()
  const addHabit = useAddHabit()
  const deleteHabit = useDeleteHabit()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✅')

  const today = todayStr()
  const doneToday = new Set((logs ?? []).filter((l) => l.log_date === today).map((l) => l.habit_id))
  const byHabit = new Map<string, Set<string>>()
  for (const l of logs ?? []) {
    const s = byHabit.get(l.habit_id) ?? new Set<string>()
    s.add(l.log_date)
    byHabit.set(l.habit_id, s)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    addHabit.mutate({ name: n, emoji: emoji || '✅' })
    setName('')
    setEmoji('✅')
  }

  const inputCls =
    'rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">习惯打卡</h1>

      {/* 添加习惯 */}
      <form onSubmit={handleAdd} className="flex gap-2 rounded-2xl bg-card p-4 shadow-card">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="😀"
          aria-label="表情"
          className={`${inputCls} w-16 text-center`}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="习惯名称，如：喝水 8 杯"
          className={`${inputCls} flex-1`}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-xl bg-accent px-4 text-sm font-medium text-page disabled:opacity-40"
        >
          添加
        </button>
      </form>

      {/* 习惯列表 */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-3">加载中…</p>
      ) : !habits?.length ? (
        <p className="py-8 text-center text-sm text-ink-3">还没有习惯，添加一个开始打卡吧。</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((h) => {
            const done = doneToday.has(h.id)
            const streak = computeStreak(byHabit.get(h.id) ?? new Set(), today)
            return (
              <div
                key={h.id}
                className={`rounded-2xl bg-card p-5 shadow-card transition ${
                  done ? 'ring-2 ring-m1/60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => toggleLog.mutate(h.id)}
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition ${
                      done ? 'bg-m1/20' : 'bg-nested'
                    }`}
                    aria-label="打卡"
                  >
                    {h.emoji}
                  </button>
                  <button
                    onClick={() => deleteHabit.mutate(h.id)}
                    aria-label="删除习惯"
                    className="text-sm text-ink-3 transition hover:text-danger"
                  >
                    🗑
                  </button>
                </div>
                <div className="mt-3 text-sm font-medium">{h.name}</div>
                <div className="mt-1 text-xs text-ink-3">
                  {done ? (
                    <span className="font-medium text-m1">今天已打卡 ✓</span>
                  ) : (
                    '今天还没打卡'
                  )}
                  {' · '}连续 {streak} 天
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
