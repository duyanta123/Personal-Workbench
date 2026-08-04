/** 每个用户最多保留的头像数量（含当前使用的） */
export const MAX_AVATARS = 5
/** 上传原图大小上限（字节） */
const MAX_FILE_BYTES = 5 * 1024 * 1024

/** 校验上传文件：返回错误文案，合法返回 null */
export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return '请选择图片文件（PNG / JPG / WebP）'
  if (file.size > MAX_FILE_BYTES) return '图片不能超过 5MB'
  return null
}

export interface AvatarLike {
  id: string
  isActive: boolean
  createdAt: string
}

/**
 * 超过上限时选出要被淘汰的头像 id：
 * 按创建时间从旧到新找第一个「非当前使用」的头像。
 * 未超过上限或找不到可淘汰项时返回 null。
 */
export function pickEviction(avatars: AvatarLike[]): string | null {
  if (avatars.length <= MAX_AVATARS) return null
  const sorted = [...avatars].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return sorted.find((a) => !a.isActive)?.id ?? null
}

/** 把存储路径拼成公开可访问的完整 URL */
export function avatarUrl(path: string, baseUrl: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}/storage/v1/object/public/avatars${p}`
}

/** 图片压缩：等比缩到指定边长以内，输出 WebP Blob */
export function compressImage(file: File, maxSize = 256): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 不可用'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('压缩失败'))),
        'image/webp',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片'))
    }
    img.src = url
  })
}
