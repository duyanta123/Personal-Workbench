import { z } from 'zod'

/** Shared Zod primitives for every Supabase RPC boundary. */
export const rpcRecordSchema = z.record(z.string(), z.unknown())
export const rpcArraySchema = z.array(z.unknown())
export const rpcNumberSchema = z.number().finite()

export function rpcRecord(value: unknown, name: string): Record<string, unknown> {
  const parsed = rpcRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error(`${name} 返回格式无效`)
  return parsed.data
}

export function rpcArray(value: unknown, name: string): unknown[] {
  const parsed = rpcArraySchema.safeParse(value)
  if (!parsed.success) throw new Error(`${name} 返回格式无效`)
  return parsed.data
}

export function rpcNumber(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback
  const parsed = rpcNumberSchema.safeParse(typeof value === 'number' ? value : Number(value))
  if (!parsed.success) throw new Error(`${name} 返回数值无效`)
  return parsed.data
}
