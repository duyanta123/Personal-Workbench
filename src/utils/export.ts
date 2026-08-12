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

interface CalendarTodo {
  id: string
  text: string
  level: string
  done: boolean
  due_date: string | null
  updated_at?: string
}

function escapeICalText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function nextDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function compactDate(value: string) {
  return value.replace(/-/g, '')
}

function calendarTimestamp(todo: CalendarTodo) {
  const timestamp = todo.updated_at ? new Date(todo.updated_at) : null
  if (timestamp && !Number.isNaN(timestamp.getTime())) {
    return timestamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  }
  return `${compactDate(todo.due_date!)}T000000Z`
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function foldICalLine(line: string) {
  const parts: string[] = []
  let current = ''
  let limit = 75
  for (const character of line) {
    if (current && utf8Bytes(current + character) > limit) {
      parts.push(current)
      current = ` ${character}`
      limit = 75
    } else {
      current += character
    }
  }
  if (current || parts.length === 0) parts.push(current)
  return parts.join('\r\n')
}

export function buildICalendar(todos: CalendarTodo[], options: { includeCompleted?: boolean } = {}) {
  const events = todos
    .filter((todo) => Boolean(todo.due_date) && (options.includeCompleted || !todo.done))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || a.id.localeCompare(b.id))
    .flatMap((todo) => [
      'BEGIN:VEVENT',
      `UID:${escapeICalText(todo.id)}@personal-workbench`,
      `DTSTAMP:${calendarTimestamp(todo)}`,
      `DTSTART;VALUE=DATE:${compactDate(todo.due_date!)}`,
      `DTEND;VALUE=DATE:${nextDate(todo.due_date!)}`,
      `SUMMARY:${escapeICalText(`${todo.done ? '[已完成] ' : ''}${todo.text}`)}`,
      `DESCRIPTION:${escapeICalText(`优先级：${todo.level}`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    ])
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Workbench//Todo Export//ZH-CN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR'
  ].map(foldICalLine).join('\r\n') + '\r\n'
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
