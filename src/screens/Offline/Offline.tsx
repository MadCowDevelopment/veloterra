import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { countTiles, estimateMB, type Bounds } from '../../lib/tiles'
import {
  downloadArea,
  clearOfflineMaps,
  isOfflineCapable,
  MAX_ZOOM,
  MAX_DOWNLOAD_MB,
  type DownloadProgress,
} from '../../lib/offline'
import { addRegion, listRegions, deleteRegion } from '../../lib/regions'
import type { RegionRow } from '../../data/db'
import { styleUrl } from '../../map/styles'
import './Offline.css'

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

export function Offline() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [tiles, setTiles] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [regions, setRegions] = useState<RegionRow[]>([])

  const estMB = estimateMB(tiles)
  const tooBig = estMB > MAX_DOWNLOAD_MB

  const loadRegions = () => listRegions().then(setRegions)
  useEffect(() => {
    loadRegions()
  }, [])

  // Selection = the geographic bounds under the on-screen rectangle.
  const recompute = () => {
    const map = mapRef.current
    const rect = rectRef.current
    const container = containerRef.current
    if (!map || !rect || !container) return
    const cr = container.getBoundingClientRect()
    const rr = rect.getBoundingClientRect()
    const nw = map.unproject([rr.left - cr.left, rr.top - cr.top])
    const se = map.unproject([rr.right - cr.left, rr.bottom - cr.top])
    const b: Bounds = {
      west: Math.min(nw.lng, se.lng),
      east: Math.max(nw.lng, se.lng),
      south: Math.min(nw.lat, se.lat),
      north: Math.max(nw.lat, se.lat),
    }
    setBounds(b)
    setTiles(countTiles(b, 0, MAX_ZOOM))
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl('bright'),
      center: [10.45, 51.16],
      zoom: 5,
      attributionControl: { compact: true },
      dragRotate: false,
    })
    mapRef.current = map
    map.on('load', recompute)
    map.on('move', recompute)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const start = async () => {
    if (!bounds || tooBig) return
    setMessage(null)
    setDownloading(true)
    setProgress({ done: 0, total: 0, bytes: 0 })
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await downloadArea(bounds, setProgress, ac.signal)
      await addRegion(bounds, res.urls, res.bytes, tiles)
      loadRegions()
      setMessage(`✓ Area saved for offline — ${mb(res.bytes)} MB, ${res.done} files.`)
    } catch (e) {
      setMessage((e as Error).name === 'AbortError' ? 'Download cancelled.' : 'Download failed.')
    } finally {
      setDownloading(false)
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  const removeRegion = async (id: string) => {
    await deleteRegion(id)
    loadRegions()
  }

  const clear = async () => {
    const n = await clearOfflineMaps()
    loadRegions()
    setMessage(n ? 'Offline maps cleared.' : 'Nothing to clear.')
  }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const mbSoFar = progress ? (progress.bytes / (1024 * 1024)).toFixed(1) : '0.0'

  return (
    <div className="offline">
      <div ref={containerRef} className="offline__map" />
      <div ref={rectRef} className="offline__rect" aria-hidden>
        <span className="offline__rect-label">Download area</span>
      </div>

      <header className="offline__top">
        <Link to="/" className="offline__back" aria-label="Back to menu">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      </header>

      <div className="offline__panel">
        <div className="offline__stats">
          <div>
            <div className="offline__est">
              ~{estMB < 10 ? estMB.toFixed(1) : Math.round(estMB)} MB
            </div>
            <div className="offline__sub">
              {tiles.toLocaleString()} tiles · zoom 0–{MAX_ZOOM}
            </div>
          </div>
          <div className={`offline__cap ${tooBig ? 'offline__cap--bad' : ''}`}>
            {tooBig ? `Over ${MAX_DOWNLOAD_MB} MB — zoom in` : `Limit ${MAX_DOWNLOAD_MB} MB`}
          </div>
        </div>

        {downloading ? (
          <>
            <div className="offline__bar">
              <div className="offline__bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="offline__sub">
              {pct}% · {mbSoFar} MB · {progress?.done}/{progress?.total}
            </div>
            <button className="btn btn--ghost" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button
            className="btn btn--primary"
            onClick={start}
            disabled={tooBig || !bounds}
          >
            Download this area
          </button>
        )}

        {message && <div className="offline__msg">{message}</div>}
        {!isOfflineCapable() && (
          <div className="offline__warn">
            Offline saving needs the installed app (service worker). It won’t persist on the
            dev server.
          </div>
        )}

        <div className="offline__regions-head">Offline areas ({regions.length})</div>
        {regions.length > 0 ? (
          <div className="offline__regions">
            {regions.map((r) => (
              <div key={r.id} className="offline__region">
                <div>
                  <div className="offline__region-name">{r.name}</div>
                  <div className="offline__sub">
                    {mb(r.bytes)} MB · {r.tiles.toLocaleString()} tiles
                  </div>
                </div>
                <button
                  className="offline__region-del"
                  onClick={() => removeRegion(r.id)}
                  aria-label={`Delete ${r.name}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="offline__empty">
            No offline areas yet — frame an area above and tap download.
          </div>
        )}

        <button className="offline__clear" onClick={clear}>
          Clear offline maps
        </button>
      </div>
    </div>
  )
}
