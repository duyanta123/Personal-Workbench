import type { SyncMetadata, WorkbenchCommandV2 } from './commands'
import type { SyncState } from './syncCore'

export function buildSyncDiagnostics(input: {
  online: boolean
  commands: WorkbenchCommandV2[]
  metadata: SyncMetadata
  syncState: SyncState | null
  generatedAt?: string
}) {
  const statusCounts = Object.fromEntries(
    ['pending', 'syncing', 'conflict', 'failed', 'stale', 'resolved']
      .map((status) => [status, input.commands.filter((command) => command.status === status).length])
  )
  return {
    schema: 'workbench-sync-diagnostics-v1',
    generated_at: input.generatedAt ?? new Date().toISOString(),
    release: import.meta.env.VITE_APP_RELEASE ?? 'development',
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
    online: input.online,
    queue: { total: input.commands.length, statuses: statusCounts },
    sync: {
      last_attempt_at: input.metadata.lastAttemptAt,
      last_success_at: input.metadata.lastSuccessAt,
      revision: input.syncState?.revision ?? null,
      restore_epoch: input.syncState?.restore_epoch ?? null
    }
  }
}
