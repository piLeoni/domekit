/**
 * Share links (the document's `app` id stays `geodesic`, so old links keep
 * working): everything that makes the dome what it is, as one versioned
 * JSON document, deflated and base64url-encoded into the URL fragment:
 * `…/#share=<payload>`. The app reads it on open, applies it and cleans the
 * URL; from then on the dome lives in local storage.
 *
 * The document carries `v`. A link newer than this app, or older than the
 * oldest it still reads, is refused with a reason instead of half-applied.
 * When the format changes incompatibly, bump `SHARE_VERSION` and add a step
 * to `MIGRATIONS` that turns the old document into the new one.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { UNITS } from './units'
import { cleanDims, cleanSettings, cleanView, DEFAULT_SETTINGS, dimsOf, MAX_FREQUENCY, type Settings, type ViewOptions } from './state'
import type { Technique } from '../geodesic'

export const SHARE_VERSION = 1
/** The oldest document version this app still opens (0: the old `#p=…&v=…` links). */
export const MIN_SHARE_VERSION = 0

export interface ShareDoc {
  app: 'geodesic'
  v: number
  dome: {
    pattern: Settings['pattern']
    frequency: number
    solid: Settings['solid']
    radius: number
    unit: Settings['unit']
    cut: number
    mode: Settings['mode']
    triangulate: boolean
  }
  /** The construction and every one of its dimensions (mm), defaults included, so the link stands alone. */
  build: { technique: Technique; dims: Record<string, number> }
  view: ViewOptions
}

export type Shared = { ok: true; version: number; settings: Settings; view: ViewOptions | null } | { ok: false; reason: string }

export function toShareDoc(settings: Settings, view: ViewOptions, defaults: (t: Technique) => Record<string, number>): ShareDoc {
  const { pattern, frequency, solid, radius, unit, cut, mode, triangulate, technique } = settings
  return {
    app: 'geodesic',
    v: SHARE_VERSION,
    dome: { pattern, frequency, solid, radius, unit, cut, mode, triangulate },
    build: { technique, dims: { ...defaults(technique), ...dimsOf(settings) } },
    view,
  }
}

/* ---------------------------------------------------------------- */
/*  Encoding                                                         */
/* ---------------------------------------------------------------- */

const toBase64Url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text: string) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export const encodeShare = (doc: ShareDoc) => toBase64Url(deflateSync(strToU8(JSON.stringify(doc)), { level: 9 }))

export function shareUrl(doc: ShareDoc, at: { origin: string; pathname: string } = location) {
  return `${at.origin}${at.pathname}#share=${encodeShare(doc)}`
}

/* ---------------------------------------------------------------- */
/*  Decoding                                                         */
/* ---------------------------------------------------------------- */

/** Steps from version n to n + 1, applied in turn. None yet. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

/** A document (any supported version) to settings and view, every value checked. */
export function readShareDoc(raw: unknown): Shared {
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'geodesic') return { ok: false, reason: 'This link does not hold a DomeKit dome.' }
  let doc = raw as Record<string, unknown>
  const v = doc.v
  if (typeof v !== 'number' || !Number.isInteger(v)) return { ok: false, reason: 'This link has no version, so it cannot be read safely.' }
  if (v > SHARE_VERSION) return { ok: false, reason: `This link was made with a newer version of DomeKit (format ${v}; this one reads up to ${SHARE_VERSION}). Reload the page to get the latest version.` }
  if (v < MIN_SHARE_VERSION) return { ok: false, reason: `This link uses an old format (${v}) that DomeKit no longer opens.` }
  for (let k = v; k < SHARE_VERSION; k++) if (MIGRATIONS[k]) doc = MIGRATIONS[k](doc)
  const dome = (doc.dome ?? {}) as Record<string, unknown>
  const build = (doc.build ?? {}) as Record<string, unknown>
  const settings = cleanSettings({ ...dome, technique: build.technique, dimsBy: {} })
  if (settings.technique !== 'primitive') settings.dimsBy[settings.technique] = cleanDims(settings.technique, build.dims)
  return { ok: true, version: v, settings, view: doc.view === undefined ? null : cleanView(doc.view) }
}

export function decodeShare(payload: string): Shared {
  let raw: unknown
  try {
    raw = JSON.parse(strFromU8(inflateSync(fromBase64Url(payload))))
  } catch {
    return { ok: false, reason: 'This link is damaged or incomplete: it could not be read. Check that it was copied whole.' }
  }
  return readShareDoc(raw)
}

/** The old links, `#p=geo&v=3&s=icosa&r=3&u=m&h=0.625&m=ex&t=…&d=…`: version 0. */
function readLegacy(q: URLSearchParams): Shared {
  const n = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined)
  const technique = q.get('t') ?? 'primitive'
  const dims: Record<string, number> = {}
  for (const pair of (q.get('d') ?? '').split(',')) {
    const [k, v] = pair.split(':')
    if (k && Number.isFinite(Number(v))) dims[k] = Number(v)
  }
  const unit = q.get('u')
  const settings = cleanSettings({
    pattern: q.get('p') === 'gb' ? 'goldberg' : 'geodesic',
    frequency: Math.min(MAX_FREQUENCY, n('v') ?? DEFAULT_SETTINGS.frequency),
    solid: q.get('s') === 'octa' ? 'octahedron' : 'icosahedron',
    radius: n('r'),
    unit: UNITS.includes(unit as never) ? unit : undefined,
    cut: n('h'),
    mode: ({ ex: 'exclude', in: 'include', sec: 'section' } as Record<string, string>)[q.get('m') ?? ''],
    triangulate: q.get('tri') === '1',
    technique,
    dimsBy: { [technique]: dims },
  })
  return { ok: true, version: 0, settings, view: null }
}

/** What a URL fragment shares, if anything: a `share=` document, or an old-style link. */
export function readSharedHash(hash: string): Shared | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const payload = q.get('share')
  if (payload) return decodeShare(payload)
  if (q.has('p') && q.has('v')) return readLegacy(q)
  return null
}
