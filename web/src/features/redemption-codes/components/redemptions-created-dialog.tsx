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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

type RedemptionsCreatedDialogProps = {
  open: boolean
  keys: string[]
  onOpenChange: (open: boolean) => void
}

export function RedemptionsCreatedDialog({
  open,
  keys,
  onOpenChange,
}: RedemptionsCreatedDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Redemption codes created')}
      description={t('Copy and save these redemption codes below.')}
      contentClassName='sm:max-w-md'
      footer={
        <Button variant='outline' onClick={() => onOpenChange(false)}>
          {t('Close')}
        </Button>
      }
    >
      <div className='space-y-3 py-1'>
        <div className='max-h-64 overflow-y-auto rounded-lg border'>
          <ul>
            {keys.map((key) => (
              <li
                key={key}
                className='border-b px-3 py-1.5 font-mono text-sm break-all last:border-b-0'
              >
                {key}
              </li>
            ))}
          </ul>
        </div>
        <CopyButton
          value={keys.join('\n')}
          variant='outline'
          size='default'
          className='w-full'
          iconClassName='mr-2 size-4'
          tooltip={t('Copy All Codes')}
          aria-label={t('Copy All Codes')}
        >
          {t('Copy All Codes')}
        </CopyButton>
      </div>
    </Dialog>
  )
}
