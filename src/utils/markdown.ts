import { safeExternalUrlOrNull } from './validation'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

function inlineMarkdown(value: string) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawUrl: string) => {
    const url = safeExternalUrlOrNull(rawUrl)
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>` : label
  })
  return html
}

function splitTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  return trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|')
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line)
  return Boolean(cells && cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell)))
}

function renderTableRow(cells: string[], tag: 'th' | 'td') {
  return `<tr>${cells.map((cell) => `<${tag}>${inlineMarkdown(cell.trim())}</${tag}>`).join('')}</tr>`
}

/** 将受限 Markdown（含 GFM 表格/任务列表/引用块）转为已转义 HTML；原始 HTML 与危险 URL 会被当作文本或移除。 */
export function renderSafeMarkdown(source: string) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let inList = false
  let inCode = false
  let inQuote = false
  const closeList = () => { if (inList) { output.push('</ul>'); inList = false } }
  const closeQuote = () => { if (inQuote) { output.push('</blockquote>'); inQuote = false } }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim().startsWith('```')) {
      closeList()
      closeQuote()
      if (inCode) output.push('</code></pre>')
      else output.push('<pre><code>')
      inCode = !inCode
      continue
    }
    if (inCode) { output.push(escapeHtml(line) + '\n'); continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      closeList()
      closeQuote()
      output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`)
      continue
    }
    // GFM 表格：表头行 + 分隔行 + 数据行
    const headerCells = splitTableRow(line)
    if (headerCells && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      closeList()
      closeQuote()
      const rows = [renderTableRow(headerCells, 'th')]
      index += 2
      while (index < lines.length) {
        const cells = splitTableRow(lines[index])
        if (!cells) break
        rows.push(renderTableRow(cells, 'td'))
        index += 1
      }
      index -= 1
      output.push(`<table><tbody>${rows.join('')}</tbody></table>`)
      continue
    }
    // GFM 引用块（连续 > 行合并）
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      closeList()
      if (!inQuote) { output.push('<blockquote>'); inQuote = true }
      output.push(quote[1].trim() ? `<p>${inlineMarkdown(quote[1])}</p>` : '<br />')
      continue
    }
    closeQuote()
    // GFM 任务列表
    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/)
    if (task) {
      if (!inList) { output.push('<ul class="md-task-list">'); inList = true }
      output.push(`<li class="md-task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'} /> ${inlineMarkdown(task[2])}</li>`)
      continue
    }
    const list = line.match(/^\s*[-*+]\s+(.+)$/)
    if (list) {
      if (!inList) { output.push('<ul>'); inList = true }
      output.push(`<li>${inlineMarkdown(list[1])}</li>`)
      continue
    }
    closeList()
    if (!line.trim()) { output.push('<br />'); continue }
    output.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  closeList()
  closeQuote()
  if (inCode) output.push('</code></pre>')
  return output.join('')
}
