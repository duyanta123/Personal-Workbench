import { describe, expect, test } from 'vitest'
import {
  loadPomodoroRuntime,
  legacyPomodoroRuntimeKey,
  normalizePomodoroRuntime,
  pomodoroRuntimeKey,
  remainingSeconds
} from './pomodoroRuntime'

describe('pomodoroRuntime', () => {
  test('按绝对截止时间计算剩余秒数', () => {
    expect(remainingSeconds(10_000, 8_001)).toBe(2)
    expect(remainingSeconds(10_000, 10_001)).toBe(0)
  })

  test('恢复运行中的计时器时重新计算剩余时间', () => {
    const runtime = normalizePomodoroRuntime(
      { mode: 'focus', running: true, deadline: 70_000, remain: 99, cycleCount: 2, isLongBreak: false, focusTodoId: 'todo-1' },
      1,
      68_100
    )
    expect(runtime).toMatchObject({ running: true, remain: 2, cycleCount: 2, focusTodoId: 'todo-1', restored: true })
  })

  test('按用户分区读取本地运行态，损坏数据回退默认值', () => {
    const values = new Map<string, string>([
      [legacyPomodoroRuntimeKey('u1'), JSON.stringify({ mode: 'break', running: false, remain: 12, cycleCount: 3 })],
      [pomodoroRuntimeKey('u2'), '{broken']
    ])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
    expect(loadPomodoroRuntime(storage, 'u1', 25 * 60, 0).remain).toBe(12)
    expect(loadPomodoroRuntime(storage, 'u1', 25 * 60, 0).cycleCount).toBe(0)
    expect(loadPomodoroRuntime(storage, 'u2', 25 * 60, 0)).toMatchObject({ remain: 25 * 60, restored: false })
  })

  test('空闲运行态跨日后回到专注并清空轮次', () => {
    const runtime = normalizePomodoroRuntime({
      version: 2, mode: 'break', running: false, remain: 60, cycleCount: 3,
      cycleDate: '2026-08-07', isLongBreak: true, focusTodoId: null
    }, 1500, new Date('2026-08-08T10:00:00').getTime())
    expect(runtime).toMatchObject({ mode: 'focus', remain: 1500, cycleCount: 0, isLongBreak: false, cycleDate: '2026-08-08' })
  })

  test('跨午夜完成按截止时间日期入账', () => {
    const deadline = new Date(2026, 7, 10, 0, 1, 0).getTime()
    const runtime = normalizePomodoroRuntime({
      version: 3,
      mode: 'focus',
      running: true,
      deadline,
      remain: 60,
      plannedSeconds: 1500,
      completionDate: null,
      completionOperationId: 'pomodoro-1',
      cycleCount: 0,
      cycleDate: '2026-08-09',
      isLongBreak: false,
      focusTodoId: null
    }, 1500, new Date(2026, 7, 9, 23, 59, 30).getTime())

    expect(runtime.completionDate).toBe('2026-08-10')
    expect(runtime.remain).toBe(90)
  })

  test('恢复运行态时保留本轮计划时长，不受新偏好影响', () => {
    const now = new Date(2026, 7, 10, 10, 0, 0).getTime()
    const runtime = normalizePomodoroRuntime({
      version: 3,
      mode: 'focus',
      running: true,
      deadline: now + 60_000,
      remain: 60,
      plannedSeconds: 1500,
      completionDate: '2026-08-10',
      completionOperationId: 'pomodoro-2',
      cycleCount: 1,
      cycleDate: '2026-08-10',
      isLongBreak: false,
      focusTodoId: null
    }, 2700, now)

    expect(runtime.plannedSeconds).toBe(1500)
    expect(runtime.remain).toBe(60)
  })

  test('跨日后仍保留尚未入 outbox 的完成事件', () => {
    const runtime = normalizePomodoroRuntime({
      version: 3,
      mode: 'focus',
      running: false,
      deadline: null,
      remain: 0,
      plannedSeconds: 1500,
      completionDate: '2026-08-09',
      completionOperationId: 'pomodoro-pending',
      cycleCount: 1,
      cycleDate: '2026-08-09',
      isLongBreak: false,
      focusTodoId: null
    }, 2700, new Date(2026, 7, 10, 8, 0, 0).getTime())

    expect(runtime).toMatchObject({
      mode: 'focus',
      remain: 0,
      plannedSeconds: 1500,
      completionDate: '2026-08-09',
      completionOperationId: 'pomodoro-pending'
    })
  })
})
