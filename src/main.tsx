import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { setWorkerUrl } from 'maplibre-gl'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import './styles/tokens.css'

// MapLibre GL v6 offloads tile parsing to web workers. Tell it where to find
// the worker bundle relative to the app base URL (e.g. /veloterra/ on Pages).
setWorkerUrl(`${import.meta.env.BASE_URL}assets/maplibre-gl-worker.mjs`)

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
