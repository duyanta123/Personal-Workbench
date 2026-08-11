export function rpcRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 返回格式无效`)
  return value as Record<string, unknown>
}

export function rpcArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} 返回格式无效`)
  return value
}

export function rpcNumber(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`${name} 返回数值无效`)
  return result
}
