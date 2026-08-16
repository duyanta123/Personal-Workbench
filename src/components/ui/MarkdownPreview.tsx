import { renderSafeMarkdown } from '../../utils/markdown'

export default function MarkdownPreview({ source, className = '' }: { source: string; className?: string }) {
  return <div className={`prose prose-sm max-w-none text-ink-2 [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-3 [&_code]:rounded [&_code]:bg-nested [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-nested [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-nested [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_.md-task-list]:list-none [&_.md-task-list]:pl-0 [&_.md-task]:flex [&_.md-task]:items-baseline [&_.md-task]:gap-1.5 ${className}`} dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(source) }} />
}
