import type { Habit, HabitLog, LedgerEntry, Note, Todo } from '../types'

export interface TimelineEvent {
  key: string
  type: 'todo' | 'habit' | 'ledger' | 'note'
  /** 主文案 */
  text: string
  /** 副文案 */
  sub: string
  /** ISO 时间串，用于排序，前 10 位为日期 */
  ts: string
}

/** 聚合各模块最近动态，按时间倒序，最多 12 条 */
export function aggregateTimeline(opts: {
  todos: Todo[]
  habits: Habit[]
  logs: HabitLog[]
  entries: LedgerEntry[]
  notes: Note[]
}): TimelineEvent[] {
  const habitName = new Map(opts.habits.map((h) => [h.id, h.name]))
  const events: TimelineEvent[] = []

  for (const t of opts.todos) {
    if (t.done) {
      events.push({ key: `todo-${t.id}`, type: 'todo', text: t.text, sub: '完成待办', ts: t.updated_at })
    }
  }
  for (const l of opts.logs) {
    events.push({
      key: `habit-${l.id}`,
      type: 'habit',
      text: habitName.get(l.habit_id) ?? '习惯打卡',
      sub: '打卡',
      ts: l.created_at
    })
  }
  for (const e of opts.entries) {
    events.push({
      key: `ledger-${e.id}`,
      type: 'ledger',
      text: e.category,
      sub: `${e.kind === 'expense' ? '-' : '+'}¥${e.amount.toFixed(0)}`,
      ts: e.created_at
    })
  }
  for (const n of opts.notes) {
    events.push({
      key: `note-${n.id}`,
      type: 'note',
      text: n.title ?? '内容记录',
      sub: n.tags.length ? n.tags.map((t) => `#${t}`).join(' ') : '笔记',
      ts: n.updated_at
    })
  }

  return events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 12)
}
