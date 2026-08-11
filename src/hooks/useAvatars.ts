import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserAvatar } from '../types'
import { compressImage, validateAvatarFile } from '../utils/avatar'
import { useAuth } from './useAuth'
import { reconcileAvatarFiles } from '../utils/avatarReconcile'
import { enqueueOperation } from '../lib/outbox'
import { getLocalValue, localKeys, setLocalValue } from '../lib/localData'

export const avatarsKey = (userId: string | null) => ['avatars', userId] as const

/** 当前用户头像列表（旧的在前） */
export function useAvatars() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: avatarsKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('user_avatars')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as UserAvatar[]
    },
    enabled: !!supabase && !!userId
  })
}

/** Private online URLs with a per-user Blob fallback for offline reloads. */
export function useAvatarSources(avatars: UserAvatar[] | undefined) {
  const { userId } = useAuth()
  const [sources, setSources] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!userId || !avatars?.length) {
      setSources({})
      return
    }
    let active = true
    const objectUrls: string[] = []
    const paths = avatars.map((avatar) => avatar.storage_path)

    const loadCached = async () => {
      const cached = await Promise.all(paths.map(async (path) => {
        try {
          const blob = await getLocalValue<Blob>(userId, localKeys.avatar(path))
          if (!blob) return null
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          return [path, url] as const
        } catch {
          return null
        }
      }))
      if (active) setSources(Object.fromEntries(cached.filter((row): row is readonly [string, string] => Boolean(row))))
    }

    const refreshSigned = async () => {
      if (!navigator.onLine) return
      const { data, error } = await supabase!.storage.from('avatars').createSignedUrls(paths, 5 * 60)
      if (error || !active) return
      const available = data.filter(
        (row): row is typeof row & { path: string; signedUrl: string } => Boolean(row.path && row.signedUrl)
      )
      const signed = Object.fromEntries(available.map((row) => [row.path, row.signedUrl]))
      setSources((current) => ({ ...current, ...signed }))
      await Promise.all(available.map(async (row) => {
        try {
          const response = await fetch(row.signedUrl, { referrerPolicy: 'no-referrer' })
          if (response.ok) await setLocalValue(userId, localKeys.avatar(row.path), await response.blob())
        } catch {
          // The signed URL remains usable online; Blob caching is best effort.
        }
      }))
    }

    void loadCached().then(refreshSigned)
    const timer = window.setInterval(() => void refreshSigned(), 4 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [userId, avatars])

  return sources
}

async function currentUid(): Promise<string> {
  const {
    data: { user }
  } = await supabase!.auth.getUser()
  if (!user) throw new Error('未登录')
  return user.id
}

export async function reconcileAvatarStorage(uid: string): Promise<void> {
  await reconcileAvatarFiles(uid, {
    revision: async () => {
      const result = await supabase!.rpc('get_user_data_revision')
      if (result.error || result.data === null || result.data === undefined) throw result.error ?? new Error('revision missing')
      return result.data
    },
    records: async () => {
      const { data, error } = await supabase!.from('user_avatars').select('storage_path')
      if (error || !data) throw error ?? new Error('avatar records missing')
      return data
    },
    files: async () => {
      const files: { name: string; updated_at?: string | null; created_at?: string | null }[] = []
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabase!.storage.from('avatars').list(uid, { limit: 100, offset })
        if (error || !data) throw error ?? new Error('avatar files missing')
        files.push(...data)
        if (data.length < 100) return files
      }
    },
    remove: async (paths) => {
      const { error } = await supabase!.storage.from('avatars').remove(paths)
      if (error) throw error
    }
  })
}

/** Run lazy orphan reconciliation once when a signed-in user opens the app. */
export function useAvatarStorageReconciliation() {
  const { userId } = useAuth()
  const reconciled = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || reconciled.current === userId) return
    reconciled.current = userId
    void reconcileAvatarStorage(userId).catch(() => undefined)
  }, [userId])
}

/** 上传新头像：压缩 → 存 storage → 写记录并自动淘汰最旧 */
export function useUploadAvatar() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (file: File) => {
      const err = validateAvatarFile(file)
      if (err) throw new Error(err)

      const uid = await currentUid()
      const blob = await compressImage(file)
      const operationId = crypto.randomUUID()
      const path = `${uid}/${operationId}.webp`

      let uploaded = false
      let lastError: unknown
      for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
        const { error } = await supabase!.storage.from('avatars').upload(path, blob, { contentType: 'image/webp' })
        if (!error || /already exists|duplicate/i.test(error.message)) uploaded = true
        else lastError = error
      }
      if (!uploaded) throw lastError

      let operation
      try {
        operation = await enqueueOperation<{ evicted_paths?: string[] }>(
          uid,
          'avatar.register',
          { path },
          operationId
        )
      } catch (error) {
        await supabase!.storage.from('avatars').remove([path])
        throw error
      }

      const evicted = operation.data?.evicted_paths ?? []
      if (evicted.length > 0) {
        await supabase!.storage.from('avatars').remove(evicted).catch(() => undefined)
      }
      await reconcileAvatarStorage(uid).catch(() => undefined)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey(userId) })
  })
}

/** 切换历史头像为当前使用 */
export function useSetActiveAvatar() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (avatarId: string) => {
      const { error } = await supabase!.rpc('set_active_avatar', { p_avatar_id: avatarId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey(userId) })
  })
}

/** 删除历史头像（storage 与记录一并清理） */
export function useDeleteAvatar() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: async (avatarId: string) => {
      const { data: path, error } = await supabase!.rpc('delete_avatar', { p_avatar_id: avatarId })
      if (error) throw error
      if (path) {
        await supabase!.storage.from('avatars').remove([path]).catch(() => undefined)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey(userId) })
  })
}
