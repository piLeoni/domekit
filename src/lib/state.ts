import { useEffect, useState } from 'react'
import type { BaseSolid, CutMode, Pattern } from '../geodesic'
import { UNITS, type Unit } from './units'

export interface Settings {
  pattern: Pattern
  frequency: number
  solid: BaseSolid
  radius: number
  unit: Unit
  /** Height coefficient of the cut plane: dome height over sphere diameter. */
  cut: number
  mode: CutMode
}

export const MAX_FREQUENCY = 12

export const DEFAULT_SETTINGS: Settings = {
  pattern: 'geodesic',
  frequency: 3,
  solid: 'icosahedron',
  radius: 3,
  unit: 'm',
  cut: 0.625,
  mode: 'exclude',
}

const MODES: Record<string, CutMode> = { ex: 'exclude', in: 'include', sec: 'section' }
const MODE_KEYS = Object.fromEntries(Object.entries(MODES).map(([k, v]) => [v, k])) as Record<CutMode, string>

/** What is lit in the viewport and the tables: one family, or none. */
export type Focus = { kind: 'strut' | 'face' | 'hub'; index: number } | null

export interface ViewOptions {
  /** Which families carry colour in the model. */
  colorBy: 'struts' | 'panels'
  /** Type labels on the model, for the family carrying colour. */
  labels: boolean
}

export const DEFAULT_VIEW: ViewOptions = {
  colorBy: 'struts',
  labels: false,
}

/** The dome lives in the URL fragment, so a link opens the same dome. */
export function readHash(): Settings {
  const q = new URLSearchParams(location.hash.slice(1))
  const num = (k: string, d: number) => {
    const v = Number(q.get(k))
    return q.has(k) && Number.isFinite(v) ? v : d
  }
  const unit = q.get('u') as Unit
  return {
    pattern: q.get('p') === 'gb' ? 'goldberg' : 'geodesic',
    frequency: Math.round(Math.min(MAX_FREQUENCY, Math.max(1, num('v', DEFAULT_SETTINGS.frequency)))),
    solid: q.get('s') === 'octa' ? 'octahedron' : 'icosahedron',
    radius: Math.max(0.001, num('r', DEFAULT_SETTINGS.radius)),
    unit: UNITS.includes(unit) ? unit : DEFAULT_SETTINGS.unit,
    cut: Math.min(1, Math.max(0.001, num('h', DEFAULT_SETTINGS.cut))),
    mode: MODES[q.get('m') ?? ''] ?? DEFAULT_SETTINGS.mode,
  }
}

export function writeHash(s: Settings) {
  const q = new URLSearchParams({
    p: s.pattern === 'goldberg' ? 'gb' : 'geo',
    v: String(s.frequency),
    s: s.solid === 'octahedron' ? 'octa' : 'icosa',
    r: String(s.radius),
    u: s.unit,
    h: String(Number(s.cut.toFixed(8))),
    m: MODE_KEYS[s.mode],
  })
  history.replaceState(null, '', `#${q}`)
}

/** A value kept in localStorage, for per-viewer conveniences only. */
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : { ...initial, ...JSON.parse(raw) }
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode: keep it for this visit */
    }
  }, [key, value])
  return [value, setValue]
}
