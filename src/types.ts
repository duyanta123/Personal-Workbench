export type Priority = 'high' | 'mid' | 'low'

export interface Todo {
  id: string
  user_id: string
  text: string
  level: Priority
  done: boolean
  sort_order: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  user_id: string
  name: string
  emoji: string
  created_at: string
}

export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  created_at: string
}

export interface LedgerEntry {
  id: string
  user_id: string
  kind: 'income' | 'expense'
  category: string
  amount: number
  note: string | null
  entry_date: string
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  name: string
  emoji: string
  current: number
  target: number
  unit: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  user_id: string
  categories: { expense: string[]; income: string[] }
  monthly_budget: number | null
  updated_at: string
}

export interface UserAvatar {
  id: string
  user_id: string
  storage_path: string
  is_active: boolean
  created_at: string
}
