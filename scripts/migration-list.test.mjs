import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMigrationList } from './migration-list.mjs'

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
