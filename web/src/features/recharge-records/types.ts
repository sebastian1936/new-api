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
/**
 * Types for the admin recharge / balance-change records feature.
 * Records are read from the shared `logs` table (type=1 top-up, type=3 manage).
 */

/**
 * Recharge source filter values. Mirrors the backend `source` query param.
 * - '' (all): redemption + online payment + admin adjustment
 * - 'redemption': redemption code top-up (type=1, content contains 兑换码)
 * - 'online': online payment top-up (type=1, other sources)
 * - 'manage': admin quota adjustment (type=3)
 */
export type RechargeSource = '' | 'redemption' | 'online' | 'manage'

/**
 * A single recharge record row (subset of the log entry fields we render).
 */
export interface RechargeRecord {
  id: number
  user_id: number
  username: string
  type: number
  content: string
  quota: number
  created_at: number
  other: string
  /**
   * Username of the user whose quota an admin adjustment changed. Filled in by
   * the backend for admin adjustment records only, because those logs are owned
   * by the operator while the target user is stored as an ID inside `other`.
   */
  target_username?: string
}

export interface GetRechargeRecordsParams {
  p?: number
  page_size?: number
  source?: RechargeSource
  username?: string
  start_timestamp?: number
  end_timestamp?: number
}

export interface GetRechargeRecordsResponse {
  success: boolean
  message?: string
  data?: {
    items: RechargeRecord[]
    total: number
    page: number
    page_size: number
  }
}

/**
 * Local filter state for the recharge records filter bar.
 */
export interface RechargeFilters {
  source: RechargeSource
  username?: string
  startTime?: Date
  endTime?: Date
}
