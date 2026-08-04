import { useRef } from 'react'
import { Database, Download, Upload, X } from 'lucide-react'
import { useTodos } from '../../hooks/useTodos'
import { useNotes } from '../../hooks/useNotes'
import { useLedgerEntries } from '../../hooks/useLedger'
import { useHabits, useHabitLogs } from '../../hooks/useHabits'
import { useGoals } from '../../hooks/useGoals'
import { useProblems } from '../../hooks/useProblems'
import { useBodyMetrics, useWorkoutSessions } from '../../hooks/useWorkouts'
import { useImportData } from '../../hooks/useImportData'
import { useToastStore } from '../../stores/toast'
import { buildCSV, buildJSON, downloadFile } from '../../utils/export'
import type { BackupData } from '../../hooks/useImportData'
import Button from './Button'

function stamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 数据导出 / 导入 */
export default function DataManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const todos = useTodos()
  const habits = useHabits()
  const logs = useHabitLogs()
  const entries = useLedgerEntries()
  const goals = useGoals()
  const notes = useNotes()
  const problems = useProblems()
  const workoutSessions = useWorkoutSessions()
  const metrics = useBodyMetrics()
  const importData = useImportData()
  const push = useToastStore((s) => s.push)
  const fileRef = useRef<HTMLInputElement>(null)

  const allLoaded =
    todos.data &&
    habits.data &&
    logs.data &&
    entries.data &&
    goals.data &&
    notes.data &&
    problems.data &&
    workoutSessions.data &&
    metrics.data

  function exportJSON() {
    const payload: BackupData = {
      todos: todos.data,
      habits: habits.data,
      habit_logs: logs.data,
      ledger_entries: entries.data,
      goals: goals.data,
      notes: notes.data,
      practice_problems: problems.data,
      workout_sessions: workoutSessions.data,
      body_metrics: metrics.data
    }
    downloadFile(`工作台备份-${stamp()}.json`, buildJSON(payload), 'application/json')
    push({ kind: 'success', message: 'JSON 备份已下载' })
  }

  function exportLedgerCSV() {
    const rows = (entries.data ?? []).map((e) => [
      e.entry_date,
      e.kind === 'expense' ? '支出' : '收入',
      e.category,
      e.amount,
      e.note ?? ''
    ])
    downloadFile(
      `记账-${stamp()}.csv`,
      buildCSV(['日期', '类型', '分类', '金额', '备注'], rows),
      'text/csv;charset=utf-8'
    )
    push({ kind: 'success', message: '记账 CSV 已下载' })
  }

  function exportTodosCSV() {
    const rows = (todos.data ?? []).map((t) => [
      t.done ? '已完成' : '未完成',
      t.level,
      t.text,
      t.due_date ?? '',
      t.updated_at.slice(0, 10)
    ])
    downloadFile(
      `待办-${stamp()}.csv`,
      buildCSV(['状态', '优先级', '内容', '截止日期', '更新时间'], rows),
      'text/csv;charset=utf-8'
    )
    push({ kind: 'success', message: '待办 CSV 已下载' })
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as BackupData
        if (!payload || typeof payload !== 'object') throw new Error('格式错误')
        const tables = (['todos', 'habits', 'habit_logs', 'ledger_entries', 'goals', 'notes'] as const).filter(
          (t) => Array.isArray(payload[t]) && payload[t]!.length > 0
        )
        if (tables.length === 0) throw new Error('没有可导入的数据')
        importData.mutate(payload, {
          onSuccess: (counts) => {
            const parts = Object.entries(counts)
              .map(([t, n]) => `${t} ${n} 条`)
              .join('、')
            push({ kind: 'success', message: `导入完成：${parts}` })
          },
          onError: (err) => {
            push({ kind: 'error', message: `导入失败：${(err as Error).message ?? '未知错误'}` })
          }
        })
      } catch (err) {
        push({ kind: 'error', message: `文件解析失败：${(err as Error).message}` })
      }
    }
    reader.readAsText(file)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 fade-in">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-0 mx-auto w-full max-w-md p-4 sm:mt-16">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-overlay">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Database size={16} className="text-ink-3" />
              数据备份
            </h2>
            <button onClick={onClose} aria-label="关闭" className="text-ink-3 hover:text-ink">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">导出</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={exportJSON} disabled={!allLoaded}>
                  <Download size={14} />
                  全部数据 (JSON)
                </Button>
                <Button size="sm" variant="secondary" onClick={exportLedgerCSV} disabled={!allLoaded}>
                  <Download size={14} />
                  记账 CSV
                </Button>
                <Button size="sm" variant="secondary" onClick={exportTodosCSV} disabled={!allLoaded}>
                  <Download size={14} />
                  待办 CSV
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-ink-2">导入（恢复备份）</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={importData.isPending}>
                <Upload size={14} />
                {importData.isPending ? '导入中…' : '选择 JSON 文件'}
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                导入会合并到当前账号（跳过 ID / 用户 / 时间字段）。建议先导出再导入，避免重复。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
