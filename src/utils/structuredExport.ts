import type {
  BodyMetric,
  Goal,
  Habit,
  HabitLog,
  LedgerEntry,
  PomodoroSession,
  PracticeProblem,
  Todo,
  WorkoutExercise,
  WorkoutSession
} from '../types'
import { buildCSV } from './export'

export type StructuredExportKind =
  | 'todos'
  | 'ledger_entries'
  | 'habits'
  | 'habit_logs'
  | 'goals'
  | 'practice_problems'
  | 'workout_sessions'
  | 'workout_exercises'
  | 'body_metrics'
  | 'pomodoro_sessions'

export const STRUCTURED_EXPORT_OPTIONS: Array<{ value: StructuredExportKind; label: string; filename: string }> = [
  { value: 'todos', label: '待办', filename: '待办' },
  { value: 'ledger_entries', label: '记账', filename: '记账' },
  { value: 'habits', label: '习惯', filename: '习惯' },
  { value: 'habit_logs', label: '习惯打卡', filename: '习惯打卡' },
  { value: 'goals', label: '目标', filename: '目标' },
  { value: 'practice_problems', label: '刷题', filename: '刷题' },
  { value: 'workout_sessions', label: '训练场次', filename: '训练场次' },
  { value: 'workout_exercises', label: '训练动作', filename: '训练动作' },
  { value: 'body_metrics', label: '身体指标', filename: '身体指标' },
  { value: 'pomodoro_sessions', label: '番茄统计', filename: '番茄统计' }
]

type RowMap = {
  todos: Todo
  ledger_entries: LedgerEntry
  habits: Habit
  habit_logs: HabitLog
  goals: Goal
  practice_problems: PracticeProblem
  workout_sessions: WorkoutSession
  workout_exercises: WorkoutExercise
  body_metrics: BodyMetric
  pomodoro_sessions: PomodoroSession
}

interface ExportRelations {
  habits?: Habit[]
  workout_sessions?: WorkoutSession[]
}

export function buildStructuredCSV<Kind extends StructuredExportKind>(kind: Kind, rows: RowMap[Kind][], relations: ExportRelations = {}) {
  switch (kind) {
    case 'todos': return buildCSV(
      ['状态', '优先级', '内容', '截止日期', '更新时间', 'ID', '置顶', '排序', '创建时间'],
      (rows as Todo[]).map((row) => [row.done ? '已完成' : '未完成', row.level, row.text, row.due_date ?? '', row.updated_at.slice(0, 10), row.id, row.pinned ? '是' : '否', row.sort_order, row.created_at])
    )
    case 'ledger_entries': return buildCSV(
      ['日期', '类型', '分类', '金额', '备注', 'ID', '原始类型', '创建时间'],
      (rows as LedgerEntry[]).map((row) => [row.entry_date, row.kind === 'expense' ? '支出' : '收入', row.category, row.amount, row.note ?? '', row.id, row.kind, row.created_at])
    )
    case 'habits': return buildCSV(
      ['名称', '图标', '置顶', 'ID', '创建时间'],
      (rows as Habit[]).map((row) => [row.name, row.emoji, row.pinned ? '是' : '否', row.id, row.created_at])
    )
    case 'habit_logs': {
      const names = new Map((relations.habits ?? []).map((habit) => [habit.id, habit.name]))
      return buildCSV(['日期', '习惯名称', '习惯 ID', 'ID', '创建时间'], (rows as HabitLog[]).map((row) => [row.log_date, names.get(row.habit_id) ?? '', row.habit_id, row.id, row.created_at]))
    }
    case 'goals': return buildCSV(
      ['名称', '当前值', '目标值', '单位', '备注', '图标', '置顶', 'ID', '创建时间', '更新时间'],
      (rows as Goal[]).map((row) => [row.name, row.current, row.target, row.unit ?? '', row.note ?? '', row.emoji, row.pinned ? '是' : '否', row.id, row.created_at, row.updated_at])
    )
    case 'practice_problems': return buildCSV(
      ['标题', '平台', '难度', '状态', '标签', '链接', '备注', '解决时间', 'ID', '创建时间', '更新时间'],
      (rows as PracticeProblem[]).map((row) => [row.title, row.platform, row.difficulty, row.status, row.tags.join('|'), row.url ?? '', row.note ?? '', row.solved_at ?? '', row.id, row.created_at, row.updated_at])
    )
    case 'workout_sessions': return buildCSV(
      ['日期', '部位', '时长（分钟）', '备注', 'ID', '创建时间'],
      (rows as WorkoutSession[]).map((row) => [row.date, row.body_part, row.duration_min ?? '', row.note ?? '', row.id, row.created_at])
    )
    case 'workout_exercises': {
      const sessions = new Map((relations.workout_sessions ?? []).map((session) => [session.id, session]))
      return buildCSV(['动作', '组数', '次数', '重量', '备注', '场次日期', '训练部位', '场次 ID', 'ID', '创建时间'], (rows as WorkoutExercise[]).map((row) => {
        const session = sessions.get(row.session_id)
        return [row.name, row.sets, row.reps, row.weight, row.note ?? '', session?.date ?? '', session?.body_part ?? '', row.session_id, row.id, row.created_at]
      }))
    }
    case 'body_metrics': return buildCSV(
      ['日期', '体重', '体脂率', '备注', 'ID', '创建时间'],
      (rows as BodyMetric[]).map((row) => [row.date, row.weight ?? '', row.body_fat ?? '', row.note ?? '', row.id, row.created_at])
    )
    case 'pomodoro_sessions': return buildCSV(
      ['日期', '完成轮数', '专注分钟', 'ID', '创建时间'],
      (rows as PomodoroSession[]).map((row) => [row.date, row.count, row.minutes, row.id, row.created_at])
    )
  }
}
