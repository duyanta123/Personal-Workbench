export type CursorValue = string | number | boolean
export type PageCursor = Record<string, CursorValue>

const cursors = new Map<string, Map<number, PageCursor | null>>()

export function cursorScope(parts: readonly unknown[]) {
  return JSON.stringify(parts)
}

export function getPageCursor(scope: string, page: number): PageCursor | null {
  return cursors.get(scope)?.get(page) ?? null
}

export function rememberPageCursor(scope: string, page: number, cursor: PageCursor | null) {
  const pages = cursors.get(scope) ?? new Map<number, PageCursor | null>()
  pages.set(page, cursor)
  cursors.set(scope, pages)
}

export function cursorToken(cursor: PageCursor | null) {
  return cursor ? JSON.stringify(cursor) : ''
}

function literal(value: CursorValue) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Build a PostgREST lexicographic "after" predicate for a stable order. */
export function cursorArms(
  cursor: PageCursor,
  fields: readonly { column: string; direction: 'asc' | 'desc' }[]
) {
  return fields.map((field, index) => {
    const value = cursor[field.column]
    if (value === undefined) throw new Error(`Missing cursor field: ${field.column}`)
    const equalPrefix = fields.slice(0, index).map((prefix) => {
      const prefixValue = cursor[prefix.column]
      if (prefixValue === undefined) throw new Error(`Missing cursor field: ${prefix.column}`)
      return `${prefix.column}.eq.${literal(prefixValue)}`
    })
    const operator = field.direction === 'asc' ? 'gt' : 'lt'
    const terms = [...equalPrefix, `${field.column}.${operator}.${literal(value)}`]
    return terms.length === 1 ? terms[0] : `and(${terms.join(',')})`
  })
}

/** Contents for a PostgREST `.or(...)` call, with a required OR group. */
export function afterCursor(
  cursor: PageCursor,
  fields: readonly { column: string; direction: 'asc' | 'desc' }[],
  requiredOr?: string
) {
  const arms = cursorArms(cursor, fields)
  return requiredOr
    ? arms.map((arm) => `and(or(${requiredOr}),${arm})`).join(',')
    : arms.join(',')
}

export function clearCursorScopes() {
  cursors.clear()
}
