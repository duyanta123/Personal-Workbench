import { describe, expect, it } from 'vitest'
import { rpcArray, rpcNumber, rpcRecord } from './rpcSchemas'

describe('shared RPC runtime contracts', () => {
  it('accepts object and array payloads while rejecting scalars', () => {
    expect(rpcRecord({ value: 1 }, 'record')).toEqual({ value: 1 })
    expect(rpcArray([{ id: 'a' }], 'array')).toEqual([{ id: 'a' }])
    expect(() => rpcRecord(null, 'record')).toThrow()
    expect(() => rpcArray({ value: 1 }, 'array')).toThrow()
  })

  it('normalizes finite numeric RPC values and preserves explicit defaults', () => {
    expect(rpcNumber('12.5', 'number')).toBe(12.5)
    expect(rpcNumber(undefined, 'number', 3)).toBe(3)
    expect(() => rpcNumber('Infinity', 'number')).toThrow()
  })
})
