export type Priority = 'high' | 'mid' | 'low'

export interface Todo {
  id: string
  user_id: string
  text: string
  level: Priority
  done: boolean
  sort_order: number
  due_date: string | null
  pinned: boolean
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  user_id: string
  name: string
  emoji: string
  pinned: boolean
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
  pinned: boolean
  created_at: string
  updated_at: string
}

export type NoteLayout = 'default' | 'feature' | 'quote'

export interface Note {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  layout: NoteLayout
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface PomodoroSession {
  id: string
  user_id: string
  date: string
  count: number
  minutes: number
  created_at: string
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

export type PracticeStatus = 'todo' | 'doing' | 'ac_solo' | 'ac_hint' | 'failed'
export type PracticeDifficulty = 'easy' | 'medium' | 'hard'

export interface PracticeProblem {
  id: string
  user_id: string
  title: string
  platform: string
  difficulty: PracticeDifficulty
  status: PracticeStatus
  tags: string[]
  url: string | null
  note: string | null
  solved_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkoutSession {
  id: string
  user_id: string
  date: string
  body_part: string
  duration_min: number | null
  note: string | null
  created_at: string
}

export interface WorkoutExercise {
  id: string
  session_id: string
  name: string
  sets: number
  reps: number
  weight: number
  note: string | null
  created_at: string
}

export interface BodyMetric {
  id: string
  user_id: string
  date: string
  weight: number | null
  body_fat: number | null
  note: string | null
  created_at: string
}
