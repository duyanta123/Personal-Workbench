import assert from 'node:assert/strict'
import test from 'node:test'
import { checkAppendOnlyMigrations, checkDeferredMigrations, checkLocalMigrations, parseMigrationList } from './migration-list.mjs'

test('parses structured Supabase migration output', () => {
  assert.deepEqual(parseMigrationList(`Initialising login role...\n${JSON.stringify({
    migrations: [
      { local: '20260809000002', remote: '20260809000002' },
      { local: '20260810000001', remote: null }
    ]
  })}`), [
    { local: '20260809000002', remote: '20260809000002' },
    { local: '20260810000001', remote: null }
  ])
})

test('parses human-readable Supabase migration tables', () => {
  const output = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260809000002 | 20260809000002 | 2026-08-09 00:00:02
   20260810000001 |                | 2026-08-10 00:00:01
                  | 20260811000001 | 2026-08-11 00:00:01
  `
  assert.deepEqual(parseMigrationList(output), [
    { local: '20260809000002', remote: '20260809000002' },
    { local: '20260810000001', remote: null },
    { local: null, remote: '20260811000001' }
  ])
})

test('fails closed when the CLI output format is unknown', () => {
  assert.throws(
    () => parseMigrationList('Initialising login role...\nNo rows found'),
    /no parseable migration rows/
  )
})

test('accepts a strictly increasing local migration sequence', () => {
  const now = new Date('2026-08-16T12:00:00Z')
  assert.deepEqual(checkLocalMigrations([
    '20260813000001_init.sql',
    '20260815000006_hardening.sql',
    '20260816000001_stage4.sql'
  ], now), [])
})

test('rejects out-of-order local migration timestamps', () => {
  const errors = checkLocalMigrations([
    '20260813000001_init.sql',
    '20260812000001_older.sql'
  ])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /strictly increasing/)
})

test('rejects duplicate local migration timestamps', () => {
  const errors = checkLocalMigrations([
    '20260813000001_init.sql',
    '20260813000001_repeat.sql'
  ])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Duplicate migration timestamp/)
})

test('rejects invalid local migration file names', () => {
  const errors = checkLocalMigrations(['readme.md', '20260813_init.sql'])
  assert.equal(errors.length, 2)
  assert.match(errors[0], /Invalid migration file name/)
  assert.match(errors[1], /Invalid migration file name/)
})

test('rejects migration timestamps from the future', () => {
  const now = new Date('2026-08-16T00:00:00Z')
  const errors = checkLocalMigrations(['20260817000001_future.sql'], now)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /in the future/)
})

test('accepts migrations appended after the target-branch baseline', () => {
  const baseline = [
    '20260813000001_init.sql',
    '20260816000006_search.sql'
  ]
  assert.deepEqual(checkAppendOnlyMigrations([
    ...baseline,
    '20260817000001_next.sql'
  ], baseline), [])
})

test('rejects a committed migration inserted before the target-branch tail', () => {
  const baseline = [
    '20260813000001_init.sql',
    '20260816000006_search.sql'
  ]
  const errors = checkAppendOnlyMigrations([
    '20260813000001_init.sql',
    '20260815000001_backfill.sql',
    '20260816000006_search.sql'
  ], baseline)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Historical migration inserted/)
})

test('rejects removing or renaming a target-branch migration', () => {
  const baseline = [
    '20260813000001_init.sql',
    '20260816000006_search.sql'
  ]
  const errors = checkAppendOnlyMigrations([
    '20260813000001_init.sql',
    '20260817000001_search_renamed.sql'
  ], baseline)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /removed or renamed/)
})

test('accepts deferred migrations newer than every committed migration', () => {
  const result = checkDeferredMigrations(
    ['20260817000001_lockdown.sql'],
    ['20260813000001_init.sql', '20260816000006_search.sql']
  )
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
})

test('rejects a deferred migration reusing a committed timestamp', () => {
  const result = checkDeferredMigrations(
    ['20260816000006_lockdown.sql'],
    ['20260816000006_search.sql']
  )
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /reuses committed migration timestamp/)
})

test('rejects duplicate timestamps among deferred migrations', () => {
  const result = checkDeferredMigrations(
    ['20260817000001_a.sql', '20260817000001_b.sql'],
    []
  )
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /Duplicate deferred migration timestamp/)
})

test('warns without failing when a deferred migration predates the committed tail', () => {
  const result = checkDeferredMigrations(
    ['20260811000002_lockdown.sql'],
    ['20260813000001_init.sql', '20260816000006_search.sql']
  )
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /rename it to a fresh timestamp/)
})

test('rejects invalid deferred migration file names', () => {
  const result = checkDeferredMigrations(['notes.sql'], [])
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /Invalid deferred migration file name/)
})
