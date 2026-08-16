const VERSION = /\b\d{14}\b/

function migrationVersion(value) {
  return String(value ?? '').match(VERSION)?.[0] ?? null
}

function parseJson(output) {
  for (let start = output.indexOf('{'); start >= 0; start = output.indexOf('{', start + 1)) {
    try {
      const value = JSON.parse(output.slice(start))
      if (!Array.isArray(value?.migrations)) continue
      return value.migrations
        .map((migration) => ({
          local: migrationVersion(migration?.local),
          remote: migrationVersion(migration?.remote)
        }))
        .filter((migration) => migration.local || migration.remote)
    } catch {
      // A human-readable prefix or table may contain braces. Try the next one.
    }
  }
  return null
}

function parseTable(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.split('|'))
    .filter((columns) => columns.length >= 2)
    .map(([local, remote]) => ({
      local: migrationVersion(local),
      remote: migrationVersion(remote)
    }))
    .filter((migration) => migration.local || migration.remote)
}

export function parseMigrationList(output) {
  const migrations = parseJson(output) ?? parseTable(output)
  if (migrations.length === 0) {
    throw new Error('Supabase CLI returned no parseable migration rows')
  }
  return migrations
}

const MIGRATION_FILE_NAME = /^(\d{14})_[^.]+\.sql$/

function utcVersionStamp(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('')
}

// 校验本地迁移文件名：时间戳格式合法、严格递增、无重复、不晚于当前 UTC 时间。
export function checkLocalMigrations(names, now = new Date()) {
  const errors = []
  const versions = []
  const seen = new Map()
  for (const name of names) {
    const version = name.match(MIGRATION_FILE_NAME)?.[1]
    if (!version) {
      errors.push(`Invalid migration file name: ${name}`)
      continue
    }
    if (seen.has(version)) {
      errors.push(`Duplicate migration timestamp ${version}: ${seen.get(version)} and ${name}`)
      continue
    }
    seen.set(version, name)
    versions.push({ version, name })
  }
  for (let index = 1; index < versions.length; index += 1) {
    if (versions[index].version <= versions[index - 1].version) {
      errors.push(`Migration timestamps must be strictly increasing: ${versions[index - 1].name} -> ${versions[index].name}`)
    }
  }
  const currentStamp = utcVersionStamp(now)
  for (const { version, name } of versions) {
    if (version > currentStamp) {
      errors.push(`Migration timestamp is in the future: ${name}`)
    }
  }
  return errors
}

export function checkAppendOnlyMigrations(names, baselineNames) {
  if (baselineNames.length === 0) return []

  const errors = []
  const current = new Set(names)
  const baseline = new Set(baselineNames)
  const lastBaselineName = baselineNames.at(-1)
  const lastBaselineVersion = lastBaselineName?.match(MIGRATION_FILE_NAME)?.[1] ?? ''

  for (const name of baselineNames) {
    if (!current.has(name)) {
      errors.push(`Committed migration was removed or renamed: ${name}`)
    }
  }

  for (const name of names) {
    if (baseline.has(name)) continue
    const version = name.match(MIGRATION_FILE_NAME)?.[1] ?? ''
    if (version && lastBaselineVersion && version <= lastBaselineVersion) {
      errors.push(`Historical migration inserted: ${name} does not follow committed ${lastBaselineName}`)
    }
  }

  return errors
}
