import { describe, expect, test } from 'vitest'
import { DOMAIN_CONTRACTS, conflictFieldSchema, parseDomainQueryKey } from './domainContracts'

describe('domain contracts', () => {
  test('covers every V2 entity kind with stable table and invalidation metadata', () => {
    expect(Object.keys(DOMAIN_CONTRACTS)).toHaveLength(20)
    for (const contract of Object.values(DOMAIN_CONTRACTS)) {
      expect(contract.table).toMatch(/^[a-z_]+$/)
      expect(contract.queryPrefixes.length).toBeGreaterThan(0)
      expect(contract.invalidatePrefixes.length).toBeGreaterThan(0)
      expect(conflictFieldSchema.parse(contract.conflictFields)).toEqual(contract.conflictFields)
    }
  })

  test('rejects empty or non-array query keys', () => {
    expect(() => parseDomainQueryKey([])).toThrow()
    expect(() => parseDomainQueryKey('todos')).toThrow()
    expect(parseDomainQueryKey(['todos', 'page', 0])).toEqual(['todos', 'page', 0])
  })
})
