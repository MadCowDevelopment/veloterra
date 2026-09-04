import { useEffect, useRef, useState } from 'react'

export interface GeoFix {
  lng: number
  lat: number
  accuracy: number
  speed: number | null // m/s
  heading: number | null
  timestamp: number
}

type Status = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable' | 'error'

interface Options {
  enabled: boolean
}

/**
 * Continuous high-accuracy position tracking via the Geolocation API.
 * GPS works without internet — only map tiles need a connection.
 */
export function useGeolocation({ enabled }: Options) {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }

    setStatus('locating')
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('tracking')
        setFix({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied')
        else setStatus('error')
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
    }
  }, [enabled])

  return { fix, status }
}
