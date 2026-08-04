import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import IconButton from './IconButton'

export default function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  return (
    <IconButton
      onClick={toggle}
      aria-label={resolved === 'dark' ? '切换到浅色主题' : '切换到暗色主题'}
      title={resolved === 'dark' ? '切换到浅色主题' : '切换到暗色主题'}
    >
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  )
}
