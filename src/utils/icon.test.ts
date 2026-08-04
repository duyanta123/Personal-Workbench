import { describe, expect, it } from 'vitest'
import { Check, CircleDot, Droplets, Flame, Smile, Target } from 'lucide-react'
import { ICON_CHOICES, resolveIcon } from './icon'

describe('resolveIcon', () => {
  it('图标名返回对应的 lucide 图标', () => {
    expect(resolveIcon('droplets')).toBe(Droplets)
    expect(resolveIcon('target')).toBe(Target)
  })

  it('历史遗留的 emoji 映射为对应 lucide 图标，不渲染 emoji', () => {
    expect(resolveIcon('✅')).toBe(Check)
    expect(resolveIcon('🎯')).toBe(Target)
    expect(resolveIcon('😀')).toBe(Smile)
    expect(resolveIcon('🔥')).toBe(Flame)
  })

  it('未知值回退到默认图标', () => {
    expect(resolveIcon('unknown-icon')).toBe(CircleDot)
  })

  it('空值回退到默认图标', () => {
    expect(resolveIcon()).toBe(CircleDot)
    expect(resolveIcon('')).toBe(CircleDot)
    expect(resolveIcon(null)).toBe(CircleDot)
  })
})

describe('ICON_CHOICES', () => {
  it('只包含可挑选的图标名，不含 emoji，且无重复', () => {
    expect(ICON_CHOICES).toContain('droplets')
    expect(ICON_CHOICES).not.toContain('✅')
    expect(new Set(ICON_CHOICES).size).toBe(ICON_CHOICES.length)
  })
})
