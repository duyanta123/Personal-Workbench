import type { Goal, Habit, Note, PracticeProblem, Todo } from '../types'

/**
 * 撤销删除时的回填输入：保留被删项的全部业务字段，
 * 避免「撤销即降级」（丢完成态 / 置顶 / 布局 / 日期等）。
 */

export interface TodoRestoreInput {
  text: string
  level: Todo['level']
  due_date: string | null
  done: boolean
  pinned: boolean
  sort_order: number
}

export function todoRestoreInput(t: Todo): TodoRestoreInput {
  return {
    text: t.text,
    level: t.level,
    due_date: t.due_date,
    done: t.done,
    pinned: t.pinned,
    sort_order: t.sort_order
  }
}

export interface NoteRestoreInput {
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  layout: Note['layout']
  image_url: string | null
}

export function noteRestoreInput(n: Note): NoteRestoreInput {
  return {
    title: n.title,
    body: n.body,
    tags: n.tags,
    pinned: n.pinned,
    layout: n.layout,
    image_url: n.image_url
  }
}

export interface GoalRestoreInput {
  name: string
  emoji: string
  current: number
  target: number
  unit: string | null
  pinned: boolean
}

export function goalRestoreInput(g: Goal): GoalRestoreInput {
  return {
    name: g.name,
    emoji: g.emoji,
    current: g.current,
    target: g.target,
    unit: g.unit,
    pinned: g.pinned
  }
}

export interface HabitRestoreInput {
  name: string
  emoji: string
  pinned: boolean
}

export function habitRestoreInput(h: Habit): HabitRestoreInput {
  return { name: h.name, emoji: h.emoji, pinned: h.pinned }
}

export interface PracticeRestoreInput {
  title: string
  platform: string
  difficulty: PracticeProblem['difficulty']
  status: PracticeProblem['status']
  tags: string[]
  url: string | null
  note: string | null
  solved_at: string | null
}

export function practiceRestoreInput(p: PracticeProblem): PracticeRestoreInput {
  return {
    title: p.title,
    platform: p.platform,
    difficulty: p.difficulty,
    status: p.status,
    tags: p.tags,
    url: p.url,
    note: p.note,
    solved_at: p.solved_at
  }
}
