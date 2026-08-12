import { useRef, useState } from 'react'
import { Database, Download, Upload, X } from 'lucide-react'
import { useImportData } from '../../hooks/useImportData'
import { useToastStore } from '../../stores/toast'
import { buildICalendar, buildJSON, downloadFile } from '../../utils/export'
import { backupCounts, createBackupV3, fetchAllTableRows, MAX_BACKUP_BYTES, normalizeBackup } from '../../utils/backup'
import type { Habit, Todo, WorkoutSession } from '../../types'
import { buildStructuredCSV, STRUCTURED_EXPORT_OPTIONS } from '../../utils/structuredExport'
import type { StructuredExportKind } from '../../utils/structuredExport'
import Button from './Button'
import Modal from './Modal'

function stamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 数据导出 / 导入 */
export default function DataManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importData = useImportData()
  const push = useToastStore((s) => s.push)
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<'csv' | 'ics'>('csv')
  const [dataset, setDataset] = useState<StructuredExportKind>('todos')
  const [includeCompleted, setIncludeCompleted] = useState(false)

  async function exportJSON() {
    setExporting(true)
    try {
      const payload = await createBackupV3()
      downloadFile(`工作台备份-${stamp()}.json`, buildJSON(payload), 'application/json')
      push({ kind: 'success', message: '完整 JSON 备份已下载' })
    } catch (error) {
      push({ kind: 'error', message: `备份导出失败：${(error as Error).message}` })
    } finally {
      setExporting(false)
    }
  }

  async function exportSelected() {
    setExporting(true)
    try {
      if (format === 'ics') {
        const todos = await fetchAllTableRows<Todo>('todos')
        const calendar = buildICalendar(todos, { includeCompleted })
        downloadFile(`待办日历-${stamp()}.ics`, calendar, 'text/calendar;charset=utf-8')
        push({ kind: 'success', message: '待办日历 ICS 已下载' })
        return
      }
      const rows = await fetchAllTableRows<Record<string, unknown>>(dataset)
      const relations: { habits?: Habit[]; workout_sessions?: WorkoutSession[] } = {}
      if (dataset === 'habit_logs') relations.habits = await fetchAllTableRows<Habit>('habits')
      if (dataset === 'workout_exercises') relations.workout_sessions = await fetchAllTableRows<WorkoutSession>('workout_sessions')
      const csv = buildStructuredCSV(dataset, rows as never[], relations)
      const option = STRUCTURED_EXPORT_OPTIONS.find((item) => item.value === dataset)!
      downloadFile(`${option.filename}-${stamp()}.csv`, csv, 'text/csv;charset=utf-8')
      push({ kind: 'success', message: `${option.label} CSV 已下载` })
    } catch (error) {
      push({ kind: 'error', message: `导出失败：${(error as Error).message}` })
    } finally { setExporting(false) }
  }

  function handleFile(file: File) {
    if (file.size > MAX_BACKUP_BYTES) {
      push({ kind: 'error', message: '备份文件不能超过 40 MiB' })
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const payload = normalizeBackup(JSON.parse(String(reader.result)))
        const counts = backupCounts(payload)
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
        if (total === 0) throw new Error('没有可恢复的数据')
        const summary = Object.entries(counts).filter(([, count]) => count > 0).map(([table, count]) => `${table} ${count}`).join('、')
        if (!window.confirm(`此操作会替换当前账号全部数据，且不可撤销。\n备份时间：${new Date(payload.metadata.exported_at).toLocaleString()}\n内容：${summary}\n\n确定继续吗？`)) return
        const restored = await importData.mutateAsync(payload)
        const parts = Object.entries(restored).map(([table, count]) => `${table} ${count} 条`).join('、')
        push({ kind: 'success', message: `恢复完成：${parts}` })
      } catch (err) {
        push({ kind: 'error', message: `恢复失败：${(err as Error).message}` })
      } finally {
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <Modal open={open} onClose={onClose} title="数据备份">
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
                <Button size="sm" variant="secondary" onClick={exportJSON} disabled={exporting || importData.isPending}>
                  <Download size={14} />
                  全部数据 (JSON)
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label htmlFor="export-format" className="text-xs text-ink-2">格式
                  <select id="export-format" value={format} onChange={(event) => setFormat(event.target.value as 'csv' | 'ics')} className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink">
                    <option value="csv">CSV 表格</option>
                    <option value="ics">ICS 待办日历</option>
                  </select>
                </label>
                {format === 'csv' ? (
                  <label htmlFor="export-dataset" className="text-xs text-ink-2">数据集
                    <select id="export-dataset" value={dataset} onChange={(event) => setDataset(event.target.value as StructuredExportKind)} className="mt-1 w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink">
                      {STRUCTURED_EXPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="flex items-center gap-2 self-end rounded-xl border border-border px-3 py-2 text-xs text-ink-2">
                    <input type="checkbox" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />
                    包含已完成待办
                  </label>
                )}
              </div>
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={exportSelected} disabled={exporting || importData.isPending}>
                  <Download size={14} />
                  {exporting ? '导出中…' : '下载所选文件'}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-3">CSV/ICS 仅用于数据互通，不支持恢复；完整恢复请使用 JSON Backup V3。</p>
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
                恢复前会校验文件并要求确认；成功后，备份内容将完整替换当前账号的数据。
              </p>
            </div>
          </div>
        </div>
    </Modal>
  )
}
