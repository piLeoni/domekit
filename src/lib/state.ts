import { TECHNIQUES, type BaseSolid, type CutMode, type Pattern, type Technique } from '../geodesic'
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
  /** Section only: merge each trimmed panel's cut points so it stays a triangle. */
  triangulate: boolean
  /** How it is built: the primitive alone, or a construction technique. */
  technique: Technique
  /**
   * Each technique's material dimensions, millimetres, kept separately so
   * switching technique and back keeps what was set. Missing keys take the
   * defaults.
   */
  dimsBy: Partial<Record<Technique, Record<string, number>>>
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
  triangulate: false,
  technique: 'primitive',
  dimsBy: {},
}

/** What is lit in the viewport and the tables: one family, or none. */
export type Focus = { kind: 'strut' | 'face' | 'hub'; index: number } | null

export type Tab = 'struts' | 'panels' | 'hubs' | 'schema' | 'parts' | 'sheets'
export const TABS: Tab[] = ['struts', 'panels', 'hubs', 'schema', 'parts', 'sheets']

export interface ViewOptions {
  /** Which families carry colour in the model. */
  colorBy: 'struts' | 'panels'
  /** Type labels on the model, for the family carrying colour. */
  labels: boolean
  /** How far a construction's parts are pulled apart, 0 to 1. */
  explode: number
  /** A construction in its type colours (`type`) or plain off-white (`material`). */
  look: 'material' | 'type'
  /** A construction's decking shown over its frame. */
  decking: boolean
}

export const DEFAULT_VIEW: ViewOptions = {
  colorBy: 'struts',
  labels: false,
  explode: 0,
  look: 'type',
  decking: false,
}

/* ---------------------------------------------------------------- */
/*  Cleaning: whatever comes from storage or a link, made valid      */
/* ---------------------------------------------------------------- */

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const oneOf = <T>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

const PATTERNS: Pattern[] = ['geodesic', 'goldberg']
const SOLIDS: BaseSolid[] = ['icosahedron', 'octahedron']
const MODES: CutMode[] = ['exclude', 'include', 'section']
const TECHNIQUE_IDS = TECHNIQUES.map((t) => t.id)

/** A technique's dimensions: only its own keys, each within its limits. */
export function cleanDims(technique: Technique, raw: unknown): Record<string, number> {
  const spec = TECHNIQUES.find((t) => t.id === technique)
  if (!spec || !isObject(raw)) return {}
  const out: Record<string, number> = {}
  for (const d of spec.dims) if (typeof raw[d.key] === 'number' && Number.isFinite(raw[d.key])) out[d.key] = num(raw[d.key], d.mm, d.min, d.max)
  return out
}

export function cleanSettings(raw: unknown): Settings {
  const r = isObject(raw) ? raw : {}
  const D = DEFAULT_SETTINGS
  const dimsBy: Settings['dimsBy'] = {}
  if (isObject(r.dimsBy)) for (const t of TECHNIQUE_IDS) if (r.dimsBy[t] !== undefined) dimsBy[t] = cleanDims(t, r.dimsBy[t])
  return {
    pattern: oneOf(r.pattern, PATTERNS, D.pattern),
    frequency: Math.round(num(r.frequency, D.frequency, 1, MAX_FREQUENCY)),
    solid: oneOf(r.solid, SOLIDS, D.solid),
    radius: num(r.radius, D.radius, 0.001, 1e6),
    unit: oneOf(r.unit, UNITS, D.unit),
    cut: num(r.cut, D.cut, 0.001, 1),
    mode: oneOf(r.mode, MODES, D.mode),
    triangulate: bool(r.triangulate, D.triangulate),
    technique: oneOf(r.technique, TECHNIQUE_IDS, D.technique),
    dimsBy,
  }
}

export function cleanView(raw: unknown): ViewOptions {
  const r = isObject(raw) ? raw : {}
  const D = DEFAULT_VIEW
  return {
    colorBy: oneOf(r.colorBy, ['struts', 'panels'] as const, D.colorBy),
    labels: bool(r.labels, D.labels),
    explode: num(r.explode, D.explode, 0, 1),
    look: oneOf(r.look, ['material', 'type'] as const, D.look),
    decking: bool(r.decking, D.decking),
  }
}

export const cleanTab = (raw: unknown): Tab => oneOf(raw, TABS, 'struts')

/** The current technique's dimensions. */
export const dimsOf = (s: Settings) => s.dimsBy[s.technique] ?? {}
