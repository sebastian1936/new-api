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
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import { parseLogOther } from '@/features/usage-logs/lib/format'
import type { LogOtherData } from '@/features/usage-logs/types'

import { REDEMPTION_CONTENT_KEYWORD } from '../constants'
import type { RechargeRecord, RechargeSource } from '../types'

/**
 * Resolve the coarse-grained recharge source (bucket) of a single record.
 * Mirrors the backend classification so display and filtering stay consistent.
 * The backend only returns MANAGE records that are real quota adjustments, so
 * the log type alone is enough to bucket them here:
 * - type=MANAGE            -> 'manage'
 * - type=TOPUP + 兑换码     -> 'redemption'
 * - type=TOPUP (otherwise) -> 'online'
 */
export function resolveRechargeSource(
  record: RechargeRecord
): Exclude<RechargeSource, ''> {
  if (record.type === LOG_TYPE_ENUM.MANAGE) return 'manage'
  if (record.content?.includes(REDEMPTION_CONTENT_KEYWORD)) return 'redemption'
  return 'online'
}

/**
 * Human-friendly labels for known payment method identifiers stored in
 * other.admin_info.payment_method. Unknown values fall back to the raw string.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  alipay: 'Alipay',
  wxpay: 'WeChat Pay',
  stripe: 'Stripe',
  creem: 'Creem',
  waffo_pancake: 'Waffo',
  epay: 'Epay',
}

/**
 * Extract a display label for the payment method of an online payment record,
 * reading other.admin_info.payment_method. Returns undefined when absent.
 */
export function getPaymentMethodLabel(
  other: LogOtherData | null,
  translate: (key: string) => string
): string | undefined {
  const method = other?.admin_info?.payment_method
  if (!method) return undefined
  const label = PAYMENT_METHOD_LABELS[method.toLowerCase()]
  return label ? translate(label) : method
}

/**
 * Parse the raw `other` JSON string on a record into structured data.
 */
export function parseRechargeOther(other: string): LogOtherData | null {
  return parseLogOther(other)
}

/**
 * Op actions that represent an admin manually changing a user's quota.
 * Mirrors `quotaAdjustOpActions` in the backend (model/log.go).
 */
const QUOTA_ADJUST_ACTIONS = [
  'user.quota_add',
  'user.quota_subtract',
  'user.quota_override',
] as const

/**
 * Resolve the displayable amount of an admin quota adjustment.
 *
 * Admin adjustments are audit logs: the log row's `quota` column stays 0 and
 * the real delta lives in `other.op.params`, already formatted by the backend
 * (logger.LogQuota) in the site's configured currency. Add/subtract carry a
 * single `quota` param and are signed for display; override carries
 * `from`/`to` and is rendered as a transition.
 *
 * Returns null when the record is not a quota adjustment or lacks params.
 */
export function getQuotaAdjustAmount(
  other: LogOtherData | null
): string | null {
  const action = other?.op?.action
  if (!action) return null
  if (!(QUOTA_ADJUST_ACTIONS as readonly string[]).includes(action)) return null

  const params = other?.op?.params
  if (!params) return null

  if (action === 'user.quota_override') {
    const from = params.from
    const to = params.to
    if (from == null || to == null) return null
    return `${String(from)} → ${String(to)}`
  }

  const quota = params.quota
  if (quota == null) return null
  const sign = action === 'user.quota_subtract' ? '-' : '+'
  return `${sign}${String(quota)}`
}

/**
 * Resolve the user whose quota an admin adjustment actually changed.
 *
 * Admin audit logs are owned by the *operator* (the admin), so the record's
 * `username` / `user_id` identify who performed the action, not who received
 * the quota. The target is stored as `other.op.params.target_user_id` by
 * `recordManageAuditFor`, which omits it when operator and target are the same
 * user (an admin adjusting their own quota).
 *
 * Returns null when the record has no distinct target.
 */
export function getQuotaAdjustTargetUserId(
  other: LogOtherData | null
): number | null {
  const raw = other?.op?.params?.target_user_id
  if (raw == null) return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}
