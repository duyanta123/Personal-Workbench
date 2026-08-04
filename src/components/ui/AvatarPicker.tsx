import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Image, Trash2, Upload } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface AvatarItem {
  id: string
  src: string
  isActive: boolean
}

interface AvatarPickerProps {
  /** 当前头像 URL，没有则显示默认图标 */
  currentSrc: string | null
  /** 全部历史头像（含当前） */
  avatars: AvatarItem[]
  /** 选择新文件上传 */
  onUpload: (file: File) => void
  /** 切换历史头像 */
  onSelect: (id: string) => void
  /** 删除历史头像（当前使用的不会被调用） */
  onDelete: (id: string) => void
}

/** 头像区：hover 显示更换提示，点击打开历史头像面板 */
export default function AvatarPicker({ currentSrc, avatars, onUpload, onSelect, onDelete }: AvatarPickerProps) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onUpload(f)
    e.target.value = ''
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="打开头像面板"
        className="group relative block h-8 w-8 shrink-0 overflow-hidden rounded-lg"
      >
        {currentSrc ? (
          <img
            src={currentSrc}
            alt="当前头像"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-accent text-white">
            <Image size={16} />
          </span>
        )}
        {/* hover 遮罩：灰色圆底 + 白色照片图标 */}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500">
            <Image size={12} className="text-white" />
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-border bg-surface p-3 shadow-raised">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">历史头像</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-hover"
            >
              <Upload size={12} />
              上传
            </button>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {avatars.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  aria-label={`切换到头像 ${a.id}`}
                  className={cn(
                    'block h-10 w-10 overflow-hidden rounded-lg transition-all duration-150',
                    a.isActive ? 'ring-2 ring-accent' : 'hover:opacity-80'
                  )}
                >
                  <img
                    src={a.src}
                    alt={`头像 ${a.id}`}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
                {!a.isActive && (
                  <button
                    type="button"
                    onClick={() => onDelete(a.id)}
                    aria-label={`删除头像 ${a.id}`}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  >
                    <Trash2 size={9} />
                  </button>
                )}
              </div>
            ))}
            {avatars.length === 0 && (
              <p className="col-span-5 py-4 text-center text-[11px] text-ink-3">
                还没有头像，点击「上传」添加
              </p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="上传新头像"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}
    </div>
  )
}
