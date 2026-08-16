import type { LedgerAccount, LedgerEntry, LedgerPayee, LedgerRule } from '../types'

export interface LedgerRuleDraft {
  kind: LedgerEntry['kind']
  category: string
  amount_minor: number
  note: string | null
  account_id: string | null
  payee_id: string | null
}

const STAGE_ORDER = { pre: 0, default: 1, post: 2 } as const
const ACTION_FIELDS = new Set(['category', 'account_id', 'payee_id', 'note'])
const CONDITION_FIELDS = new Set(['kind', 'account_id', 'payee_id', 'category', 'note_contains', 'amount_min_minor', 'amount_max_minor'])

export function validateLedgerRuleShape(rule: Pick<LedgerRule, 'conditions' | 'actions'>) {
  if (Object.keys(rule.conditions).some((key) => !CONDITION_FIELDS.has(key))) throw new Error('规则包含不支持的条件')
  if (Object.keys(rule.actions).some((key) => !ACTION_FIELDS.has(key))) throw new Error('规则包含不支持的动作')
}

function matches(draft: LedgerRuleDraft, conditions: Record<string, unknown>) {
  if (conditions.kind && conditions.kind !== draft.kind) return false
  if (conditions.account_id && conditions.account_id !== draft.account_id) return false
  if (conditions.payee_id && conditions.payee_id !== draft.payee_id) return false
  if (conditions.category && conditions.category !== draft.category) return false
  if (conditions.note_contains && !String(draft.note ?? '').toLowerCase().includes(String(conditions.note_contains).toLowerCase())) return false
  if (conditions.amount_min_minor != null && draft.amount_minor < Number(conditions.amount_min_minor)) return false
  if (conditions.amount_max_minor != null && draft.amount_minor > Number(conditions.amount_max_minor)) return false
  return true
}

export function applyLedgerRules(draft: LedgerRuleDraft, rules: LedgerRule[]) {
  let result = { ...draft }
  const changes: Array<{ ruleId: string; name: string; field: string; before: unknown; after: unknown }> = []
  const ordered = rules.filter((rule) => rule.enabled).sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.sort_order - b.sort_order || a.id.localeCompare(b.id))
  for (const rule of ordered) {
    validateLedgerRuleShape(rule)
    if (!matches(result, rule.conditions)) continue
    for (const [field, after] of Object.entries(rule.actions)) {
      const before = result[field as keyof LedgerRuleDraft]
      if (after === before) continue
      result = { ...result, [field]: after }
      changes.push({ ruleId: rule.id, name: rule.name, field, before, after })
    }
  }
  return { result, changes }
}

export function ledgerLabel(id: string | null, values: Array<LedgerAccount | LedgerPayee>) {
  return values.find((value) => value.id === id)?.name ?? null
}
