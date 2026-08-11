/** CSV 单元格转义：逗号 / 引号 / 换行 */
function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const raw = String(v)
  const s = typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 生成 CSV 文本（含表头） */
export function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n')
}

/** 生成缩进 JSON 文本 */
export function buildJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** 触发浏览器下载（CSV 自动加 BOM，Excel 打开不乱码） */
export function downloadFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const isCsv = mime.startsWith('text/csv')
  const blob = new Blob([isCsv ? '\uFEFF' : '', content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
