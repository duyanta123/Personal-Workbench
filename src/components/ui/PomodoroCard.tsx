import { useEffect, useState } from 'react'
import { Check, Settings2, X } from 'lucide-react'
import { usePomodoroStats, useSavePomodoro } from '../../hooks/usePomodoro'
import { usePreferences, DEFAULT_POMODORO, useUpdatePreferences } from '../../hooks/usePreferences'
import { useTodos, useToggleTodo } from '../../hooks/useTodos'
import { useToastStore } from '../../stores/toast'
import { todayStr } from '../../utils/date'
import type { PomodoroPrefs } from '../../types'
import Ring from './Ring'
import Button from './Button'
import { cn } from '../../lib/cn'

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

type Mode = 'focus' | 'break'

/** 深色卡片内的分段选择器（与卡片配色协调） */
function DarkSeg({
  value,
  onChange,
  options
}: {
  value: number
  onChange: (v: number) => void
  options: { value: number; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(245,240,232,.08)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150',
            value === o.value ? 'bg-[#f5f0e8] text-[#2a1a0a]' : 'text-[#f5f0e8]/60 hover:text-[#f5f0e8]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 番茄钟：可调时长 / 长休息 / 跳过 / 关联今日待办，完成专注写入当日统计 */
export default function PomodoroCard() {
  const { data: stats } = usePomodoroStats()
  const save = useSavePomodoro()
  const { data: prefs } = usePreferences()
  const updatePrefs = useUpdatePreferences()
  const { data: todos } = useTodos()
  const toggleTodo = useToggleTodo()
  const push = useToastStore((s) => s.push)

  const pref = prefs?.pomodoro ?? DEFAULT_POMODORO
  const focusSec = pref.focus * 60
  const breakSec = pref.break * 60
  const longBreakSec = pref.long_break * 60
  const roundsPerCycle = Math.max(1, pref.rounds_per_cycle)

  const [mode, setMode] = useState<Mode>('focus')
  const [remain, setRemain] = useState(focusSec)
  const [running, setRunning] = useState(false)
  // 本轮周期内已连续完成的专注轮数（决定是否进入长休）
  const [cycleCount, setCycleCount] = useState(0)
  // 当前休息是否为长休息
  const [isLongBreak, setIsLongBreak] = useState(false)
  // 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<PomodoroPrefs>(pref)
  // 关联待办（会话级）
  const [focusTodoId, setFocusTodoId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const total = mode === 'focus' ? focusSec : isLongBreak ? longBreakSec : breakSec
  const elapsedPct = total ? Math.round(((total - remain) / total) * 100) : 0

  // 偏好（异步加载 / 保存后）变化时，非运行状态同步倒计时
  useEffect(() => {
    if (running) return
    setRemain(mode === 'focus' ? focusSec : isLongBreak ? longBreakSec : breakSec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSec, breakSec, longBreakSec, mode, isLongBreak])

  useEffect(() => {
    if (!running || remain > 0) return
    if (mode === 'focus') {
      const next = cycleCount + 1
      const long = next % roundsPerCycle === 0
      setCycleCount(next)
      setIsLongBreak(long)
      save.mutate({
        count: (stats?.count ?? 0) + 1,
        minutes: (stats?.minutes ?? 0) + pref.focus
      })
      push({ kind: 'success', message: long ? '专注完成，进入长休息' : '专注完成，休息片刻' })
      setMode('break')
      setRemain(long ? longBreakSec : breakSec)
    } else {
      if (isLongBreak) setCycleCount(0)
      push({ kind: 'info', message: '休息结束，开始下一轮专注' })
      setMode('focus')
      setRemain(focusSec)
    }
    setRunning(false)
  }, [running, remain, mode, cycleCount, isLongBreak, roundsPerCycle, focusSec, breakSec, longBreakSec, pref.focus, stats, save, push])

  function toggle() {
    if (!running && remain === 0) setRemain(total)
    setRunning((r) => !r)
  }

  function reset() {
    setRunning(false)
    setRemain(total)
  }

  /** 跳过当前阶段：不计入统计，切换阶段 */
  function skip() {
    setRunning(false)
    if (mode === 'focus') {
      setIsLongBreak(false)
      setMode('break')
      setRemain(breakSec)
      push({ kind: 'info', message: '已跳过专注，开始休息' })
    } else {
      if (isLongBreak) setCycleCount(0)
      setMode('focus')
      setRemain(focusSec)
      push({ kind: 'info', message: '已跳过休息，开始专注' })
    }
  }

  function openSettings() {
    setDraft(pref)
    setSettingsOpen(true)
  }

  function saveSettings() {
    updatePrefs.mutate({ pomodoro: draft })
    push({ kind: 'success', message: '已保存番茄钟设置' })
    setSettingsOpen(false)
    setRunning(false)
    setMode('focus')
    setIsLongBreak(false)
    setRemain(draft.focus * 60)
  }

  // 今日未完成待办（无日期视为今天，与 Todos 页分组一致）
  const today = todayStr()
  const todayTodos = (todos ?? []).filter(
    (t) => !t.done && (t.due_date === today || t.due_date === null)
  )
  const focusTodo = focusTodoId ? todos?.find((t) => t.id === focusTodoId) : undefined

  function completeTodo() {
    if (!focusTodoId) return
    toggleTodo.mutate({ id: focusTodoId, done: true })
    push({ kind: 'success', message: '待办已完成' })
    setFocusTodoId(null)
    setPickerOpen(false)
  }

  const count = stats?.count ?? 0
  const minutes = stats?.minutes ?? 0

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl p-5 text-center shadow-card"
      style={{ background: 'var(--grad-dark)', color: 'var(--ink-on-dark)' }}
    >
      <div className="pointer-events-none absolute -top-14 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-danger/20 blur-2xl" />
      <div className="relative flex items-start">
        <div className="text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ opacity: 0.55 }}>
            Pomodoro · {pref.focus} / {pref.break}
          </div>
          <div className="mt-0.5 text-sm font-bold">专注番茄钟</div>
        </div>
        <button
          onClick={openSettings}
          aria-label="番茄钟设置"
          className="ml-auto rounded-lg p-1.5 transition-colors duration-150 hover:bg-white/10"
        >
          <Settings2 size={15} style={{ opacity: 0.7 }} />
        </button>
      </div>

      {/* 设置面板 */}
      {settingsOpen && (
        <div className="relative mt-3 space-y-3 rounded-2xl p-3 text-left" style={{ background: 'rgba(245,240,232,.06)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">时长设置</span>
            <button onClick={() => setSettingsOpen(false)} aria-label="关闭设置" className="rounded-md p-1 hover:bg-white/10">
              <X size={14} style={{ opacity: 0.7 }} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>专注（分钟）</span>
            <DarkSeg
              value={draft.focus}
              onChange={(v) => setDraft({ ...draft, focus: v })}
              options={[15, 25, 45].map((v) => ({ value: v, label: `${v}` }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>短休（分钟）</span>
            <DarkSeg
              value={draft.break}
              onChange={(v) => setDraft({ ...draft, break: v })}
              options={[5, 10, 15].map((v) => ({ value: v, label: `${v}` }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>长休（分钟）</span>
            <DarkSeg
              value={draft.long_break}
              onChange={(v) => setDraft({ ...draft, long_break: v })}
              options={[10, 15, 20, 30].map((v) => ({ value: v, label: `${v}` }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>长休轮次</span>
            <DarkSeg
              value={draft.rounds_per_cycle}
              onChange={(v) => setDraft({ ...draft, rounds_per_cycle: v })}
              options={[2, 3, 4].map((v) => ({ value: v, label: `${v} 轮` }))}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={saveSettings} className="w-full">
            保存设置
          </Button>
        </div>
      )}

      <div className="relative mx-auto my-4">
        <Ring value={elapsedPct} size={148} stroke={8} color="#d4953a" track="rgba(245,240,232,.14)">
          <div className="text-[30px] font-bold tabular-nums leading-none">{fmt(remain)}</div>
          <div className="mt-1 text-[11px]" style={{ opacity: 0.6 }}>
            {running ? (mode === 'focus' ? '专注中' : isLongBreak ? '长休息中' : '休息中') : mode === 'focus' ? '保持专注' : isLongBreak ? '长休息' : '准备专注'}
          </div>
        </Ring>
      </div>

      <div className="relative flex justify-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggle}
          className={cn(running && 'bg-white text-[#3a2a1a]')}
        >
          {running ? '暂停' : '开始'}
        </Button>
        <Button variant="secondary" size="sm" onClick={skip}>
          跳过
        </Button>
        <Button variant="secondary" size="sm" onClick={reset}>
          重置
        </Button>
      </div>

      {/* 关联今日待办 */}
      <div className="relative mt-3 rounded-xl px-2 py-2 text-left" style={{ background: 'rgba(245,240,232,.07)' }}>
        {focusTodo ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs" style={{ opacity: 0.85 }}>
              {focusTodo.text}
            </span>
            <button
              onClick={completeTodo}
              aria-label="完成该待办"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-150 hover:bg-white/20"
              style={{ background: 'rgba(52,199,89,.35)' }}
            >
              <Check size={13} strokeWidth={3} />
            </button>
            <button
              onClick={() => setPickerOpen((p) => !p)}
              aria-label="更换待办"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-white/10"
              style={{ opacity: 0.6 }}
            >
              更换
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPickerOpen((p) => !p)}
            className="w-full text-left text-xs transition-colors hover:opacity-80"
            style={{ opacity: 0.6 }}
          >
            ＋ 关联今日待办
          </button>
        )}
        {pickerOpen && (
          <div className="mt-1.5 border-t border-white/10 pt-1.5">
            {todayTodos.length === 0 ? (
              <p className="py-1 text-center text-[10px]" style={{ opacity: 0.5 }}>
                今天没有待办
              </p>
            ) : (
              <ul className="max-h-32 divide-y divide-white/10 overflow-auto">
                {todayTodos.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        setFocusTodoId(t.id)
                        setPickerOpen(false)
                        push({ kind: 'info', message: '已关联待办，开始专注' })
                      }}
                      className="w-full truncate px-1 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
                    >
                      {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl px-1 py-2" style={{ background: 'rgba(245,240,232,.07)' }}>
          <div className="text-base font-bold tabular-nums">{count}</div>
          <div className="text-[10px]" style={{ opacity: 0.55 }}>
            今日番茄
          </div>
        </div>
        <div className="rounded-xl px-1 py-2" style={{ background: 'rgba(245,240,232,.07)' }}>
          <div className="text-base font-bold tabular-nums">{minutes}</div>
          <div className="text-[10px]" style={{ opacity: 0.55 }}>
            专注分钟
          </div>
        </div>
        <div className="rounded-xl px-1 py-2" style={{ background: 'rgba(245,240,232,.07)' }}>
          <div className="text-base font-bold tabular-nums">
            {mode === 'focus' ? pref.focus : isLongBreak ? pref.long_break : pref.break}
          </div>
          <div className="text-[10px]" style={{ opacity: 0.55 }}>
            {mode === 'focus' ? `第 ${cycleCount + 1} 轮` : isLongBreak ? '长休' : '短休'}
          </div>
        </div>
      </div>
    </div>
  )
}
