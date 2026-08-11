/** UTC boundaries for one browser-local calendar day. */
export function localDayRange(date: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('invalid local date')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const start = new Date(year, month - 1, day)
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error('invalid local date')
  }
  const end = new Date(year, month - 1, day + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
