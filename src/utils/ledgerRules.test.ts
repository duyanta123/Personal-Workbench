import { describe, expect, it } from 'vitest'
import type { LedgerRule } from '../types'
import { applyLedgerRules } from './ledgerRules'

function rule(id: string, stage: LedgerRule['stage'], sortOrder: number, conditions: Record<string, unknown>, actions: Record<string, unknown>): LedgerRule {
  return { id, user_id: 'user', name: id, stage, sort_order: sortOrder, enabled: true, conditions, actions, created_at: '', updated_at: '' }
}

describe('ledger rules', () => {
  it('applies pre/default/post stages in deterministic order with later overrides', () => {
    const result = applyLedgerRules(
      { kind: 'expense', category: '其他', amount_minor: 1200, note: '地铁充值', account_id: null, payee_id: null },
      [
        rule('post', 'post', 0, { category: '交通' }, { note: '通勤' }),
        rule('default', 'default', 0, { note_contains: '地铁' }, { category: '交通' }),
        rule('pre', 'pre', 0, { amount_min_minor: 1000 }, { account_id: 'cash' })
      ]
    )
    expect(result.result).toMatchObject({ category: '交通', account_id: 'cash', note: '通勤' })
    expect(result.changes.map((change) => change.ruleId)).toEqual(['pre', 'default', 'post'])
  })

  it('ignores disabled and non-matching rules', () => {
    const disabled = { ...rule('disabled', 'default', 0, {}, { category: '错误' }), enabled: false }
    const result = applyLedgerRules(
      { kind: 'income', category: '工资', amount_minor: 100, note: null, account_id: null, payee_id: null },
      [disabled, rule('expense', 'default', 1, { kind: 'expense' }, { category: '错误' })]
    )
    expect(result.changes).toEqual([])
    expect(result.result.category).toBe('工资')
  })
})
