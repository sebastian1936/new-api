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
import type { Table } from '@tanstack/react-table'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '@/features/usage-logs/components/logs-filter-toolbar'

import { RECHARGE_SOURCE_FILTERS } from '../constants'
import type { RechargeFilters, RechargeSource } from '../types'

interface RechargeFilterBarProps<TData> {
  table: Table<TData>
  filters: RechargeFilters
  onChange: (next: RechargeFilters) => void
  onSearch: () => void
  onReset: () => void
  searchLoading?: boolean
}

function isRechargeSource(value: string): value is RechargeSource {
  return RECHARGE_SOURCE_FILTERS.some((option) => option.value === value)
}

export function RechargeFilterBar<TData>({
  table,
  filters,
  onChange,
  onSearch,
  onReset,
  searchLoading,
}: RechargeFilterBarProps<TData>) {
  const { t } = useTranslation()

  const handleField = useCallback(
    <K extends keyof RechargeFilters>(field: K, value: RechargeFilters[K]) => {
      onChange({ ...filters, [field]: value })
    },
    [filters, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onSearch()
    },
    [onSearch]
  )

  const sourceLabel =
    RECHARGE_SOURCE_FILTERS.find((option) => option.value === filters.source)
      ?.label ?? 'All Sources'

  const hasActiveFilters =
    filters.source !== '' ||
    Boolean(filters.username) ||
    Boolean(filters.startTime) ||
    Boolean(filters.endTime)

  const dateRangeFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={filters.startTime}
        end={filters.endTime}
        onChange={({ start, end }) => {
          onChange({ ...filters, startTime: start, endTime: end })
        }}
      />
    </LogsFilterField>
  )

  const sourceFilter = (
    <LogsFilterField>
      <Select
        value={filters.source}
        onValueChange={(value) => {
          const next =
            value !== null && isRechargeSource(value)
              ? (value as RechargeSource)
              : ''
          handleField('source', next)
        }}
      >
        <SelectTrigger>
          <SelectValue>{t(sourceLabel)}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {RECHARGE_SOURCE_FILTERS.map((option) => (
              <SelectItem key={option.value || 'all'} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </LogsFilterField>
  )

  const usernameFilter = (
    <LogsFilterField>
      <LogsFilterInput
        placeholder={t('Username')}
        value={filters.username || ''}
        onChange={(e) => handleField('username', e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  )

  const primaryFilters = (
    <>
      {dateRangeFilter}
      {sourceFilter}
      {usernameFilter}
    </>
  )

  return (
    <LogsFilterToolbar
      table={table}
      primaryFilters={primaryFilters}
      mobilePinnedFilters={dateRangeFilter}
      mobileFilters={
        <>
          {sourceFilter}
          {usernameFilter}
        </>
      }
      mobileFilterCount={
        [
          filters.source !== '' ? filters.source : undefined,
          filters.username,
        ].filter(Boolean).length
      }
      hasActiveFilters={hasActiveFilters}
      onSearch={onSearch}
      searchLoading={searchLoading}
      onReset={onReset}
    />
  )
}
