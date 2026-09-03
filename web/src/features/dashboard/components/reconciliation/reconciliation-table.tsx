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
import { useQuery } from '@tanstack/react-query'
import { Activity, CircleAlert, Hash, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getFlowQuotaDates } from '@/features/dashboard/api'
import { buildQueryParams, getDefaultDays } from '@/features/dashboard/lib'
import type {
  DashboardFilters,
  FlowQuotaDataItem,
} from '@/features/dashboard/types'
import { formatNumber, formatQuota, formatTokens } from '@/lib/format'
import { computeTimeRange } from '@/lib/time'

interface ReconciliationTableProps {
  filters?: DashboardFilters
}

// The dimension by which flow rows are grouped into a reconciliation report.
type ReconciliationDimension = 'channel' | 'model' | 'user' | 'group'

const DIMENSION_OPTIONS: {
  value: ReconciliationDimension
  labelKey: string
}[] = [
  { value: 'channel', labelKey: 'By channel' },
  { value: 'model', labelKey: 'By model' },
  { value: 'user', labelKey: 'By user' },
  { value: 'group', labelKey: 'By group' },
]

const DIMENSION_HEADER_KEYS: Record<ReconciliationDimension, string> = {
  channel: 'Channel',
  model: 'Model',
  user: 'User',
  group: 'Group',
}

interface ReconciliationRow {
  key: string
  label: string
  quota: number
  tokens: number
  count: number
}

// Builds a stable grouping key + display label for a flow row under the chosen
// dimension. Missing identifiers collapse into a single "unknown" bucket so the
// totals still reconcile against the raw data.
function resolveDimension(
  row: FlowQuotaDataItem,
  dimension: ReconciliationDimension,
  unknownLabel: string
): { key: string; label: string } {
  switch (dimension) {
    case 'channel': {
      const id = row.channel_id
      if (id == null || id === 0) return { key: 'unknown', label: unknownLabel }
      const name = row.channel_name?.trim()
      return {
        key: `channel:${id}`,
        label: name ? `${name} (#${id})` : `#${id}`,
      }
    }
    case 'model': {
      const name = row.model_name?.trim()
      if (!name) return { key: 'unknown', label: unknownLabel }
      return { key: `model:${name}`, label: name }
    }
    case 'user': {
      const id = row.user_id
      const name = row.username?.trim()
      if ((id == null || id === 0) && !name) {
        return { key: 'unknown', label: unknownLabel }
      }
      return {
        key: `user:${id ?? name}`,
        label: name ? (id ? `${name} (#${id})` : name) : `#${id}`,
      }
    }
    case 'group': {
      const name = row.use_group?.trim()
      if (!name) return { key: 'unknown', label: unknownLabel }
      return { key: `group:${name}`, label: name }
    }
  }
}

function aggregateRows(
  rows: FlowQuotaDataItem[],
  dimension: ReconciliationDimension,
  unknownLabel: string
): ReconciliationRow[] {
  const buckets = new Map<string, ReconciliationRow>()
  for (const row of rows) {
    const { key, label } = resolveDimension(row, dimension, unknownLabel)
    const existing = buckets.get(key)
    if (existing) {
      existing.quota += row.quota ?? 0
      existing.tokens += row.token_used ?? 0
      existing.count += row.count ?? 0
    } else {
      buckets.set(key, {
        key,
        label,
        quota: row.quota ?? 0,
        tokens: row.token_used ?? 0,
        count: row.count ?? 0,
      })
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.quota - a.quota)
}

export function ReconciliationTable(props: ReconciliationTableProps) {
  const { t } = useTranslation()
  const [dimension, setDimension] = useState<ReconciliationDimension>('channel')

  const timeRange = useMemo(
    () =>
      computeTimeRange(
        getDefaultDays(props.filters?.time_granularity),
        props.filters?.start_timestamp,
        props.filters?.end_timestamp
      ),
    [
      props.filters?.end_timestamp,
      props.filters?.start_timestamp,
      props.filters?.time_granularity,
    ]
  )
  const queryParams = useMemo(
    () => buildQueryParams(timeRange, props.filters),
    [props.filters, timeRange]
  )

  const {
    data: rows,
    error,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ['dashboard', 'reconciliation', queryParams],
    queryFn: () => getFlowQuotaDates(queryParams, true),
    select: (res) => {
      if (!res.success) {
        throw new Error(res.message || t('Please try again later.'))
      }
      return res.data ?? []
    },
    staleTime: 60_000,
  })

  const unknownLabel = t('Unknown')
  const aggregated = useMemo(
    () => aggregateRows(rows ?? [], dimension, unknownLabel),
    [rows, dimension, unknownLabel]
  )

  const totals = useMemo(
    () =>
      aggregated.reduce(
        (acc, row) => {
          acc.quota += row.quota
          acc.tokens += row.tokens
          acc.count += row.count
          return acc
        },
        { quota: 0, tokens: 0, count: 0 }
      ),
    [aggregated]
  )

  const dimensionHeader = t(DIMENSION_HEADER_KEYS[dimension])

  const summaryCards = [
    {
      key: 'quota',
      title: t('Total consumption'),
      value: formatQuota(totals.quota),
      icon: WalletCards,
      tone: 'success' as const,
    },
    {
      key: 'tokens',
      title: t('Total tokens'),
      value: formatTokens(totals.tokens),
      icon: Hash,
      tone: 'info' as const,
    },
    {
      key: 'count',
      title: t('Total requests'),
      value: formatNumber(totals.count),
      icon: Activity,
      tone: 'warning' as const,
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <Tabs
        value={dimension}
        onValueChange={(value) =>
          setDimension(value as ReconciliationDimension)
        }
      >
        <TabsList aria-label={t('Reconciliation dimension')}>
          {DIMENSION_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {t(option.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.key}
              className='flex items-center gap-3 rounded-lg border px-4 py-3'
            >
              <IconBadge tone={card.tone} size='sm'>
                <Icon />
              </IconBadge>
              <div className='min-w-0'>
                <div className='text-muted-foreground truncate text-xs font-medium tracking-wide uppercase'>
                  {card.title}
                </div>
                {isLoading ? (
                  <Skeleton className='mt-1 h-6 w-24' />
                ) : (
                  <div
                    className='text-foreground truncate font-mono text-lg font-bold tabular-nums'
                    title={card.value}
                  >
                    {card.value}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className='overflow-hidden rounded-lg border'>
        {isError ? (
          <div className='flex items-center justify-center p-4'>
            <Alert variant='destructive' className='max-w-md'>
              <CircleAlert />
              <AlertTitle>{t('Failed to load')}</AlertTitle>
              <AlertDescription>
                {error instanceof Error
                  ? error.message
                  : t('Please try again later.')}
              </AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div className='space-y-2 p-4'>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className='h-8 w-full' />
            ))}
          </div>
        ) : aggregated.length === 0 ? (
          <Empty className='border-0 py-12'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <WalletCards />
              </EmptyMedia>
              <EmptyTitle>{t('No data available')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'No consumption records were found for the selected time range.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dimensionHeader}</TableHead>
                <TableHead className='text-right'>{t('Requests')}</TableHead>
                <TableHead className='text-right'>{t('Tokens')}</TableHead>
                <TableHead className='text-right'>{t('Consumption')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregated.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className='font-medium'>{row.label}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(row.count)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatTokens(row.tokens)}
                  </TableCell>
                  <TableCell className='text-right font-mono tabular-nums'>
                    {formatQuota(row.quota)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className='font-semibold'>{t('Total')}</TableCell>
                <TableCell className='text-right font-semibold tabular-nums'>
                  {formatNumber(totals.count)}
                </TableCell>
                <TableCell className='text-right font-semibold tabular-nums'>
                  {formatTokens(totals.tokens)}
                </TableCell>
                <TableCell className='text-right font-mono font-semibold tabular-nums'>
                  {formatQuota(totals.quota)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
