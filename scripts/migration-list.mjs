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
