import { useState } from 'react'
import { MAP_STYLES } from '../map/styles'
import { usePrefs } from '../state/prefs'
import './MapStylePicker.css'

export function MapStylePicker() {
  const [open, setOpen] = useState(false)
  const mapStyle = usePrefs((state) => state.mapStyle)
  const setMapStyle = usePrefs((state) => state.setMapStyle)

  return (
    <div className="map-style-picker">
      <button
        className="map-style-picker__button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Map style"
        aria-expanded={open}
        title="Map style"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>
      {open && (
        <div className="map-style-picker__menu">
          {MAP_STYLES.map((style) => (
            <button
              key={style.id}
              className={`map-style-picker__item${style.id === mapStyle ? ' is-active' : ''}`}
              onClick={() => {
                setMapStyle(style.id)
                setOpen(false)
              }}
            >
              {style.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}