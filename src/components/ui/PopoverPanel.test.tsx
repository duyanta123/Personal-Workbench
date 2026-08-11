import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, test } from 'vitest'
import PopoverPanel from './PopoverPanel'

function Harness() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <div ref={rootRef}>
        <button ref={triggerRef} onClick={() => setOpen(true)}>open</button>
        <PopoverPanel
          open={open}
          onClose={() => setOpen(false)}
          title="choices"
          rootRef={rootRef}
          triggerRef={triggerRef}
        >
          <button>first</button>
          <button>last</button>
        </PopoverPanel>
      </div>
      <button>outside</button>
    </div>
  )
}

describe('PopoverPanel', () => {
  test('moves focus inside, traps Tab, closes on Escape and restores focus', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'open' })
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())

    const last = screen.getByRole('button', { name: 'last' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'choices' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('closes when the pointer moves outside the owning control', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('dialog', { name: 'choices' })).not.toBeInTheDocument()
  })
})
