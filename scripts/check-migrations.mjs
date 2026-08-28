import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { checkAppendOnlyMigrations, checkDeferredMigrations, checkLocalMigrations, parseMigrationList } from './migration-list.mjs'

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return null
  }
}

function readMigrationList() {
  const output = execFileSync('supabase', ['migration', 'list', '--linked', '--output-format', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  })
  return parseMigrationList(output)
}

function checkLinked() {
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
}

function readMigrationsAtRef(ref) {
  const output = gitOutput(['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations'])
  if (output === null) return null
  return output
    .split(/\r?\n/)
    .filter((line) => line.endsWith('.sql'))
    .map((line) => basename(line))
    .sort()
}

function readChangedMigrations(ref) {
  const output = gitOutput(['diff', '--name-only', ref, '--', 'supabase/migrations'])
  if (output === null) return null
  return output
    .split(/\r?\n/)
    .filter((line) => line.endsWith('.sql'))
    .map((line) => basename(line))
}

function checkLocalOnly() {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const names = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  const errors = checkLocalMigrations(names)

  let deferredNames = []
  try {
    deferredNames = readdirSync(join(process.cwd(), 'supabase', 'deferred_migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
  } catch {
    deferredNames = []
  }
  const deferred = checkDeferredMigrations(deferredNames, names)
  errors.push(...deferred.errors)
  for (const warning of deferred.warnings) console.warn(warning)

  // CI supplies the target-branch/push predecessor SHA. Local runs compare against HEAD.
  const configuredBaseRef = process.env.MIGRATION_BASE_REF
  const baseRef = configuredBaseRef && !/^0+$/.test(configuredBaseRef) ? configuredBaseRef : configuredBaseRef ? 'HEAD^' : 'HEAD'
  const baseline = readMigrationsAtRef(baseRef)
  const changed = readChangedMigrations(baseRef)
  if (baseline === null || changed === null) {
    const message = `Unable to read append-only migration baseline from ${baseRef}`
    if (process.env.CI || process.env.MIGRATION_BASE_REF) errors.push(message)
    else console.warn(`${message}; skipped outside CI.`)
  } else {
    errors.push(...checkAppendOnlyMigrations(names, baseline))
    const baselineSet = new Set(baseline)
    for (const name of changed) {
      if (baselineSet.has(name) && names.includes(name)) {
        errors.push(`Committed migration was modified: ${name}`)
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log(`Local migration files are consistent (${names.length} files; baseline ${baseRef}).`)
}

if (process.argv.includes('--local-only')) {
  checkLocalOnly()
} else {
  checkLinked()
}
