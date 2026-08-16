import type { SavedView, TemplateKind } from '../types'

type JsonObject = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  const text = value.trim()
  if (text.length > maxLength) throw new Error(`${label}过长`)
  return text
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${label}格式无效`)
  if (value.length > maxLength) throw new Error(`${label}过长`)
  return value
}

function boundedInteger(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}超出范围`)
  return value
}

function finiteNumber(value: unknown, label: string, minExclusive?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minExclusive !== undefined && value <= minExclusive)) throw new Error(`${label}无效`)
  return value
}

function nonnegativeNumber(value: unknown, label: string) {
  const number = finiteNumber(value, label)
  if (number < 0) throw new Error(`${label}无效`)
  return number
}

function ensureOnlyKeys(value: JsonObject, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('包含不支持的字段')
}

export function normalizeTemplatePayload(kind: TemplateKind, payload: JsonObject): JsonObject {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('模板内容无效')
  if (kind === 'todo') {
    ensureOnlyKeys(payload, ['text', 'level', 'due_offset_days'])
    const level = payload.level
    if (level !== 'high' && level !== 'mid' && level !== 'low') throw new Error('待办优先级无效')
    const dueOffset = payload.due_offset_days == null ? null : boundedInteger(payload.due_offset_days, '到期偏移', -36500, 36500)
    return { text: requiredText(payload.text, '待办内容', 1000), level, due_offset_days: dueOffset }
  }
  if (kind === 'habit') {
    ensureOnlyKeys(payload, ['name', 'emoji', 'tracking_type', 'period_days', 'target_count', 'target_value', 'target_mode', 'reminder_time'])
    const trackingType = payload.tracking_type === 'numeric' ? 'numeric' : payload.tracking_type === 'boolean' ? 'boolean' : null
    if (!trackingType) throw new Error('习惯类型无效')
    const targetMode = payload.target_mode === 'at_most' ? 'at_most' : payload.target_mode === 'at_least' ? 'at_least' : null
    if (!targetMode) throw new Error('习惯目标方向无效')
    const reminder = optionalText(payload.reminder_time, '提醒时间', 8)
    if (reminder && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(reminder)) throw new Error('提醒时间无效')
    return {
      name: requiredText(payload.name, '习惯名称', 200),
      emoji: requiredText(payload.emoji, '习惯图标', 100),
      tracking_type: trackingType,
      period_days: boundedInteger(payload.period_days, '习惯周期', 1, 365),
      target_count: boundedInteger(payload.target_count, '目标次数', 1, 365),
      target_value: trackingType === 'numeric' ? finiteNumber(payload.target_value, '数值目标') : null,
      target_mode: targetMode,
      reminder_time: reminder
    }
  }
  if (kind === 'goal') {
    ensureOnlyKeys(payload, ['name', 'emoji', 'target', 'unit', 'note', 'pinned'])
    return {
      name: requiredText(payload.name, '目标名称', 200),
      emoji: requiredText(payload.emoji, '目标图标', 100),
      target: finiteNumber(payload.target, '目标值', 0),
      unit: optionalText(payload.unit, '目标单位', 100),
      note: optionalText(payload.note, '目标备注', 100000),
      pinned: payload.pinned === true
    }
  }
  ensureOnlyKeys(payload, ['body_part', 'duration_min', 'note', 'exercises'])
  const exercises = payload.exercises ?? []
  if (!Array.isArray(exercises) || exercises.length > 100) throw new Error('训练动作无效')
  const normalizedExercises = exercises.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('训练动作无效')
    const exercise = item as JsonObject
    ensureOnlyKeys(exercise, ['name', 'sets', 'reps', 'weight', 'note'])
    return {
      name: requiredText(exercise.name, '动作名称', 200),
      sets: boundedInteger(exercise.sets, '组数', 0, 1000),
      reps: boundedInteger(exercise.reps, '次数', 0, 100000),
      weight: nonnegativeNumber(exercise.weight, '重量'),
      note: optionalText(exercise.note, '动作备注', 100000)
    }
  })
  return {
    body_part: requiredText(payload.body_part, '训练部位', 100),
    duration_min: payload.duration_min == null ? null : boundedInteger(payload.duration_min, '训练时长', 0, 10080),
    note: optionalText(payload.note, '训练备注', 100000),
    exercises: normalizedExercises
  }
}

export function normalizeSavedViewInput(
  entityKind: SavedView['entity_kind'],
  filters: JsonObject,
  sort: JsonObject[]
): { filters: JsonObject; sort: JsonObject[] } {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) || !Array.isArray(sort) || sort.length > 3) throw new Error('保存视图内容无效')
  const result: JsonObject = {}
  if (entityKind === 'todo') {
    ensureOnlyKeys(filters, ['query', 'show_done', 'level', 'due'])
    if (filters.query !== undefined) result.query = typeof filters.query === 'string' ? filters.query.trim().slice(0, 1000) : ''
    if (filters.show_done !== undefined) {
      if (typeof filters.show_done !== 'boolean') throw new Error('待办完成筛选无效')
      result.show_done = filters.show_done
    }
    if (filters.level !== undefined) {
      if (!['high', 'mid', 'low'].includes(String(filters.level))) throw new Error('待办优先级筛选无效')
      result.level = filters.level
    }
    if (filters.due !== undefined) {
      if (!['overdue', 'today', 'future', 'none'].includes(String(filters.due))) throw new Error('待办日期筛选无效')
      result.due = filters.due
    }
  } else {
    ensureOnlyKeys(filters, ['query', 'kind', 'category', 'account_id', 'status', 'date_from', 'date_to'])
    if (filters.query !== undefined) result.query = typeof filters.query === 'string' ? filters.query.trim().slice(0, 200) : ''
    if (filters.kind !== undefined && filters.kind !== 'income' && filters.kind !== 'expense') throw new Error('收支筛选无效')
    if (filters.status !== undefined && filters.status !== 'planned' && filters.status !== 'posted') throw new Error('账目状态筛选无效')
    if (filters.kind !== undefined) result.kind = filters.kind
    if (filters.status !== undefined) result.status = filters.status
    for (const key of ['category', 'account_id', 'date_from', 'date_to'] as const) {
      if (filters[key] !== undefined) {
        if (typeof filters[key] !== 'string' || filters[key].length > 200) throw new Error('账目筛选无效')
        if (key === 'account_id' && !UUID.test(filters[key])) throw new Error('账目账户筛选无效')
        if ((key === 'date_from' || key === 'date_to') && !DATE.test(filters[key])) throw new Error('账目日期筛选无效')
        result[key] = filters[key]
      }
    }
  }
  const normalizedSort = sort.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('保存视图排序无效')
    ensureOnlyKeys(item, ['column', 'direction'])
    const columns = entityKind === 'todo' ? ['sort_order', 'due_date', 'created_at'] : ['entry_date', 'amount_minor', 'category', 'created_at']
    if (!columns.includes(String(item.column)) || (item.direction !== 'asc' && item.direction !== 'desc')) throw new Error('保存视图排序无效')
    return { column: item.column, direction: item.direction }
  })
  return { filters: result, sort: normalizedSort }
}
