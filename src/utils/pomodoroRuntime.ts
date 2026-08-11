export type PomodoroMode = 'focus' | 'break'

export interface PomodoroRuntime {
  version: 3
  mode: PomodoroMode
  remain: number
  running: boolean
  deadline: number | null
  plannedSeconds: number
  completionDate: string | null
  completionOperationId: string | null
  cycleCount: number
  cycleDate: string
  isLongBreak: boolean
  focusTodoId: string | null
}

export interface LoadedPomodoroRuntime extends PomodoroRuntime {
  restored: boolean
  migratedFromV1: boolean
}

export function pomodoroRuntimeKey(userId: string) {
  return `workbench:pomodoro:v3:${userId}`
}

export function previousPomodoroRuntimeKey(userId: string) {
  return `workbench:pomodoro:v2:${userId}`
}

export function legacyPomodoroRuntimeKey(userId: string) {
  return `workbench:pomodoro:v1:${userId}`
}

export function localDateAt(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function remainingSeconds(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function normalizePomodoroRuntime(
  value: unknown,
  fallback: number,
  now = Date.now(),
  migratedFromV1 = false
): LoadedPomodoroRuntime {
  const today = localDateAt(now)
  const empty: LoadedPomodoroRuntime = {
    version: 3,
    mode: 'focus',
    remain: fallback,
    running: false,
    deadline: null,
    plannedSeconds: fallback,
    completionDate: null,
    completionOperationId: null,
    cycleCount: 0,
    cycleDate: today,
    isLongBreak: false,
    focusTodoId: null,
    restored: false,
    migratedFromV1: false
  }
  if (!value || typeof value !== 'object') return empty
  const parsed = value as Partial<PomodoroRuntime> & { version?: number }
  if (parsed.mode !== 'focus' && parsed.mode !== 'break') return empty
  const deadline = typeof parsed.deadline === 'number' && Number.isFinite(parsed.deadline)
    ? parsed.deadline
    : null
  const running = Boolean(parsed.running && deadline !== null)
  const parsedCycleDate = typeof parsed.cycleDate === 'string' ? parsed.cycleDate : ''
  const plannedSeconds = Number.isFinite(Number(parsed.plannedSeconds)) && Number(parsed.plannedSeconds) > 0
    ? Math.floor(Number(parsed.plannedSeconds))
    : fallback
  const completionDate = typeof parsed.completionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.completionDate)
    ? parsed.completionDate
    : running && deadline !== null ? localDateAt(deadline) : null
  const completionOperationId = typeof parsed.completionOperationId === 'string' && parsed.completionOperationId
    ? parsed.completionOperationId
    : null

  // V1 idle state did not have a reliable local date; migrate it without carrying rounds forward.
  if (!running && migratedFromV1) {
    return {
      ...empty,
      mode: parsed.mode,
      remain: Math.max(0, Number.isFinite(Number(parsed.remain)) ? Number(parsed.remain) : fallback),
      plannedSeconds,
      isLongBreak: Boolean(parsed.isLongBreak),
      focusTodoId: typeof parsed.focusTodoId === 'string' ? parsed.focusTodoId : null,
      restored: true,
      migratedFromV1: true
    }
  }
  // A completed focus with an operation id is intentionally retained across midnight until queued.
  const pendingCompletion = parsed.mode === 'focus'
    && Number(parsed.remain) === 0
    && Boolean(completionDate && completionOperationId)
  if (!running && parsedCycleDate !== today && !pendingCompletion) {
    return {
      ...empty,
      focusTodoId: typeof parsed.focusTodoId === 'string' ? parsed.focusTodoId : null,
      restored: true,
      migratedFromV1
    }
  }

  return {
    version: 3,
    mode: parsed.mode,
    remain: running
      ? remainingSeconds(deadline!, now)
      : Math.max(0, Number.isFinite(Number(parsed.remain)) ? Number(parsed.remain) : fallback),
    running,
    deadline,
    plannedSeconds,
    completionDate,
    completionOperationId,
    cycleCount: Math.max(0, Number.isFinite(Number(parsed.cycleCount)) ? Math.floor(Number(parsed.cycleCount)) : 0),
    cycleDate: parsedCycleDate || completionDate || today,
    isLongBreak: Boolean(parsed.isLongBreak),
    focusTodoId: typeof parsed.focusTodoId === 'string' ? parsed.focusTodoId : null,
    restored: true,
    migratedFromV1
  }
}

export function loadPomodoroRuntime(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  userId: string | null,
  fallback: number,
  now = Date.now()
): LoadedPomodoroRuntime {
  if (!userId) return normalizePomodoroRuntime(null, fallback, now)
  try {
    const current = storage.getItem(pomodoroRuntimeKey(userId))
    if (current) return normalizePomodoroRuntime(JSON.parse(current), fallback, now)
    const v2 = storage.getItem(previousPomodoroRuntimeKey(userId))
    if (v2) {
      const migrated = normalizePomodoroRuntime(JSON.parse(v2), fallback, now)
      storage.setItem(pomodoroRuntimeKey(userId), JSON.stringify(migrated))
      storage.removeItem(previousPomodoroRuntimeKey(userId))
      return migrated
    }
    const legacy = storage.getItem(legacyPomodoroRuntimeKey(userId))
    if (!legacy) return normalizePomodoroRuntime(null, fallback, now)
    const migrated = normalizePomodoroRuntime(JSON.parse(legacy), fallback, now, true)
    storage.setItem(pomodoroRuntimeKey(userId), JSON.stringify(migrated))
    storage.removeItem(legacyPomodoroRuntimeKey(userId))
    return migrated
  } catch {
    return normalizePomodoroRuntime(null, fallback, now)
  }
}

export function clearPomodoroRuntime(storage: Pick<Storage, 'removeItem'>, userId: string) {
  storage.removeItem(pomodoroRuntimeKey(userId))
  storage.removeItem(previousPomodoroRuntimeKey(userId))
  storage.removeItem(legacyPomodoroRuntimeKey(userId))
}
