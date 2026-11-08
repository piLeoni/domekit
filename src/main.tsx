import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { absorbSharedLink } from './lib/store'

// Dark before the first paint when the viewer asked for it, so the page does not flash.
try {
  const pref = localStorage.getItem('geodesic.theme')
  const dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch {
  /* private mode: the app sets it on mount */
}

// A shared link is applied before the first render, then cleaned from the URL.
absorbSharedLink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
