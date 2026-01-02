import { useEffect, useMemo, useRef, useState } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
  removeEventListener: (type: 'release', listener: () => void) => void
}

export function useScreenWakeLock(enabled: boolean): {
  supported: boolean
  active: boolean
  showWorkaround: boolean
} {
  const supported = useMemo(() => {
    return typeof navigator !== 'undefined' && !!(navigator as any).wakeLock?.request
  }, [])
  const [active, setActive] = useState(false)
  const [showWorkaround, setShowWorkaround] = useState(false)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) {
      setShowWorkaround(false)
      setActive(false)
      const s = sentinelRef.current
      sentinelRef.current = null
      if (s && !s.released) {
        void s.release().catch(() => {})
      }
      return
    }

    if (!supported) {
      setShowWorkaround(true)
      return
    }

    let cancelled = false

    async function request(): Promise<void> {
      try {
        const wl = (navigator as any).wakeLock
        const sentinel = (await wl.request('screen')) as WakeLockSentinelLike
        if (cancelled) {
          await sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        setActive(true)
        setShowWorkaround(false)
        const onRelease = () => setActive(false)
        sentinel.addEventListener('release', onRelease)
      } catch {
        setActive(false)
        setShowWorkaround(true)
      }
    }

    void request()

    const onVis = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, supported])

  return { supported, active, showWorkaround }
}

