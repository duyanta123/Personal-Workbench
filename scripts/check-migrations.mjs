import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { checkLocalMigrations, parseMigrationList } from './migration-list.mjs'

const VERSION_OF = /^(\d{14})_/

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
    console.log(`Migration history is consistent (${mismatches.length} core migrations).`)
  }
}

/** 已提交基线：git 跟踪的迁移文件名（按版本序）。git 不可用时返回 null。 */
function readTrackedMigrations() {
  try {
    const output = execFileSync('git', ['ls-files', '--', 'supabase/migrations'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return output
      .split(/\r?\n/)
      .filter((line) => line.endsWith('.sql'))
      .map((line) => basename(line))
      .sort()
  } catch {
    return null
  }
}

function checkLocalOnly() {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const names = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  const errors = checkLocalMigrations(names)

  // 基线对比：仅排序后的格式/重复检查无法发现历史回插（排序后依然有序）。
  // 与 git 已提交列表对比：已提交文件不可删除/重命名，新增文件只能出现在尾部。
  const tracked = readTrackedMigrations()
  if (tracked === null) {
    console.warn('git unavailable; skipped append-only baseline check.')
  } else if (tracked.length > 0) {
    const trackedSet = new Set(tracked)
    for (const name of tracked) {
      if (!names.includes(name)) errors.push(`Committed migration was removed or renamed: ${name}`)
    }
    const lastTrackedVersion = tracked[tracked.length - 1].match(VERSION_OF)?.[1] ?? ''
    for (const name of names) {
      if (trackedSet.has(name)) continue
      const version = name.match(VERSION_OF)?.[1] ?? ''
      if (version && lastTrackedVersion && version < lastTrackedVersion) {
        errors.push(`Historical migration inserted: ${name} predates committed ${tracked[tracked.length - 1]}`)
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log(`Local migration files are consistent (${names.length} files).`)
}

if (process.argv.includes('--local-only')) {
  checkLocalOnly()
} else {
  checkLinked()
}
