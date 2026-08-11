import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const base =
  'w-full rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 hover:border-ink-3/60 focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export default function Input({ className, ...props }: InputProps) {
  return <input className={cn(base, className)} {...props} />
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  noResize?: boolean
}

export function Textarea({ noResize, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(base, noResize ? 'resize-none' : 'resize-y', className)}
      {...props}
    />
  )
}
