import { useEffect } from 'react'

// Minimal Wake Lock typing (not yet in all TS DOM libs).
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
}

/** Keep the screen awake while riding. Re-acquires after tab visibility changes. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen')
      } catch {
        /* denied or not allowed in this state — ignore */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}
