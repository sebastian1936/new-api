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
import type { StatusBadgeProps } from '@/components/status-badge'

import type { RechargeSource } from './types'

/**
 * Redemption content keyword written by the backend (model.Redeem) into a
 * top-up log's content. Used to classify a type=1 record as redemption vs
 * online payment on the client for display, mirroring the backend filter.
 */
export const REDEMPTION_CONTENT_KEYWORD = '兑换码'

/**
 * Coarse-grained recharge source options (three buckets) for the filter
 * dropdown. Value maps directly to the backend `source` query param.
 */
export const RECHARGE_SOURCE_FILTERS: ReadonlyArray<{
  value: RechargeSource
  label: string
}> = [
  { value: '', label: 'All Sources' },
  { value: 'redemption', label: 'Redemption Code' },
  { value: 'online', label: 'Online Payment' },
  { value: 'manage', label: 'Admin Adjustment' },
] as const

/**
 * Display metadata for the resolved source of a record. Keyed by the coarse
 * bucket (redemption / online / manage).
 */
export const RECHARGE_SOURCE_BADGE: Record<
  Exclude<RechargeSource, ''>,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  redemption: { label: 'Redemption Code', variant: 'cyan' },
  online: { label: 'Online Payment', variant: 'green' },
  manage: { label: 'Admin Adjustment', variant: 'orange' },
}

/**
 * Default empty data payload used before the first successful fetch.
 */
export const DEFAULT_RECHARGE_DATA = {
  items: [],
  total: 0,
}
