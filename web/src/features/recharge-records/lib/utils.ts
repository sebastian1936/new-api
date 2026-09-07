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
import { parseLogOther } from '@/features/usage-logs/lib/format'
import type { LogOtherData } from '@/features/usage-logs/types'

import { REDEMPTION_CONTENT_KEYWORD } from './constants'
import type { RechargeRecord, RechargeSource } from './types'

/**
 * Resolve the coarse-grained recharge source (bucket) of a single record.
 * Mirrors the backend classification so display and filtering stay consistent:
 * - type=3 (manage)        -> 'manage'
 * - type=1 + content 兑换码 -> 'redemption'
 * - type=1 (otherwise)     -> 'online'
 */
export function resolveRechargeSource(
  record: RechargeRecord
): Exclude<RechargeSource, ''> {
  if (record.type === 3) return 'manage'
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
