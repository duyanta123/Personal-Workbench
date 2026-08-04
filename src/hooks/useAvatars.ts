import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserAvatar } from '../types'
import { compressImage, validateAvatarFile } from '../utils/avatar'

export const avatarsKey = ['avatars']

/** 当前用户头像列表（旧的在前） */
export function useAvatars() {
  return useQuery({
    queryKey: avatarsKey,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('user_avatars')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as UserAvatar[]
    },
    enabled: !!supabase
  })
}

async function currentUid(): Promise<string> {
  const {
    data: { user }
  } = await supabase!.auth.getUser()
  if (!user) throw new Error('未登录')
  return user.id
}

/** 上传新头像：压缩 → 存 storage → 写记录并自动淘汰最旧 */
export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const err = validateAvatarFile(file)
      if (err) throw new Error(err)

      const uid = await currentUid()
      const blob = await compressImage(file)
      const path = `${uid}/${crypto.randomUUID()}.webp`

      const { error: upErr } = await supabase!.storage.from('avatars').upload(path, blob, {
        contentType: 'image/webp'
      })
      if (upErr) throw upErr

      const { data, error } = await supabase!.rpc('upsert_avatar', { p_path: path })
      if (error) throw error

      const evicted = (data?.evicted_paths ?? []) as string[]
      if (evicted.length > 0) {
        await supabase!.storage.from('avatars').remove(evicted)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey })
  })
}

/** 切换历史头像为当前使用 */
export function useSetActiveAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (avatarId: string) => {
      const { error } = await supabase!.rpc('set_active_avatar', { p_avatar_id: avatarId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey })
  })
}

/** 删除历史头像（storage 与记录一并清理） */
export function useDeleteAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (avatarId: string) => {
      const { data: path, error } = await supabase!.rpc('delete_avatar', { p_avatar_id: avatarId })
      if (error) throw error
      if (path) {
        const { error: rmErr } = await supabase!.storage.from('avatars').remove([path])
        if (rmErr) throw rmErr
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: avatarsKey })
  })
}
