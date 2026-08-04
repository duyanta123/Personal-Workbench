import { useEffect, useState } from 'react'
import { usePomodoroStats, useSavePomodoro } from '../../hooks/usePomodoro'
import { useToastStore } from '../../stores/toast'
import Ring from './Ring'
import Button from './Button'
import { cn } from '../../lib/cn'

const FOCUS_SEC = 25 * 60
const BREAK_SEC = 5 * 60

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

type Mode = 'focus' | 'break'

/** 番茄钟：25 分钟专注 / 5 分钟休息，完成一轮写入当日统计 */
export default function PomodoroCard() {
  const { data: stats } = usePomodoroStats()
  const save = useSavePomodoro()
  const push = useToastStore((s) => s.push)

  const [mode, setMode] = useState<Mode>('focus')
  const [remain, setRemain] = useState(FOCUS_SEC)
  const [running, setRunning] = useState(false)

  const total = mode === 'focus' ? FOCUS_SEC : BREAK_SEC
  const elapsedPct = total ? Math.round(((total - remain) / total) * 100) : 0

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(t)
  }, [running])

  useEffect(() => {
    if (!running || remain > 0) return
    if (mode === 'focus') {
      save.mutate({
        count: (stats?.count ?? 0) + 1,
        minutes: (stats?.minutes ?? 0) + FOCUS_SEC / 60
      })
      push({ kind: 'success', message: '专注完成，休息 5 分钟吧' })
    } else {
      push({ kind: 'info', message: '休息结束，开始下一轮专注' })
    }
    const next: Mode = mode === 'focus' ? 'break' : 'focus'
    setMode(next)
    setRemain(next === 'focus' ? FOCUS_SEC : BREAK_SEC)
    setRunning(false)
  }, [running, remain, mode, stats, save, push])

  function toggle() {
    if (!running && remain === 0) {
      setRemain(total)
    }
    setRunning((r) => !r)
  }

  function reset() {
    setRunning(false)
    setRemain(total)
  }

  const count = stats?.count ?? 0
  const minutes = stats?.minutes ?? 0

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl p-5 text-center shadow-card"
      style={{ background: 'linear-gradient(155deg,#4a443c,#201d18)', color: '#f5f0e8' }}
    >
      <div className="pointer-events-none absolute -top-14 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-danger/20 blur-2xl" />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ opacity: 0.55 }}>
          Pomodoro · 25 / 5
        </div>
        <div className="mt-0.5 text-sm font-bold">专注番茄钟</div>
      </div>

      <div className="relative mx-auto my-4">
        <Ring value={elapsedPct} size={148} stroke={8} color="#d4953a" track="rgba(245,240,232,.14)">
          <div className="text-[30px] font-bold tabular-nums leading-none">{fmt(remain)}</div>
          <div className="mt-1 text-[11px]" style={{ opacity: 0.6 }}>
            {running ? (mode === 'focus' ? '专注中' : '休息中') : mode === 'focus' ? '保持专注' : '准备专注'}
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
        <Button variant="secondary" size="sm" onClick={reset}>
          重置
        </Button>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
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
          <div className="text-base font-bold tabular-nums">{mode === 'focus' ? '25' : '5'}</div>
          <div className="text-[10px]" style={{ opacity: 0.55 }}>
            当前周期
          </div>
        </div>
      </div>
    </div>
  )
}
