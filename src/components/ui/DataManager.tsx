import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Database, Download, Upload, X } from 'lucide-react'
import { useImportData, type BackupRestoreInput } from '../../hooks/useImportData'
import { useToastStore } from '../../stores/toast'
import { buildICalendar, buildJSON, downloadFile } from '../../utils/export'
import { backupCounts, createBackupV7, fetchAllTableRows, MAX_BACKUP_BYTES, normalizeBackup } from '../../utils/backup'
import type { Habit, Todo, WorkoutSession } from '../../types'
import { buildStructuredCSV, STRUCTURED_EXPORT_OPTIONS } from '../../utils/structuredExport'
import type { StructuredExportKind } from '../../utils/structuredExport'
import { createBackupV8Stream, estimateV8ExportBytes, isMobileSafari, V8_MODULE_OPTIONS, V8_SAFARI_FULL_EXPORT_BYTES, inspectBackupV8, writeBackupV8 } from '../../utils/backupV8'
import Button from './Button'
import Modal from './Modal'
import SensitiveAuthDialog from './SensitiveAuthDialog'
import Progress from './Progress'
import { supabase } from '../../lib/supabase'
import { backupHealthSchema } from '../../lib/runtimeSchemas'

type BackupHealth = ReturnType<typeof backupHealthSchema.parse>

function healthLevel(ratio: number) {
  if (ratio >= 0.95) return { color: 'bg-danger', text: '已接近恢复安全上限', className: 'text-danger' }
  if (ratio >= 0.8) return { color: 'bg-m3', text: '容量使用偏高', className: 'text-m3' }
  if (ratio >= 0.6) return { color: 'bg-m4', text: '请留意数据增长', className: 'text-ink-2' }
  return { color: 'bg-m2', text: '容量充足', className: 'text-ink-2' }
}

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
  const [pendingRestore, setPendingRestore] = useState<BackupRestoreInput | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [health, setHealth] = useState<BackupHealth | null>(null)
  const [healthError, setHealthError] = useState(false)
  const [v8Scope, setV8Scope] = useState<'full' | 'module' | 'year'>('full')
  const [v8Module, setV8Module] = useState<string>(V8_MODULE_OPTIONS[0].value)
  const [v8Year, setV8Year] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    if (!open || !supabase) return
    let active = true
    void supabase.rpc('get_backup_health').then(({ data, error }) => {
      if (!active) return
      if (error) { setHealthError(true); return }
      const parsed = backupHealthSchema.safeParse(data)
      if (!parsed.success) { setHealthError(true); return }
      setHealth(parsed.data)
      setHealthError(false)
    })
    return () => { active = false }
  }, [open])

  const largestTable = health ? Math.max(0, ...Object.values(health.table_rows)) : 0
  const capacityRatio = health ? Math.max(largestTable / health.max_table_rows, health.total_rows / health.max_total_rows) : 0
  const capacity = healthLevel(capacityRatio)

  async function exportJSON() {
    setExporting(true)
    try {
      const payload = await createBackupV7()
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

  const estimatedV8Bytes = health
    ? v8Scope === 'full'
      ? health.estimated_export_bytes
      : estimateV8ExportBytes(Math.ceil(health.total_rows * 0.35))
    : 0
  const safariFullBlocked = isMobileSafari() && estimatedV8Bytes > V8_SAFARI_FULL_EXPORT_BYTES

  async function exportV8() {
    setExporting(true)
    try {
      if (v8Scope === 'full' && safariFullBlocked) throw new Error('移动 Safari 预测全量备份超过 64 MiB，请改用按模块或按年份导出')
      const scope = v8Scope === 'full' ? { kind: 'full' as const } : v8Scope === 'module'
        ? { kind: 'module' as const, value: v8Module }
        : { kind: 'year' as const, value: v8Year }
      const suffix = v8Scope === 'full' ? 'full' : `${v8Scope}-${scope.value}`
      await writeBackupV8(
        createBackupV8Stream({ scope }),
        `工作台备份-${suffix}-${stamp()}.workbench.zip`,
        { enforceMobileSafariLimit: v8Scope === 'full' }
      )
      push({ kind: 'success', message: v8Scope === 'full' ? 'V8 流式备份已下载' : 'V8 分范围备份已下载（仅供查阅）' })
    } catch (error) {
      push({ kind: 'error', message: `V8 备份导出失败：${(error as Error).message}` })
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
        setPendingRestore(payload)
        setAuthOpen(true)
      } catch (err) {
        push({ kind: 'error', message: `恢复失败：${(err as Error).message}` })
      } finally {
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  async function handleV8File(file: File) {
    try {
      const manifest = await inspectBackupV8(file)
      if ((manifest.scope?.kind ?? 'full') !== 'full') {
        throw new Error('按模块或按年份导出仅供查阅，不能作为全量恢复文件导入')
      }
      const total = Object.values(manifest.tables).reduce((sum, table) => sum + table.rows, 0)
      if (total === 0) throw new Error('没有可恢复的数据')
      if (!window.confirm(`此操作会替换当前账号全部数据，且不可撤销。\nV8 备份时间：${new Date(manifest.exported_at).toLocaleString()}\n共 ${total} 条记录。\n\n确定继续吗？`)) return
      setPendingRestore({ kind: 'v8', file, manifest })
      setAuthOpen(true)
    } catch (error) {
      push({ kind: 'error', message: `V8 备份读取失败：${(error as Error).message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function restoreVerified() {
    if (!pendingRestore) return
    try {
      const restored = await importData.mutateAsync(pendingRestore)
      const parts = Object.entries(restored).map(([table, count]) => `${table} ${count} 条`).join('、')
      push({ kind: 'success', message: `恢复完成：${parts}` })
      setPendingRestore(null)
    } catch (err) {
      push({ kind: 'error', message: `恢复失败：${(err as Error).message}` })
      throw err
    }
  }

  return <>
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
            {health ? (
              <div className="border-b border-border pb-3" aria-label="数据容量健康">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={capacity.className}>{capacity.text}</span>
                  <span className="tabular-nums text-ink-3">{health.total_rows.toLocaleString()} / {health.max_total_rows.toLocaleString()} 行</span>
                </div>
                <Progress className="mt-2" value={capacityRatio * 100} color={capacity.color} />
                <p className="mt-1 text-[11px] text-ink-3">按总行数或最大单表占用中较高者计算；60%、80%、95% 分级提醒。</p>
              </div>
            ) : healthError ? (
              <p role="status" className="flex items-center gap-1.5 border-b border-border pb-3 text-xs text-m3"><AlertTriangle size={14} />容量状态暂时不可用</p>
            ) : null}
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">导出</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={exportJSON} disabled={exporting || importData.isPending}>
                  <Download size={14} />
                  全部数据 (JSON)
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void exportV8()} disabled={exporting || importData.isPending}>
                  <Download size={14} />
                  V8 流式备份
                </Button>
                <select aria-label="V8 导出范围" value={v8Scope} onChange={(event) => setV8Scope(event.target.value as typeof v8Scope)} disabled={exporting} className="rounded-xl border border-border bg-page px-2 py-1 text-xs text-ink">
                  <option value="full">全量（可恢复）</option>
                  <option value="module">按模块（查阅）</option>
                  <option value="year">按年份（查阅）</option>
                </select>
                {v8Scope === 'module' ? (
                  <select aria-label="V8 模块" value={v8Module} onChange={(event) => setV8Module(event.target.value)} disabled={exporting} className="rounded-xl border border-border bg-page px-2 py-1 text-xs text-ink">
                    {V8_MODULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : v8Scope === 'year' ? (
                  <input aria-label="V8 年份" inputMode="numeric" pattern="[0-9]{4}" value={v8Year} onChange={(event) => setV8Year(event.target.value)} disabled={exporting} className="w-20 rounded-xl border border-border bg-page px-2 py-1 text-xs text-ink" />
                ) : null}
              </div>
              {v8Scope === 'full' && isMobileSafari() && health ? <p className={`mt-2 text-[11px] ${safariFullBlocked ? 'text-danger' : 'text-ink-3'}`}>{safariFullBlocked ? '移动 Safari 已禁用预计超过 64 MiB 的全量导出，请选择按模块或按年份。' : `预计 ${(estimatedV8Bytes / 1024 / 1024).toFixed(1)} MiB，可安全导出。`}</p> : null}
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
              <p className="mt-2 text-[11px] text-ink-3">CSV/ICS 仅用于数据互通；V7 JSON 适合小数据，V8 ZIP 适合长期大数据恢复。</p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-ink-2">导入（恢复备份）</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,application/zip,.json,.workbench.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    if (f.name.toLowerCase().endsWith('.zip')) void handleV8File(f)
                    else handleFile(f)
                  }
                  e.target.value = ''
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={importData.isPending}>
                <Upload size={14} />
                {importData.isPending ? '导入中…' : '选择 JSON / V8 文件'}
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                恢复前会校验文件并要求确认；成功后，备份内容将完整替换当前账号的数据。
              </p>
            </div>
          </div>
        </div>
    </Modal>
    <SensitiveAuthDialog
      open={authOpen}
      title="验证后恢复备份"
      onClose={() => setAuthOpen(false)}
      onVerified={restoreVerified}
    />
  </>
}
