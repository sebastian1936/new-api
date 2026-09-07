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
import { Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CaptchaFieldProps {
  value: string
  onChange: (value: string) => void
  imageDataUrl: string
  isLoading?: boolean
  onRefresh: () => void
  disabled?: boolean
  className?: string
}

/**
 * Digit captcha input paired with its image. Clicking the image (or the
 * refresh affordance) requests a new one, which is required after a failed
 * submit because the server consumes a captcha on every verification attempt.
 */
export function CaptchaField({
  value,
  onChange,
  imageDataUrl,
  isLoading,
  onRefresh,
  disabled,
  className,
}: CaptchaFieldProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor='captcha-code'>{t('Captcha')}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id='captcha-code'
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          placeholder={t('Enter the digits shown')}
          autoComplete='off'
          inputMode='numeric'
          maxLength={8}
          disabled={disabled}
          className='flex-1'
        />
        <button
          type='button'
          onClick={onRefresh}
          disabled={disabled || isLoading}
          title={t('Click to refresh captcha')}
          aria-label={t('Click to refresh captcha')}
          className='bg-muted/40 relative flex h-10 w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-md border transition-opacity hover:opacity-80 disabled:opacity-60'
        >
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt={t('Captcha')}
              className='h-full w-full object-cover'
            />
          ) : (
            <RefreshCw className='text-muted-foreground h-4 w-4' />
          )}
          {isLoading && (
            <span className='bg-background/60 absolute inset-0 flex items-center justify-center'>
              <Loader2 className='h-4 w-4 animate-spin' />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
