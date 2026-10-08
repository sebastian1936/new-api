/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RedemptionsCreatedDialog } from '../redemptions-created-dialog'

const CREATED_KEYS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

function renderDialog(
  props: Partial<{
    open: boolean
    keys: string[]
  }> = {}
) {
  const onOpenChange = vi.fn()
  render(
    <RedemptionsCreatedDialog
      open={props.open ?? true}
      keys={props.keys ?? CREATED_KEYS}
      onOpenChange={onOpenChange}
    />
  )
  return { onOpenChange }
}

/** The dialog chrome also renders an sr-only "Close", so scope to the footer. */
function footerButton(name: string) {
  const footer = document.querySelector('[data-slot=dialog-footer]')
  return within(footer as HTMLElement).getByRole('button', { name })
}

afterEach(() => {
  // Restore the jsdom navigator.clipboard descriptor (undefined by default).
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
  vi.clearAllMocks()
})

describe('RedemptionsCreatedDialog', () => {
  test('lists every created redemption code when open', () => {
    renderDialog()

    for (const key of CREATED_KEYS) {
      expect(screen.getByText(key)).toBeInTheDocument()
    }
  })

  test('renders no dialog content while closed', () => {
    renderDialog({ open: false })

    expect(screen.queryByText(CREATED_KEYS[0])).not.toBeInTheDocument()
  })

  test('copies all codes joined by newlines via the copy-all button', async () => {
    const writeText = stubClipboard()
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Copy All Codes' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(CREATED_KEYS.join('\n'))
    )
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  test('notifies the parent when the footer close button is clicked', () => {
    const { onOpenChange } = renderDialog()

    fireEvent.click(footerButton('Close'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
