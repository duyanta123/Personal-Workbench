const requireEligible = process.argv.includes('--require-eligible')
const localQueue = Number(process.env.LEGACY_LOCAL_QUEUE_COUNT || 0)
const runbook = process.env.RESTORE_RUNBOOK_VERIFIED === 'true'

async function readServerEvidence() {
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/get_legacy_rpc_retirement_evidence`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({})
  })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = { error: text } }
  if (!response.ok) throw new Error(`legacy RPC evidence RPC failed (${response.status}): ${JSON.stringify(body)}`)
  return body
}

let evidence = null
let evidenceError = null
try {
  evidence = await readServerEvidence()
} catch (error) {
  evidenceError = error instanceof Error ? error.message : String(error)
}

// Without the service-role evidence RPC, the check fails closed. The legacy
// environment variables remain accepted for local dry-runs, but cannot make a
// production --require-eligible check pass on their own.
const envFallback = evidence === null && !process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY
  ? {
      eligible: false,
      zero_days: Number(process.env.LEGACY_RPC_ZERO_DAYS || 0),
      missing_rows: null,
      invalid_rows: null,
      positive_daily_delta: null,
      stats_reset_rows: null,
      evidence_source: 'not_configured'
    }
  : null
const serverEligible = Boolean(evidence?.eligible)
const eligible = serverEligible && localQueue === 0 && runbook
const result = {
  ...(evidence ?? envFallback ?? { eligible: false, evidence_source: 'error' }),
  eligible,
  local_queue_count: localQueue,
  restore_runbook_verified: runbook,
  ...(evidenceError ? { evidence_error: evidenceError } : {})
}
console.log(JSON.stringify(result))
if (requireEligible && !eligible) process.exitCode = 1
