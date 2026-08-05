const META_FIELDS = ['id', 'user_id', 'created_at', 'updated_at'] as const

/** 去掉导出记录中的 id / user_id / 时间戳，导入时重新分配 */
export function stripMeta<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const copy = { ...row }
    for (const f of META_FIELDS) delete copy[f]
    return copy
  })
}

/** 按 旧 id → 新 id 映射表重写外键列；未在映射表中的值保持不变 */
export function remapColumn(
  rows: Record<string, unknown>[],
  map: Map<string, string>,
  column: string
): Record<string, unknown>[] {
  return rows.map((row) => {
    const old = row[column]
    if (typeof old !== 'string' || !map.has(old)) return row
    return { ...row, [column]: map.get(old) }
  })
}

/** 旧记录（含 id）与插入后返回的新记录按顺序一一对应，建立 id 映射 */
export function collectIdMap(
  oldRows: { id: string }[],
  newRows: { id: string }[]
): Map<string, string> {
  const map = new Map<string, string>()
  oldRows.forEach((old, i) => {
    const inserted = newRows[i]
    if (inserted) map.set(old.id, inserted.id)
  })
  return map
}
