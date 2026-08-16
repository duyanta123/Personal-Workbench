import type { CurrencyCode } from '../types'

export const CURRENCIES: CurrencyCode[] = ['CNY', 'USD', 'EUR', 'HKD', 'GBP']

export function parseMoneyToMinor(value: string | number): number {
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('金额最多保留两位小数')
  const [whole, fraction = ''] = text.split('.')
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('金额超出范围')
  return minor
}

export function formatMinor(amountMinor: number, currency: CurrencyCode = 'CNY') {
  if (!Number.isSafeInteger(amountMinor)) throw new Error('金额必须为整数最小单位')
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amountMinor / 100)
}

export function sumMinor(values: number[]) {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new Error('金额必须为整数最小单位')
    const next = sum + value
    if (!Number.isSafeInteger(next)) throw new Error('金额合计超出范围')
    return next
  }, 0)
}
