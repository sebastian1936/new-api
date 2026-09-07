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
import { useCallback, useEffect, useState } from 'react'

import { getCaptcha } from '@/features/auth/api'
import { useStatus } from '@/hooks/use-status'

/**
 * Hook for managing the graphical (digit) captcha used on registration.
 *
 * Each captcha is single-use on the server: it is invalidated as soon as it is
 * verified, whether the answer was right or wrong. The form therefore requests
 * a fresh image after every failed submit so the user is never left holding an
 * already-consumed captcha.
 */
export function useCaptcha() {
  const { status } = useStatus()
  const isCaptchaEnabled = !!status?.captcha_enabled

  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [isLoadingCaptcha, setIsLoadingCaptcha] = useState(false)

  const refreshCaptcha = useCallback(async () => {
    if (!isCaptchaEnabled) return
    setIsLoadingCaptcha(true)
    try {
      const res = await getCaptcha()
      if (res?.success && res.data) {
        setCaptchaId(res.data.captcha_id)
        setCaptchaImage(res.data.captcha_img)
        setCaptchaCode('')
      }
    } catch {
      // Keep the previous image on failure; the user can retry via refresh.
    } finally {
      setIsLoadingCaptcha(false)
    }
  }, [isCaptchaEnabled])

  useEffect(() => {
    void refreshCaptcha()
  }, [refreshCaptcha])

  return {
    isCaptchaEnabled,
    captchaId,
    captchaImage,
    captchaCode,
    setCaptchaCode,
    isLoadingCaptcha,
    refreshCaptcha,
  }
}
