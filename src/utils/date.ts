/** 返回本地时区日期 YYYY-MM-DD，offsetDays 可偏移（正数未来/负数过去） */
export function dateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const todayStr = () => dateStr(0)

/** 返回当前月份前缀 YYYY-MM */
export function monthPrefix(): string {
  return todayStr().slice(0, 7)
}
