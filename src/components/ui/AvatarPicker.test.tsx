import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AvatarPicker from './AvatarPicker'

interface Item {
  id: string
  src: string
  isActive: boolean
}

const items: Item[] = [
  { id: 'a', src: 'https://x/avatar-a.png', isActive: true },
  { id: 'b', src: 'https://x/avatar-b.png', isActive: false }
]

describe('AvatarPicker', () => {
  it('有当前头像时渲染图片', () => {
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={() => {}} onSelect={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('img', { name: '当前头像' })).toHaveAttribute('src', 'https://x/avatar-a.png')
  })

  it('没有头像时渲染默认图标', () => {
    render(<AvatarPicker currentSrc={null} avatars={[]} onUpload={() => {}} onSelect={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('button', { name: '打开头像面板' })).toBeInTheDocument()
  })

  it('点击头像打开面板，展示全部历史头像', () => {
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={() => {}} onSelect={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '打开头像面板' }))
    expect(screen.getByRole('img', { name: '头像 a' })).toHaveAttribute('src', 'https://x/avatar-a.png')
    expect(screen.getByRole('img', { name: '头像 b' })).toHaveAttribute('src', 'https://x/avatar-b.png')
  })

  it('点选历史头像时回调 id', () => {
    const onSelect = vi.fn()
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={() => {}} onSelect={onSelect} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '打开头像面板' }))
    fireEvent.click(screen.getByRole('button', { name: '切换到头像 b' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('删除非当前头像时回调 id', () => {
    const onDelete = vi.fn()
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={() => {}} onSelect={() => {}} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: '打开头像面板' }))
    fireEvent.click(screen.getByRole('button', { name: '删除头像 b' }))
    expect(onDelete).toHaveBeenCalledWith('b')
  })

  it('上传新图片时回调文件', () => {
    const onUpload = vi.fn()
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={onUpload} onSelect={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '打开头像面板' }))
    const file = new File(['x'], 'new.png', { type: 'image/png' })
    const input = screen.getByLabelText('上传新头像') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith(file)
  })

  it('当前使用的头像不显示删除按钮', () => {
    render(<AvatarPicker currentSrc="https://x/avatar-a.png" avatars={items} onUpload={() => {}} onSelect={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '打开头像面板' }))
    expect(screen.queryByRole('button', { name: '删除头像 a' })).not.toBeInTheDocument()
  })
})
