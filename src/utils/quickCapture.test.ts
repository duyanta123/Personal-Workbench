import { describe, expect, it } from 'vitest'
import { parseQuickCapture } from './quickCapture'
import { validateLedgerCreate, validateNoteCreate, validateTodoCreate } from './createValidation'

const context = {
  today: '2026-08-12',
  categories: { expense: ['宠物'], income: ['稿费'] }
}

describe('parseQuickCapture', () => {
  it('识别自然语言支出和分类', () => {
    const result = parseQuickCapture('中午和同事吃饭 45', context)
    expect(result.selectedKind).toBe('ledger')
    expect(result.candidates[0]).toMatchObject({
      kind: 'ledger',
      confidence: 'likely',
      draft: { kind: 'expense', category: '餐饮', amount: 45, entry_date: '2026-08-12' }
    })
  })

  it('显式前缀覆盖其他语义', () => {
    const result = parseQuickCapture('笔记：明天工资到账 12000', context)
    expect(result.selectedKind).toBe('note')
    expect(result.candidates[0]).toMatchObject({ kind: 'note', confidence: 'exact' })
  })

  it('识别全角金额、收入和用户分类', () => {
    const result = parseQuickCapture('收入：稿费 ￥１２３．４５', context)
    expect(result.selectedKind).toBe('ledger')
    expect(result.candidates[0]).toMatchObject({
      kind: 'ledger',
      draft: { kind: 'income', category: '稿费', amount: 123.45 }
    })
  })

  it('先提取日期，避免将日期数字识别为金额', () => {
    const result = parseQuickCapture('待办：2026/8/20 提交发布报告', context)
    expect(result.candidates[0]).toMatchObject({
      kind: 'todo',
      draft: { due_date: '2026-08-20', text: '提交发布报告' }
    })
  })

  it('识别相对日期和无年份日期', () => {
    expect(parseQuickCapture('明天提交周报', context).candidates[0]).toMatchObject({ draft: { due_date: '2026-08-13' } })
    expect(parseQuickCapture('8月31日完成月报', context).candidates[0]).toMatchObject({ draft: { due_date: '2026-08-31' } })
  })

  it('识别显式优先级并从待办正文移除控制词', () => {
    const result = parseQuickCapture('待办：明天 P0 提交事故复盘 #work/ops', context)
    expect(result.candidates[0]).toMatchObject({
      kind: 'todo',
      draft: { text: '提交事故复盘 #work/ops', level: 'high', due_date: '2026-08-13' }
    })
    expect(result.candidates[0].evidence).toContain('优先级：高优先级')
  })

  it('识别层级标签并写入笔记元数据', () => {
    const result = parseQuickCapture('笔记：发布复盘 #work/project #复盘/发布', context)
    expect(result.candidates[0]).toMatchObject({
      kind: 'note',
      draft: { body: '发布复盘', tags: ['work/project', '复盘/发布'] }
    })
  })

  it('将需要补必填字段的显式实体前缀安全送入 Inbox', () => {
    for (const [source, suggestedKind] of [
      ['习惯：每天喝水', 'habit'], ['目标：存下应急金', 'goal'],
      ['练习：两数之和', 'practice'], ['训练：腿部 45 分钟', 'workout']
    ] as const) {
      const result = parseQuickCapture(source, context)
      expect(result.selectedKind).toBeNull()
      expect(result.candidates[0]).toMatchObject({ kind: 'note', confidence: 'ambiguous', suggestedKind })
    }
  })

  it('多个金额和退款保持歧义，不自动选择', () => {
    const multiple = parseQuickCapture('午饭 45 打车 20', context)
    expect(multiple.selectedKind).toBeNull()
    expect(multiple.candidates[0]).toMatchObject({ kind: 'ledger', confidence: 'ambiguous', missingFields: ['amount'] })

    const refund = parseQuickCapture('午饭退款 45', context)
    expect(refund.selectedKind).toBeNull()
  })

  it('普通文本作为可确认的笔记候选', () => {
    const result = parseQuickCapture('迁移顺利结束，心情很好', context)
    expect(result.selectedKind).toBe('note')
    expect(result.candidates[0]).toMatchObject({ kind: 'note', draft: { body: '迁移顺利结束，心情很好' } })
  })

  it('空输入不生成候选', () => {
    expect(parseQuickCapture('  ', context)).toEqual({ source: '  ', candidates: [], selectedKind: null })
  })
})

describe('shared create validation', () => {
  it('规范待办、账单和笔记创建载荷', () => {
    expect(validateTodoCreate({ text: ' 交周报 ', level: 'mid', due_date: null })).toMatchObject({ text: '交周报', done: false, pinned: false })
    expect(validateLedgerCreate({ kind: 'expense', category: ' 餐饮 ', amount: 45.5, note: ' 午饭 ', entry_date: '2026-08-12' })).toMatchObject({ category: '餐饮', note: '午饭' })
    expect(validateNoteCreate({ title: ' 标题 ', body: ' 正文 ', tags: [] })).toMatchObject({ title: '标题', body: '正文', layout: 'default' })
  })

  it('拒绝缺失、超限和非法日期', () => {
    expect(() => validateTodoCreate({ text: '', level: 'mid' })).toThrow('待办内容')
    expect(() => validateLedgerCreate({ kind: 'expense', category: '餐饮', amount: 10_000_000_000, note: null, entry_date: '2026-08-12' })).toThrow('金额')
    expect(() => validateLedgerCreate({ kind: 'expense', category: '餐饮', amount: 1.234, note: null, entry_date: '2026-08-12' })).toThrow('两位小数')
    expect(() => validateTodoCreate({ text: '测试', level: 'mid', due_date: '2026-02-30' })).toThrow('日期')
  })
})
