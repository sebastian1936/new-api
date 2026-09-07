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
  getQuotaAdjustAmount,
  getQuotaAdjustTargetUserId,
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
      header: t('User'),
      meta: { mobileTitle: true },
      cell: ({ row }) => {
        const record = row.original
        const username = row.getValue('username') as string
        const operator = username || t('User {{id}}', { id: record.user_id })
        // Admin adjustment logs are owned by the operator, so show the target
        // user (who actually received the quota) as the primary identity and
        // keep the operator visible as secondary context. The backend resolves
        // the target username; fall back to its ID if the user was deleted.
        const targetUserId = getQuotaAdjustTargetUserId(
          parseRechargeOther(record.other)
        )
        if (targetUserId == null) {
          return <span className='font-medium'>{operator}</span>
        }
        const target =
          record.target_username || t('User {{id}}', { id: targetUserId })
        return (
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium'>{target}</span>
            <span className='text-muted-foreground text-xs'>
              {t('by {{operator}}', { operator })}
            </span>
          </div>
        )
      },
      enableSorting: false,
      size: 180,
    },
    {
      accessorKey: 'quota',
      header: t('Amount'),
      cell: ({ row }) => {
        const record = row.original
        const quota = row.getValue('quota') as number
        // Top-up records store the credited amount in `quota`. Admin
        // adjustments are audit logs whose `quota` stays 0, so the real delta
        // is read from other.op.params (already currency-formatted upstream).
        if (quota) {
          return (
            <StatusBadge
              label={formatLogQuota(quota)}
              variant='neutral'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }
        const adjustAmount = getQuotaAdjustAmount(
          parseRechargeOther(record.other)
        )
        if (!adjustAmount) {
          return <span className='text-muted-foreground text-sm'>-</span>
        }
        return (
          <StatusBadge
            label={adjustAmount}
            variant={adjustAmount.startsWith('-') ? 'red' : 'neutral'}
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
