import { describe, expect, test, vi } from 'vitest'
import { reconcileAvatarFiles, type AvatarReconcileSource } from './avatarReconcile'

function source(overrides: Partial<AvatarReconcileSource> = {}): AvatarReconcileSource {
  return {
    revision: vi.fn().mockResolvedValue(1),
    records: vi.fn().mockResolvedValue([]),
    files: vi.fn().mockResolvedValue([{ name: 'old.webp', created_at: '2026-08-01T00:00:00Z' }]),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('reconcileAvatarFiles', () => {
  const now = new Date('2026-08-08T12:00:00Z').getTime()

  test('数据库查询失败时绝不删除', async () => {
    const api = source({ records: vi.fn().mockRejectedValue(new Error('db')) })
    expect(await reconcileAvatarFiles('u1', api, now)).toEqual([])
    expect(api.remove).not.toHaveBeenCalled()
  })

  test('修订号变化时绝不删除', async () => {
    const api = source({ revision: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2) })
    expect(await reconcileAvatarFiles('u1', api, now)).toEqual([])
    expect(api.remove).not.toHaveBeenCalled()
  })

  test('不足 24 小时或缺少可靠时间时绝不删除', async () => {
    const recent = source({ files: vi.fn().mockResolvedValue([{ name: 'new.webp', created_at: '2026-08-08T00:00:01Z' }]) })
    expect(await reconcileAvatarFiles('u1', recent, now)).toEqual([])
    expect(recent.remove).not.toHaveBeenCalled()
    const unknown = source({ files: vi.fn().mockResolvedValue([{ name: 'unknown.webp' }]) })
    expect(await reconcileAvatarFiles('u1', unknown, now)).toEqual([])
    expect(unknown.remove).not.toHaveBeenCalled()
  })

  test('仅删除超过 24 小时且数据库未引用的文件', async () => {
    const api = source({
      records: vi.fn().mockResolvedValue([{ storage_path: 'u1/keep.webp' }]),
      files: vi.fn().mockResolvedValue([
        { name: 'keep.webp', created_at: '2026-08-01T00:00:00Z' },
        { name: 'old.webp', created_at: '2026-08-01T00:00:00Z' }
      ])
    })
    expect(await reconcileAvatarFiles('u1', api, now)).toEqual(['u1/old.webp'])
    expect(api.remove).toHaveBeenCalledWith(['u1/old.webp'])
  })
})
