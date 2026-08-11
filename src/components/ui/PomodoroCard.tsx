import { useEffect, useId, useRef, useState } from 'react'
import { Check, Settings2, X } from 'lucide-react'
import { useCompletePomodoro, usePomodoroStats } from '../../hooks/usePomodoro'
import { usePreferences, DEFAULT_POMODORO, useUpdatePreferences } from '../../hooks/usePreferences'
import { useTodayTodos, useToggleTodo } from '../../hooks/useTodos'
import { useToastStore } from '../../stores/toast'
import type { PomodoroPrefs } from '../../types'
import Ring from './Ring'
import Button from './Button'
import { cn } from '../../lib/cn'
import { useAuth } from '../../hooks/useAuth'
import {
  loadPomodoroRuntime,
  localDateAt,
  pomodoroRuntimeKey,
  remainingSeconds
} from '../../utils/pomodoroRuntime'
import type { PomodoroMode, PomodoroRuntime } from '../../utils/pomodoroRuntime'
import { useCurrentDate } from '../../hooks/useCurrentDate'
import PopoverPanel from './PopoverPanel'

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

/** 深色卡片内的分段选择器（与卡片配色协调） */
function DarkSeg({
  value,
  onChange,
  options,
  label
}: {
  value: number
  onChange: (v: number) => void
  options: { value: number; label: string }[]
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl p-1" style={{ background: 'rgba(245,240,232,.08)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
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
function PomodoroCardContent({ userId }: { userId: string | null }) {
  const currentDate = useCurrentDate()
  const { data: stats } = usePomodoroStats(currentDate)
  const completePomodoro = useCompletePomodoro()
  const { data: prefs } = usePreferences()
  const updatePrefs = useUpdatePreferences()
  const { data: todayTodos, isSuccess: todosLoaded } = useTodayTodos(currentDate)
  const toggleTodo = useToggleTodo()
  const push = useToastStore((s) => s.push)

  const pref = prefs?.pomodoro ?? DEFAULT_POMODORO
  const focusSec = pref.focus * 60
  const breakSec = pref.break * 60
  const longBreakSec = pref.long_break * 60
  const roundsPerCycle = Math.max(1, pref.rounds_per_cycle)
  const initial = useRef(loadPomodoroRuntime(localStorage, userId, focusSec)).current

  const [mode, setMode] = useState<PomodoroMode>(initial.mode)
  const [remain, setRemain] = useState(initial.remain)
  const [running, setRunning] = useState(initial.running)
  const [deadline, setDeadline] = useState<number | null>(initial.deadline)
  const [plannedSeconds, setPlannedSeconds] = useState(initial.plannedSeconds)
  const [completionDate, setCompletionDate] = useState<string | null>(initial.completionDate)
  const [completionOperationId, setCompletionOperationId] = useState<string | null>(initial.completionOperationId)
  // 本轮周期内已连续完成的专注轮数（决定是否进入长休）
  const [cycleCount, setCycleCount] = useState(initial.cycleCount)
  const [cycleDate, setCycleDate] = useState(initial.cycleDate)
  // 当前休息是否为长休息
  const [isLongBreak, setIsLongBreak] = useState(initial.isLongBreak)
  // 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<PomodoroPrefs>(pref)
  // 关联待办（会话级）
  const [focusTodoId, setFocusTodoId] = useState<string | null>(initial.focusTodoId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const settingsRootRef = useRef<HTMLDivElement>(null)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const pickerRootRef = useRef<HTMLDivElement>(null)
  const pickerTriggerRef = useRef<HTMLButtonElement>(null)
  const settingsPanelId = useId()
  const pickerPanelId = useId()
  const completing = useRef(false)
  const attemptedCompletion = useRef<string | null>(null)
  const prefsHydrated = useRef(false)

  const defaultTotal = mode === 'focus' ? focusSec : isLongBreak ? longBreakSec : breakSec
  const total = plannedSeconds || defaultTotal
  const elapsedPct = total ? Math.round(((total - remain) / total) * 100) : 0

  // 首次加载偏好时，只初始化没有本地运行记录的计时器。
  useEffect(() => {
    if (prefs === undefined || prefsHydrated.current) return
    prefsHydrated.current = true
    if (!initial.restored && !running) {
      const seconds = mode === 'focus' ? focusSec : isLongBreak ? longBreakSec : breakSec
      setRemain(seconds)
      setPlannedSeconds(seconds)
    }
  }, [prefs, initial.restored, running, mode, focusSec, breakSec, longBreakSec, isLongBreak])

  useEffect(() => {
    if (!running || !deadline) return
    const tick = () => setRemain(remainingSeconds(deadline))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [running, deadline])

  useEffect(() => {
    if (!userId) return
    const value: PomodoroRuntime = {
      version: 3,
      mode,
      remain,
      running,
      deadline,
      plannedSeconds,
      completionDate,
      completionOperationId,
      cycleCount,
      cycleDate,
      isLongBreak,
      focusTodoId
    }
    localStorage.setItem(pomodoroRuntimeKey(userId), JSON.stringify(value))
  }, [userId, mode, remain, running, deadline, plannedSeconds, completionDate, completionOperationId, cycleCount, cycleDate, isLongBreak, focusTodoId])

  useEffect(() => {
    if (running || completionOperationId || cycleDate === currentDate) return
    setMode('focus')
    setRemain(focusSec)
    setPlannedSeconds(focusSec)
    setCompletionDate(null)
    setDeadline(null)
    setCycleCount(0)
    setCycleDate(currentDate)
    setIsLongBreak(false)
  }, [running, completionOperationId, cycleDate, currentDate, focusSec])

  useEffect(() => {
    if (!todosLoaded || !focusTodoId) return
    if (!(todayTodos ?? []).some((todo) => todo.id === focusTodoId)) setFocusTodoId(null)
  }, [todosLoaded, todayTodos, focusTodoId])

  useEffect(() => {
    if (remain > 0 || !completionDate || completing.current) return
    if (mode === 'focus' && completionOperationId && attemptedCompletion.current === completionOperationId) return
    completing.current = true
    setRunning(false)
    setDeadline(null)

    if (mode === 'focus') {
      const operationId = completionOperationId ?? crypto.randomUUID()
      if (!completionOperationId) setCompletionOperationId(operationId)
      attemptedCompletion.current = operationId
      const minutes = Math.max(1, Math.round(plannedSeconds / 60))
      void completePomodoro.mutateAsync({ date: completionDate, minutes, operationId })
        .then(() => {
          const next = (cycleDate === completionDate ? cycleCount : 0) + 1
          const long = next % roundsPerCycle === 0
          const nextSeconds = long ? longBreakSec : breakSec
          setCycleCount(next)
          setCycleDate(completionDate)
          setIsLongBreak(long)
          setMode('break')
          setRemain(nextSeconds)
          setPlannedSeconds(nextSeconds)
          setCompletionDate(null)
          setCompletionOperationId(null)
          attemptedCompletion.current = null
          push({ kind: 'success', message: long ? '专注完成，进入长休息' : '专注完成，休息片刻' })
        })
        .catch(() => push({ kind: 'error', message: '专注完成事件尚未保存，请恢复联网后重试' }))
        .finally(() => { completing.current = false })
      return
    }

    if (cycleDate !== completionDate || isLongBreak) setCycleCount(0)
    setCycleDate(completionDate)
    setMode('focus')
    setRemain(focusSec)
    setPlannedSeconds(focusSec)
    setCompletionDate(null)
    setCompletionOperationId(null)
    attemptedCompletion.current = null
    push({ kind: 'info', message: '休息结束，开始下一轮专注' })
    completing.current = false
  }, [remain, mode, completionDate, completionOperationId, plannedSeconds, cycleCount, cycleDate, isLongBreak, roundsPerCycle, focusSec, breakSec, longBreakSec, completePomodoro, push])

  function toggle() {
    if (running) {
      const left = deadline ? remainingSeconds(deadline) : remain
      setRemain(left)
      setDeadline(null)
      setRunning(false)
      return
    }
    const next = remain === 0 ? defaultTotal : remain
    const nextPlanned = remain === 0 ? defaultTotal : plannedSeconds || defaultTotal
    const nextDeadline = Date.now() + next * 1000
    setRemain(next)
    setPlannedSeconds(nextPlanned)
    setDeadline(nextDeadline)
    setCompletionDate(localDateAt(nextDeadline))
    if (mode === 'focus' && !completionOperationId) setCompletionOperationId(crypto.randomUUID())
    setRunning(true)
  }

  function reset() {
    setRunning(false)
    setDeadline(null)
    setMode('focus')
    setRemain(focusSec)
    setPlannedSeconds(focusSec)
    setCompletionDate(null)
    setCompletionOperationId(null)
    attemptedCompletion.current = null
    setCycleCount(0)
    setCycleDate(currentDate)
    setIsLongBreak(false)
  }

  useEffect(() => {
    const onRestoreReset = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) {
        reset()
        setFocusTodoId(null)
        setPickerOpen(false)
      }
    }
    window.addEventListener('workbench:pomodoro-reset', onRestoreReset)
    return () => window.removeEventListener('workbench:pomodoro-reset', onRestoreReset)
  })

  /** 跳过当前阶段：不计入统计，切换阶段 */
  function skip() {
    setRunning(false)
    setDeadline(null)
    setCompletionDate(null)
    setCompletionOperationId(null)
    if (mode === 'focus') {
      if (cycleDate !== currentDate) {
        setCycleCount(0)
        setCycleDate(currentDate)
      }
      setIsLongBreak(false)
      setMode('break')
      setRemain(breakSec)
      setPlannedSeconds(breakSec)
      push({ kind: 'info', message: '已跳过专注，开始休息' })
    } else {
      if (cycleDate !== currentDate || isLongBreak) setCycleCount(0)
      setCycleDate(currentDate)
      setMode('focus')
      setRemain(focusSec)
      setPlannedSeconds(focusSec)
      push({ kind: 'info', message: '已跳过休息，开始专注' })
    }
  }

  function openSettings() {
    setDraft(pref)
    setSettingsOpen(true)
  }

  async function saveSettings() {
    try {
      await updatePrefs.mutateAsync({ pomodoro: draft })
      push({ kind: 'success', message: '已保存番茄钟设置' })
      setSettingsOpen(false)
    } catch {
      push({ kind: 'error', message: '番茄钟设置保存失败，请重试' })
    }
  }

  // 今日未完成待办（无日期视为今天，与 Todos 页分组一致）
  const focusTodo = focusTodoId ? todayTodos?.find((t) => t.id === focusTodoId) : undefined

  async function completeTodo() {
    if (!focusTodoId) return
    try {
      await toggleTodo.mutateAsync({ id: focusTodoId, done: true })
      push({ kind: 'success', message: '待办已完成' })
      setFocusTodoId(null)
      setPickerOpen(false)
    } catch {
      push({ kind: 'error', message: '待办更新失败，请重试' })
    }
  }

  const count = stats?.count ?? 0
  const minutes = stats?.minutes ?? 0

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl p-5 text-center shadow-card"
      style={{ background: 'var(--grad-dark)', color: 'var(--ink-on-dark)' }}
    >
      <div className="pointer-events-none absolute -top-14 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-danger/20 blur-2xl" />
      <div ref={settingsRootRef} className="relative">
        <div className="flex items-start">
          <div className="text-left">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ opacity: 0.55 }}>
              Pomodoro · {pref.focus} / {pref.break}
            </div>
            <div className="mt-0.5 text-sm font-bold">专注番茄钟</div>
          </div>
          <button
            ref={settingsTriggerRef}
            onClick={openSettings}
            aria-label="番茄钟设置"
            aria-expanded={settingsOpen}
            aria-controls={settingsPanelId}
            aria-haspopup="dialog"
            className="ml-auto rounded-lg p-1.5 transition-colors duration-150 hover:bg-white/10"
          >
            <Settings2 size={15} style={{ opacity: 0.7 }} />
          </button>
        </div>

        <PopoverPanel
          id={settingsPanelId}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="番茄钟时长设置"
          rootRef={settingsRootRef}
          triggerRef={settingsTriggerRef}
          className="relative mt-3 space-y-3 border-0 p-3 text-left shadow-none"
          style={{ background: 'rgba(245,240,232,.06)' }}
        >
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
              label="专注时长"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>短休（分钟）</span>
            <DarkSeg
              value={draft.break}
              onChange={(v) => setDraft({ ...draft, break: v })}
              options={[5, 10, 15].map((v) => ({ value: v, label: `${v}` }))}
              label="短休时长"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>长休（分钟）</span>
            <DarkSeg
              value={draft.long_break}
              onChange={(v) => setDraft({ ...draft, long_break: v })}
              options={[10, 15, 20, 30].map((v) => ({ value: v, label: `${v}` }))}
              label="长休时长"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ opacity: 0.65 }}>长休轮次</span>
            <DarkSeg
              value={draft.rounds_per_cycle}
              onChange={(v) => setDraft({ ...draft, rounds_per_cycle: v })}
              options={[2, 3, 4].map((v) => ({ value: v, label: `${v} 轮` }))}
              label="长休轮次"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={saveSettings} disabled={updatePrefs.isPending} className="w-full">
            保存设置
          </Button>
        </PopoverPanel>
      </div>

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
      <div ref={pickerRootRef} className="relative mt-3 rounded-xl px-2 py-2 text-left" style={{ background: 'rgba(245,240,232,.07)' }}>
        {focusTodo ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs" style={{ opacity: 0.85 }}>
              {focusTodo.text}
            </span>
            <button
              onClick={completeTodo}
              disabled={toggleTodo.isPending}
              aria-label="完成该待办"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-150 hover:bg-white/20"
              style={{ background: 'rgba(52,199,89,.35)' }}
            >
              <Check size={13} strokeWidth={3} />
            </button>
            <button
              ref={pickerTriggerRef}
              onClick={() => setPickerOpen((p) => !p)}
              aria-label="更换待办"
              aria-expanded={pickerOpen}
              aria-controls={pickerPanelId}
              aria-haspopup="dialog"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-white/10"
              style={{ opacity: 0.6 }}
            >
              更换
            </button>
          </div>
        ) : (
          <button
            ref={pickerTriggerRef}
            onClick={() => setPickerOpen((p) => !p)}
            aria-label="关联今日待办"
            aria-expanded={pickerOpen}
            aria-controls={pickerPanelId}
            aria-haspopup="dialog"
            className="w-full text-left text-xs transition-colors hover:opacity-80"
            style={{ opacity: 0.6 }}
          >
            ＋ 关联今日待办
          </button>
        )}
        <PopoverPanel
          id={pickerPanelId}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title="关联今日待办"
          rootRef={pickerRootRef}
          triggerRef={pickerTriggerRef}
          className="mt-1.5 border-x-0 border-b-0 border-t border-white/10 bg-transparent pt-1.5 shadow-none"
        >
            {(todayTodos ?? []).length === 0 ? (
              <p className="py-1 text-center text-[10px]" style={{ opacity: 0.5 }}>
                今天没有待办
              </p>
            ) : (
              <ul className="max-h-32 divide-y divide-white/10 overflow-auto">
                {(todayTodos ?? []).slice(0, 8).map((t) => (
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
        </PopoverPanel>
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
            {Math.max(1, Math.round(plannedSeconds / 60))}
          </div>
          <div className="text-[10px]" style={{ opacity: 0.55 }}>
            {mode === 'focus' ? `第 ${cycleCount + 1} 轮` : isLongBreak ? '长休' : '短休'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PomodoroCard() {
  const { userId } = useAuth()
  return <PomodoroCardContent key={userId ?? 'anonymous'} userId={userId} />
}
