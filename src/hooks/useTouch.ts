import { useState } from 'react'

/**
 * 是否为触屏设备（无 hover 能力）。
 * 用于移动端让操作按钮常显（删除/排序等），桌面端保留 hover 显现。
 */
export function useTouch(): boolean {
  const [touch] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(hover: none), (pointer: coarse)').matches
  })
  return touch
}
