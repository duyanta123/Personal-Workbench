/** 按本地时区把 created_at 格式化为 YYYY-MM-DD（与全站日期口径一致，避免 UTC 串日） */
function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 统计 created_at 落在「本地日期 today」的记录数 */
export function createdTodayCount(notes: { created_at: string }[], today: string): number {
  return notes.filter((n) => localDate(n.created_at) === today).length
}
