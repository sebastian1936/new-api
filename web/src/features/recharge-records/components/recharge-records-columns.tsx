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
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { renderAuditContent } from '@/features/usage-logs/lib/format'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { RECHARGE_SOURCE_BADGE } from '../constants'
import {
  getPaymentMethodLabel,
  parseRechargeOther,
  resolveRechargeSource,
} from '../lib/utils'
import type { RechargeRecord } from '../types'

export function useRechargeRecordsColumns(): ColumnDef<RechargeRecord>[] {
  const { t } = useTranslation()
  return [
    {
      accessorKey: 'id',
      header: t('ID'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <TableId value={row.getValue('id') as number} className='w-[60px]' />
      ),
      enableSorting: false,
      size: 80,
    },
    {
      id: 'source',
      header: t('Source'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const record = row.original
        const source = resolveRechargeSource(record)
        const badge = RECHARGE_SOURCE_BADGE[source]
        const other = parseRechargeOther(record.other)
        const paymentMethod =
          source === 'online' ? getPaymentMethodLabel(other, t) : undefined
        return (
          <div className='flex items-center gap-1.5'>
            <StatusBadge
              label={t(badge.label)}
              variant={badge.variant}
              copyable={false}
              className='-ml-1.5'
            />
            {paymentMethod && (
              <span className='text-muted-foreground text-xs'>
                {paymentMethod}
              </span>
            )}
          </div>
        )
      },
      size: 180,
    },
    {
      accessorKey: 'username',
      header: t('Username'),
      meta: { mobileTitle: true },
      cell: ({ row }) => {
        const username = row.getValue('username') as string
        return (
          <span className='font-medium'>
            {username || t('User {{id}}', { id: row.original.user_id })}
          </span>
        )
      },
      enableSorting: false,
      size: 160,
    },
    {
      accessorKey: 'quota',
      header: t('Amount'),
      cell: ({ row }) => {
        const quota = row.getValue('quota') as number
        // Admin adjustments may not carry a quota delta on the log row; only
        // top-up records store the credited amount in `quota`.
        if (!quota) {
          return <span className='text-muted-foreground text-sm'>-</span>
        }
        return (
          <StatusBadge
            label={formatLogQuota(quota)}
            variant='neutral'
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      enableSorting: false,
      size: 140,
    },
    {
      accessorKey: 'content',
      header: t('Details'),
      cell: ({ row }) => {
        const record = row.original
        const other = parseRechargeOther(record.other)
        // Admin adjustment logs store a language-independent op descriptor;
        // render it localized, falling back to the raw content otherwise.
        const localized = renderAuditContent(other, t)
        return (
          <span className='text-sm break-words'>
            {localized || record.content || '-'}
          </span>
        )
      },
      enableSorting: false,
      size: 360,
    },
    {
      accessorKey: 'created_at',
      header: t('Time'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='min-w-[160px] font-mono text-sm'>
          {formatTimestampToDate(row.getValue('created_at'))}
        </div>
      ),
      enableSorting: false,
      size: 180,
    },
  ]
}
