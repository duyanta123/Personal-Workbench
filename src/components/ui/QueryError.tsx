import { RefreshCw, TriangleAlert } from 'lucide-react'

export default function QueryError({ onRetry, message = '数据加载失败，请检查网络后重试' }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
      <TriangleAlert size={16} />
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="ml-1 inline-flex items-center gap-1 font-medium hover:underline">
        <RefreshCw size={14} />
        重试
      </button>
    </div>
  )
}
