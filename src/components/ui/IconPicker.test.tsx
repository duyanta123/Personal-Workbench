import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import IconPicker from './IconPicker'
import { ICON_CHOICES } from '../../utils/icon'

describe('IconPicker', () => {
  it('渲染当前选中图标的触发按钮', () => {
    render(<IconPicker value="flame" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '选择图标' })).toBeInTheDocument()
  })

  it('点击后展开图标面板，点选图标后回调图标名', () => {
    const onChange = vi.fn()
    render(<IconPicker value="flame" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '选择图标' }))
    fireEvent.click(screen.getByRole('button', { name: 'target' }))
    expect(onChange).toHaveBeenCalledWith('target')
  })

  it('图标面板包含全部可选图标', () => {
    render(<IconPicker value="flame" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '选择图标' }))
    expect(screen.getAllByRole('button').length).toBe(ICON_CHOICES.length + 1)
  })
})
