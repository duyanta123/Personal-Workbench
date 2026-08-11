import type { Todo } from '../types'

/** 工作台统一口径：无日期或截止日期为今天的任务属于“今日待办”。 */
export function isTodayTodo(todo: Pick<Todo, 'due_date'>, today: string): boolean {
  return todo.due_date === null || todo.due_date === today
}
