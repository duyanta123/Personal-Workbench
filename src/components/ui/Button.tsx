import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-border text-ink hover:bg-hover',
  ghost: 'text-ink hover:bg-hover',
  danger: 'bg-danger text-white hover:brightness-95'
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1.5 px-3 text-xs',
  md: 'h-8 gap-2 px-4 text-sm',
  lg: 'h-9 gap-2 px-5 text-sm'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors duration-150 active:opacity-90 disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  )
}
