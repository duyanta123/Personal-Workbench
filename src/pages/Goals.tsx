import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAddGoal, useDeleteGoal, useGoals, useIncrementGoal } from '../hooks/useGoals'

export default function Goals() {
  const { data: goals, isLoading } = useGoals()
  const addGoal = useAddGoal()
  const incrementGoal = useIncrementGoal()
  const deleteGoal = useDeleteGoal()

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('')

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = Number(target)
    if (!name.trim() || !t || t <= 0) return
    addGoal.mutate({ name: name.trim(), emoji: emoji || '🎯', current: 0, target: t, unit: unit.trim() || null })
    setName('')
    setEmoji('🎯')
    setTarget('')
    setUnit('')
  }

  const inputCls =
    'rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">长期目标</h1>

      {/* 添加目标 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🎯"
            aria-label="表情"
            className={`${inputCls} w-16 text-center`}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="目标名称，如：读完 24 本书"
            className={`${inputCls} flex-1`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min="1"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="目标数值"
            className={`${inputCls} w-32`}
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="单位（本/次/公里…）"
            className={`${inputCls} flex-1 min-w-36`}
          />
          <button
            type="submit"
            disabled={!name.trim() || !target || Number(target) <= 0}
            className="rounded-xl bg-accent px-4 text-sm font-medium text-page disabled:opacity-40"
          >
            创建
          </button>
        </div>
      </form>

      {/* 目标列表 */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-3">加载中…</p>
      ) : !goals?.length ? (
        <p className="py-8 text-center text-sm text-ink-3">还没有目标，创建一个长期目标吧。</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.current / g.target) * 100))
            const done = g.current >= g.target
            return (
              <div key={g.id} className="rounded-2xl bg-card p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nested text-xl">
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{g.name}</span>
                      <span className={`shrink-0 text-xs ${done ? 'font-medium text-m1' : 'text-ink-3'}`}>
                        {done ? '已完成 ✓' : `${g.current}/${g.target}${g.unit ?? ''}`}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-nested">
                      <div
                        className={`h-full rounded-full transition-all ${done ? 'bg-m1' : 'bg-m4'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => incrementGoal.mutate(g.id)}
                      disabled={done}
                      aria-label="加一"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-2 text-base font-medium text-accent transition hover:bg-accent hover:text-page disabled:opacity-30"
                    >
                      ＋
                    </button>
                    <button
                      onClick={() => deleteGoal.mutate(g.id)}
                      aria-label="删除目标"
                      className="text-sm text-ink-3 transition hover:text-danger"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
