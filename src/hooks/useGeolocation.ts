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

const MOCK_START: GeoFix = {
  lng: 10.45,
  lat: 51.16,
  accuracy: 5,
  speed: 0,
  heading: null,
  timestamp: 0,
}

/**
 * Continuous high-accuracy position tracking via the Geolocation API.
 * GPS works without internet — only map tiles need a connection.
 */
export function useGeolocation({ enabled }: Options) {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const watchId = useRef<number | null>(null)
  const simulated = import.meta.env.DEV

  useEffect(() => {
    if (!enabled) return
    if (simulated) {
      setFix({ ...MOCK_START, timestamp: Date.now() })
      setStatus('tracking')
      return
    }
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
  }, [enabled, simulated])

  const setSimulatedPosition = (lng: number, lat: number) => {
    if (!simulated) return
    setFix((previous) => ({
      lng,
      lat,
      accuracy: 5,
      speed: previous ? 5 : 0,
      heading: null,
      timestamp: Date.now(),
    }))
  }

  return { fix, status, simulated, setSimulatedPosition }
}
