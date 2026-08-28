import type { Todo } from '../../types'
import EntityLinksPanel from '../../components/ui/EntityLinksPanel'

export default function TodoFocusPanel({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-accent bg-accent-2/40 p-4 shadow-card">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">搜索定位</div>
        <div className="mt-1 text-sm font-semibold text-ink">{todo.text}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 text-xs font-medium text-accent"
        >
          关闭定位
        </button>
      </div>
      <EntityLinksPanel sourceKind="todo" sourceId={todo.id} />
    </div>
  )
}
