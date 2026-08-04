import { describe, expect, it } from 'vitest'
import { avatarUrl, pickEviction, validateAvatarFile, MAX_AVATARS } from './avatar'

describe('validateAvatarFile', () => {
  it('接受常见图片格式', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    expect(validateAvatarFile(file)).toBeNull()
  })

  it('拒绝非图片文件', () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    expect(validateAvatarFile(file)).toContain('图片')
  })

  it('拒绝超过 5MB 的图片', () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(validateAvatarFile(big)).toContain('5MB')
  })
})

describe('pickEviction', () => {
  const av = (id: string, isActive: boolean, createdAt: string) => ({ id, isActive, createdAt })

  it('未超过上限时不淘汰任何头像', () => {
    const list = [
      av('a', false, '2026-01-01'),
      av('b', true, '2026-01-02'),
      av('c', false, '2026-01-03'),
      av('d', false, '2026-01-04')
    ]
    expect(pickEviction(list)).toBeNull()
  })

  it('超过上限时淘汰最旧且非当前使用的头像', () => {
    const list = [
      av('a', false, '2026-01-01'),
      av('b', false, '2026-01-02'),
      av('c', true, '2026-01-03'),
      av('d', false, '2026-01-04'),
      av('e', false, '2026-01-05'),
      av('f', false, '2026-01-06')
    ]
    expect(pickEviction(list)).toBe('a')
  })

  it('最旧的是当前使用时不淘汰它，继续找下一个', () => {
    const list = [
      av('a', true, '2026-01-01'),
      av('b', false, '2026-01-02'),
      av('c', false, '2026-01-03'),
      av('d', false, '2026-01-04'),
      av('e', false, '2026-01-05'),
      av('f', false, '2026-01-06')
    ]
    expect(pickEviction(list)).toBe('b')
  })

  it('上限与全局常量一致', () => {
    expect(MAX_AVATARS).toBe(5)
  })
})

describe('avatarUrl', () => {
  it('拼接公开存储 URL', () => {
    expect(avatarUrl('u1/abc.webp', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/avatars/u1/abc.webp'
    )
  })

  it('路径已含反斜杠时不重复拼接', () => {
    expect(avatarUrl('/u1/abc.webp', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/avatars/u1/abc.webp'
    )
  })
})
