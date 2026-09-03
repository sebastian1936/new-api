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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

interface AlipayConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  refreshing: boolean
}

/**
 * Shown on the original wallet page after the Alipay cashier is opened in a
 * new tab. Since the balance is credited by the async notify webhook, the
 * original page cannot know for sure when payment finished; this dialog lets
 * the user confirm completion and triggers a balance refresh.
 */
export function AlipayConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  refreshing,
}: AlipayConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Have you completed the payment?')}
      description={t(
        'Alipay has been opened in a new tab. After you finish paying, click the button below to refresh your balance.'
      )}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-[425px]'
      footerClassName='grid grid-cols-2 gap-2 sm:flex'
      contentHeight='auto'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={refreshing}
          >
            {t('Not yet')}
          </Button>
          <Button onClick={onConfirm} disabled={refreshing}>
            {refreshing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Payment completed')}
          </Button>
        </>
      }
    />
  )
}
