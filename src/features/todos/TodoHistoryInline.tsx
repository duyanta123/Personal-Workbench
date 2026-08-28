import { useTodoHistory } from '../../hooks/useTodos'

const HISTORY_ACTION_LABELS: Record<string, string> = {
  done: '完成',
  skipped: '跳过',
  reopened: '恢复进行',
  postponed: '延期'
}

/** 周期实例的状态历史（内联小面板） */
export default function TodoHistoryInline({ todoId, onClose }: { todoId: string; onClose: () => void }) {
  const history = useTodoHistory(todoId)
  return (
    <li className="rounded-2xl border border-border bg-nested px-4 py-3 text-xs text-ink-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">状态历史</span>
        <button type="button" onClick={onClose} className="font-medium text-accent">关闭</button>
      </div>
      {history.isLoading ? (
        <div className="mt-2 text-ink-3">加载中…</div>
      ) : !history.data?.length ? (
        <div className="mt-2 text-ink-3">暂无记录</div>
      ) : (
        <ul className="mt-2 space-y-1">
          {history.data.map((row) => (
            <li key={row.id} className="flex items-center gap-2 tabular-nums">
              <span className="font-medium text-ink">{HISTORY_ACTION_LABELS[row.action] ?? row.action}</span>
              {row.action === 'postponed' && row.from_value && row.to_value && (
                <span>{row.from_value} → {row.to_value}</span>
              )}
              <span className="ml-auto text-ink-3">{row.created_at.slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
