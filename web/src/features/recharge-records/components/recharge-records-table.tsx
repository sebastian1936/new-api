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
import { getRouteApi } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getRechargeRecords } from '../api'
import { DEFAULT_RECHARGE_DATA, RECHARGE_SOURCE_FILTERS } from '../constants'
import type { RechargeFilters, RechargeRecord, RechargeSource } from '../types'
import { RechargeFilterBar } from './recharge-filter-bar'
import { useRechargeRecordsColumns } from './recharge-records-columns'

const route = getRouteApi('/_authenticated/recharge-records/')

function isRechargeSource(value: unknown): value is RechargeSource {
  return (
    typeof value === 'string' &&
    RECHARGE_SOURCE_FILTERS.some((option) => option.value === value)
  )
}

// URL is the single source of truth for committed filters; the draft holds
// in-progress edits until the user clicks search.
function buildSourceKey(search: {
  source?: unknown
  username?: unknown
  startTime?: unknown
  endTime?: unknown
}) {
  return [
    String(search.source ?? ''),
    String(search.username ?? ''),
    String(search.startTime ?? ''),
    String(search.endTime ?? ''),
  ].join('\u001f')
}

export function RechargeRecordsTable() {
  const { t } = useTranslation()
  const columns = useRechargeRecordsColumns()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const navigate = route.useNavigate()
  const searchParams = route.useSearch()

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search: searchParams,
      navigate: route.useNavigate(),
      pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
      globalFilter: { enabled: false },
    })

  const committedFilters = useMemo<RechargeFilters>(
    () => ({
      source: isRechargeSource(searchParams.source) ? searchParams.source : '',
      username: searchParams.username || undefined,
      startTime: searchParams.startTime
        ? new Date(searchParams.startTime)
        : undefined,
      endTime: searchParams.endTime
        ? new Date(searchParams.endTime)
        : undefined,
    }),
    [
      searchParams.source,
      searchParams.username,
      searchParams.startTime,
      searchParams.endTime,
    ]
  )

  const sourceKey = buildSourceKey(searchParams)
  const [draft, setDraft] = useState<{
    sourceKey: string
    filters: RechargeFilters
  }>(() => ({ sourceKey, filters: committedFilters }))
  const activeFilters =
    draft.sourceKey === sourceKey ? draft.filters : committedFilters

  const handleChange = useCallback(
    (next: RechargeFilters) => {
      setDraft({ sourceKey, filters: next })
    },
    [sourceKey]
  )

  const handleSearch = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        source: activeFilters.source || undefined,
        username: activeFilters.username || undefined,
        startTime: activeFilters.startTime
          ? activeFilters.startTime.getTime()
          : undefined,
        endTime: activeFilters.endTime
          ? activeFilters.endTime.getTime()
          : undefined,
      }),
    })
  }, [activeFilters, navigate])

  const handleReset = useCallback(() => {
    setDraft({
      sourceKey: '',
      filters: { source: '' },
    })
    navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        source: undefined,
        username: undefined,
        startTime: undefined,
        endTime: undefined,
      }),
    })
  }, [navigate])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'recharge-records',
      pagination.pageIndex + 1,
      pagination.pageSize,
      committedFilters.source,
      committedFilters.username,
      searchParams.startTime,
      searchParams.endTime,
    ],
    queryFn: async () => {
      const result = await getRechargeRecords({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        source: committedFilters.source || undefined,
        username: committedFilters.username,
        start_timestamp: committedFilters.startTime
          ? Math.floor(committedFilters.startTime.getTime() / 1000)
          : undefined,
        end_timestamp: committedFilters.endTime
          ? Math.floor(committedFilters.endTime.getTime() / 1000)
          : undefined,
      })

      if (!result.success) {
        toast.error(result.message || t('Failed to load recharge records'))
        return DEFAULT_RECHARGE_DATA
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const records = data?.items || []

  const { table } = useDataTable({
    data: records as RechargeRecord[],
    columns,
    enableRowSelection: false,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns as ColumnDef<RechargeRecord>[]}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Recharge Records Found')}
      emptyDescription={t(
        'No recharge records available. Records appear here after a top-up or an admin quota adjustment.'
      )}
      skeletonKeyPrefix='recharge-records-skeleton'
      applyHeaderSize
      toolbar={
        <RechargeFilterBar
          table={table}
          filters={activeFilters}
          onChange={handleChange}
          onSearch={handleSearch}
          onReset={handleReset}
          searchLoading={isFetching}
        />
      }
    />
  )
}
