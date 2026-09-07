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
import { api } from '@/lib/api'

import type {
  GetRechargeRecordsParams,
  GetRechargeRecordsResponse,
} from './types'

/**
 * Fetch paginated recharge / balance-change records (admin only). Backed by
 * GET /api/log/recharge, which aggregates top-up (type=1) and admin quota
 * adjustment (type=3) logs, filterable by source, username, and time range.
 */
export async function getRechargeRecords(
  params: GetRechargeRecordsParams = {}
): Promise<GetRechargeRecordsResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('p', String(params.p ?? 1))
  queryParams.set('page_size', String(params.page_size ?? 20))
  if (params.source) queryParams.set('source', params.source)
  if (params.username) queryParams.set('username', params.username)
  if (params.start_timestamp) {
    queryParams.set('start_timestamp', String(params.start_timestamp))
  }
  if (params.end_timestamp) {
    queryParams.set('end_timestamp', String(params.end_timestamp))
  }
  const res = await api.get(`/api/log/recharge?${queryParams.toString()}`)
  return res.data
}
