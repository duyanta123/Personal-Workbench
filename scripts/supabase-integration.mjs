import assert from 'node:assert/strict'

const base = process.env.SUPABASE_URL || process.env.API_URL || 'http://127.0.0.1:54321'
// 新版 supabase CLI 的 `status -o env` 已改用 PUBLISHABLE_KEY/SECRET_KEY 命名，
// 旧版导出 ANON_KEY/SERVICE_ROLE_KEY；全部兼容以覆盖本地与 CI 的 CLI 版本差。
const key = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY || process.env.PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SECRET_KEY || ''
assert.ok(key, 'SUPABASE_ANON_KEY/ANON_KEY is required')
const password = 'WorkbenchCI!2026'

async function login(email) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const body = await response.json()
  assert.equal(response.ok, true, `login failed for ${email}: ${JSON.stringify(body)}`)
  assert.equal(typeof body.access_token, 'string')
  return body
}

async function api(path, token, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { response, body }
}

async function rpc(name, token, args = {}) {
  return api(`/rest/v1/rpc/${name}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args)
  })
}

function assertRpcOk(result, label) {
  assert.equal(result.response.ok, true, `${label}: ${JSON.stringify(result.body)}`)
  return result.body
}

function uuid() {
  return crypto.randomUUID()
}

const owner = await login('ci-owner@example.test')
const peer = await login('ci-peer@example.test')
assert.ok(Number(owner.expires_in) > 0)
assert.ok(Number(peer.expires_in) > 0)

const ownerRows = await api('/rest/v1/todos?select=id,user_id,text,row_version', owner.access_token)
assert.equal(ownerRows.response.ok, true, JSON.stringify(ownerRows.body))
assert.ok(ownerRows.body.some((row) => row.user_id === '10000000-0000-0000-0000-000000000001'))

const peerRows = await api('/rest/v1/todos?select=id,user_id,text,row_version', peer.access_token)
assert.equal(peerRows.response.ok, true, JSON.stringify(peerRows.body))
assert.equal(peerRows.body.some((row) => row.user_id === '10000000-0000-0000-0000-000000000001'), false, 'RLS leaked owner row')

const state = await rpc('get_user_sync_state', owner.access_token)
assert.equal(state.response.ok, true, JSON.stringify(state.body))
assert.equal(typeof state.body.revision, 'number')
assert.equal(typeof state.body.restore_epoch, 'number')

const health = await rpc('get_backup_health', owner.access_token)
assert.equal(health.response.ok, true, JSON.stringify(health.body))
assert.equal(health.body.max_total_rows, 2000000)

const directPreferenceWrite = await api('/rest/v1/user_preferences?user_id=eq.10000000-0000-0000-0000-000000000001', owner.access_token, {
  method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify({ timezone: 'UTC' })
})
assert.equal(directPreferenceWrite.response.ok, false, 'direct preference write unexpectedly succeeded')

// Two independently issued sessions for the same user exercise the server's
// field-level conflict path rather than relying on a mocked browser client.
const ownerSecondSession = await login('ci-owner@example.test')
const todo = ownerRows.body.find((row) => row.user_id === '10000000-0000-0000-0000-000000000001')
assert.ok(todo?.id && Number.isInteger(todo.row_version), 'seed todo must expose row_version')
const originalText = String(todo.text)
const epoch = Number(state.body.restore_epoch)
const firstUpdate = assertRpcOk(await rpc('apply_workbench_command_v2', owner.access_token, {
  p_command_id: uuid(), p_entity_id: todo.id, p_restore_epoch: epoch,
  p_kind: 'todo.update', p_payload: { text: 'CI first device edit' },
  p_expected: { text: originalText }, p_base_version: Number(todo.row_version), p_depends_on: []
}), 'first device update')
assert.equal(firstUpdate.status, 'applied')
const secondUpdate = assertRpcOk(await rpc('apply_workbench_command_v2', ownerSecondSession.access_token, {
  p_command_id: uuid(), p_entity_id: todo.id, p_restore_epoch: epoch,
  p_kind: 'todo.update', p_payload: { text: 'CI conflicting device edit' },
  p_expected: { text: originalText }, p_base_version: Number(todo.row_version), p_depends_on: []
}), 'second device conflict')
assert.equal(secondUpdate.status, 'conflict')
assert.ok(secondUpdate.conflicting_fields.includes('text'))

// Restore the deterministic seed row so a manually re-run integration job is
// safe even when the database was not reset between attempts.
const currentTodo = firstUpdate.data
const restored = assertRpcOk(await rpc('apply_workbench_command_v2', owner.access_token, {
  p_command_id: uuid(), p_entity_id: todo.id, p_restore_epoch: epoch,
  p_kind: 'todo.update', p_payload: { text: originalText },
  p_expected: { text: currentTodo.text }, p_base_version: Number(currentTodo.row_version), p_depends_on: []
}), 'seed todo restore')
assert.equal(restored.status, 'applied')

// Base currency is changeable while the ledger is empty, then immutable once
// the first entry exists. The command path is used for both operations.
const setUsd = assertRpcOk(await rpc('set_ledger_base_currency_v2', owner.access_token, {
  p_command_id: uuid(), p_restore_epoch: epoch, p_currency: 'USD'
}), 'set USD base currency')
assert.equal(setUsd.status, 'applied')
const ledgerId = uuid()
const createdLedger = assertRpcOk(await rpc('apply_workbench_command_v2', owner.access_token, {
  p_command_id: uuid(), p_entity_id: ledgerId, p_restore_epoch: epoch,
  p_kind: 'ledger.create',
  p_payload: { kind: 'expense', category: 'CI', amount: 1, amount_minor: 100, currency_code: 'USD', note: null, entry_date: '2026-08-23', status: 'posted' },
  p_expected: {}, p_base_version: null, p_depends_on: []
}), 'create USD ledger entry')
assert.equal(createdLedger.status, 'applied')
const blockedCurrency = await rpc('set_ledger_base_currency_v2', owner.access_token, {
  p_command_id: uuid(), p_restore_epoch: epoch, p_currency: 'CNY'
})
assert.equal(blockedCurrency.response.ok, false, 'base currency changed after first ledger entry')
const deletedLedger = assertRpcOk(await rpc('apply_workbench_command_v2', owner.access_token, {
  p_command_id: uuid(), p_entity_id: ledgerId, p_restore_epoch: epoch,
  p_kind: 'ledger.delete', p_payload: {}, p_expected: {},
  p_base_version: Number(createdLedger.data.row_version), p_depends_on: []
}), 'delete CI ledger entry')
assert.equal(deletedLedger.status, 'applied')
const setCny = assertRpcOk(await rpc('set_ledger_base_currency_v2', owner.access_token, {
  p_command_id: uuid(), p_restore_epoch: epoch, p_currency: 'CNY'
}), 'restore CNY base currency')
assert.equal(setCny.status, 'applied')

// Private-avatar/RLS coverage: authenticated users can only list/upload their
// own prefix, and the public object endpoint cannot read a private avatar.
const avatarPath = '10000000-0000-0000-0000-000000000001/ci-integration.webp'
await api(`/storage/v1/object/avatars/${avatarPath}`, owner.access_token, { method: 'DELETE' })
const avatarBytes = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'ascii')
const upload = await api(`/storage/v1/object/avatars/${avatarPath}`, owner.access_token, {
  method: 'POST', headers: { 'content-type': 'image/webp', 'x-upsert': 'true' }, body: avatarBytes
})
assert.equal(upload.response.ok, true, `private avatar upload failed: ${JSON.stringify(upload.body)}`)
const registeredAvatar = assertRpcOk(await rpc('upsert_avatar', owner.access_token, { p_path: avatarPath }), 'register private avatar')
assert.ok(registeredAvatar.avatar_id)
const ownerObjects = await api('/storage/v1/object/list/avatars', owner.access_token, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prefix: '10000000-0000-0000-0000-000000000001/', limit: 100 })
})
assert.equal(ownerObjects.response.ok, true, JSON.stringify(ownerObjects.body))
assert.ok(ownerObjects.body.some((item) => item.name === 'ci-integration.webp'))
const peerObjects = await api('/storage/v1/object/list/avatars', peer.access_token, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prefix: '10000000-0000-0000-0000-000000000001/', limit: 100 })
})
assert.equal(peerObjects.response.ok, true, JSON.stringify(peerObjects.body))
assert.equal(peerObjects.body.some((item) => item.name === 'ci-integration.webp'), false)
const crossUpload = await api(`/storage/v1/object/avatars/${avatarPath}`, peer.access_token, {
  method: 'POST', headers: { 'content-type': 'image/webp' }, body: avatarBytes
})
assert.equal(crossUpload.response.ok, false, 'cross-user avatar upload unexpectedly succeeded')
const publicAvatar = await fetch(`${base}/storage/v1/object/public/avatars/${avatarPath}`)
assert.equal(publicAvatar.ok, false, 'private avatar was publicly readable')
await api(`/storage/v1/object/avatars/${avatarPath}`, owner.access_token, { method: 'DELETE' })
await rpc('delete_avatar', owner.access_token, { p_avatar_id: registeredAvatar.avatar_id })

// A zero-row V7 restore through the real staged protocol proves the restore
// gate and finalize path without modifying the seeded owner's data.
const peerState = await rpc('get_user_sync_state', peer.access_token)
assert.equal(peerState.response.ok, true, JSON.stringify(peerState.body))
const tables = ['todos','habits','habit_logs','ledger_entries','goals','notes','practice_problems','workout_sessions','workout_exercises','body_metrics','pomodoro_sessions','user_preferences','inbox_items','recurrence_rules','ledger_accounts','ledger_payees','ledger_rules','ledger_splits','ledger_reconciliations','entity_links','workbench_templates','saved_views','todo_status_history']
const emptyManifest = Object.fromEntries(tables.map((table) => [table, 0]))
const restore = assertRpcOk(await rpc('begin_restore', peer.access_token, {
  p_expected_revision: Number(peerState.body.revision), p_source_version: 7, p_manifest: emptyManifest
}), 'begin empty V7 restore')
const finalized = assertRpcOk(await rpc('finalize_restore', peer.access_token, { p_restore_id: restore, p_avatar_paths: [] }), 'finalize empty V7 restore')
assert.equal(finalized.restore_epoch, Number(peerState.body.restore_epoch) + 1)

// Service-role-only evidence is intentionally checked even though a freshly
// reset database has fewer than thirty days of snapshots.
if (serviceKey) {
  const evidence = await rpc('get_legacy_rpc_retirement_evidence', serviceKey)
  assert.equal(evidence.response.ok, true, JSON.stringify(evidence.body))
  for (const key of ['eligible', 'zero_days', 'missing_rows', 'invalid_rows', 'positive_daily_delta', 'stats_reset_rows']) assert.ok(key in evidence.body, `legacy evidence missing ${key}`)
  assert.ok(Number(evidence.body.zero_days) >= 1, 'legacy RPC snapshot did not capture the current day')
}

const recent = await login('ci-owner@example.test')
assert.notEqual(recent.access_token, owner.access_token, 'reauthentication did not issue a new JWT')
console.log(JSON.stringify({ login: true, rls: true, offline_replay: 'browser-e2e', dual_device_conflict: true, v7_restore: true, private_avatars: true, currency_lock: true, recent_auth: true, legacy_rpc_evidence: Boolean(serviceKey), backup_health: true, direct_preference_write_denied: true }))
