import { useEffect, useLayoutEffect, useState } from 'react'

/** Light, dark, or whatever the system says. */
export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'geodesic.theme'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

/** The theme preference and the scheme it resolves to; keeps `<html class="dark">` in step. */
export function useTheme(): [ThemePref, (p: ThemePref) => void, 'light' | 'dark'] {
  const [pref, setPref] = useState<ThemePref>(readPref)
  const [systemDark, setSystemDark] = useState(() => media().matches)
  useEffect(() => {
    const m = media()
    const on = () => setSystemDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  const scheme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark')
    document.documentElement.style.colorScheme = scheme
  }, [scheme])
  const set = (p: ThemePref) => {
    setPref(p)
    try {
      if (p === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, p)
    } catch {
      /* private mode */
    }
  }
  return [pref, set, scheme]
}

/** The colours the 3D scene needs, resolved from the CSS tokens. */
export interface SceneColors {
  background: string
  foreground: string
  muted: string
  border: string
  scheme: 'light' | 'dark'
}

export function sceneColors(scheme: 'light' | 'dark'): SceneColors {
  const probe = document.createElement('span')
  document.body.appendChild(probe)
  const resolve = (name: string) => {
    probe.style.color = `var(${name})`
    return toHex(getComputedStyle(probe).color)
  }
  const c = {
    background: resolve('--viewport'),
    foreground: resolve('--foreground'),
    muted: resolve('--muted-foreground'),
    border: resolve('--border'),
    scheme,
  }
  probe.remove()
  return c
}

let ctx: CanvasRenderingContext2D | null = null
function toHex(color: string): string {
  ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return '#808080'
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
