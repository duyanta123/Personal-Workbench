import { z } from 'zod'

const jsonObject = z.record(z.string(), z.unknown())

export const workbenchCommandV2Schema = z.object({
  version: z.literal(2),
  commandId: z.string().min(1),
  entityId: z.string().min(1),
  userId: z.string().min(1),
  kind: z.string().min(1),
  payload: jsonObject,
  expected: jsonObject,
  baseVersion: z.number().int().nonnegative().nullable(),
  restoreEpoch: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  dependsOnCommandIds: z.array(z.string()),
  status: z.enum(['pending', 'syncing', 'conflict', 'failed', 'stale', 'resolved']),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  result: z.unknown().optional(),
  resolvedAt: z.string().optional()
}).passthrough()

export const rpcCommandResultSchema = z.object({
  status: z.enum(['applied', 'duplicate', 'conflict', 'not_found', 'stale_restore', 'failed']),
  command_id: z.string(),
  entity_id: z.string(),
  data: jsonObject.nullable(),
  current: jsonObject.nullable(),
  conflicting_fields: z.array(z.string()),
  message: z.string().nullable()
})

export const backupV8ManifestSchema = z.object({
  version: z.literal(8),
  exported_at: z.string().min(1),
  source_revision: z.number().int().nonnegative(),
  restore_epoch: z.number().int().nonnegative(),
  scope: z.object({ kind: z.enum(['full', 'module', 'year']), value: z.string().optional() }).optional(),
  tables: z.record(z.string(), z.object({ path: z.string().min(1), rows: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  avatars: z.array(z.object({ path: z.string().min(1), mime_type: z.string().min(1), is_active: z.boolean(), created_at: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
})

export const backupHealthSchema = z.object({
  table_rows: z.record(z.string(), z.number().int().nonnegative()),
  total_rows: z.number().int().nonnegative(),
  max_table_rows: z.number().int().positive(),
  max_total_rows: z.number().int().positive(),
  estimated_export_bytes: z.number().int().nonnegative(),
  thresholds: z.tuple([z.number(), z.number(), z.number()])
})
