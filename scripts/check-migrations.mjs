import { execFileSync } from 'node:child_process'
import { parseMigrationList } from './migration-list.mjs'

function readMigrationList() {
  const output = execFileSync('supabase', ['migration', 'list', '--linked', '--output-format', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  })
  return parseMigrationList(output)
}

const migrations = readMigrationList()
const mismatches = migrations.filter((migration) => migration.local !== migration.remote)

if (mismatches.length > 0) {
  for (const migration of mismatches) {
    console.error(`Migration mismatch: local=${migration.local || '-'} remote=${migration.remote || '-'}`)
  }
  process.exitCode = 1
} else {
  console.log(`Migration history is consistent (${migrations.length} core migrations).`)
}
