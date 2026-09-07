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
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { requestAlipayPayment, isApiSuccess } from '../api'

/**
 * Hook for handling Alipay direct payment.
 * The amount is the number of balance units (integers only); the backend
 * converts it to the CNY charge with the configured unit price.
 * The backend decides PC (page.pay) vs H5 (wap.pay) by User-Agent,
 * forcing PC when the charge reaches the configured threshold.
 */
export function useAlipayPayment() {
  const [processing, setProcessing] = useState(false)

  const processAlipayPayment = useCallback(async (amount: number) => {
    const units = Math.floor(amount)
    if (!units || units <= 0) {
      toast.error(i18next.t('Please enter a valid amount'))
      return false
    }

    setProcessing(true)
    try {
      const response = await requestAlipayPayment({
        amount: units,
        payment_method: 'alipay',
      })

      const payUrl = response.data?.pay_url || response.url
      if (isApiSuccess(response) && payUrl) {
        toast.success(i18next.t('Redirecting to Alipay...'))
        // Open the Alipay cashier in a new tab so the original wallet page
        // stays open and can prompt the user to confirm payment afterwards.
        window.open(payUrl, '_blank', 'noopener,noreferrer')
        return true
      }

      toast.error(response.message || i18next.t('Payment request failed'))
      return false
    } catch (_error) {
      toast.error(i18next.t('Payment request failed'))
      return false
    } finally {
      setProcessing(false)
    }
  }, [])

  return { processing, processAlipayPayment }
}
