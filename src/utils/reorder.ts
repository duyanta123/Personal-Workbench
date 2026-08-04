/** 把 from 位置的元素移动到 to 位置；索引非法或相同则原样返回（不修改原数组） */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items]
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
