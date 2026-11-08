import { deflateSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { defaultDims } from '../geodesic'
import { decodeShare, encodeShare, readSharedHash, SHARE_VERSION, shareUrl, toShareDoc, type ShareDoc } from './share'
import { cleanSettings, cleanView, DEFAULT_SETTINGS, DEFAULT_VIEW, type Settings } from './state'

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  pattern: 'geodesic',
  frequency: 2,
  radius: 3,
  cut: 0.6,
  mode: 'section',
  triangulate: true,
  technique: 'lapped',
  dimsBy: { lapped: { thickness: 2, both: 1 }, timber: { width: 45 } },
}
const view = { ...DEFAULT_VIEW, explode: 0.4, labels: true }
const raw = (doc: object) => {
  const bytes = deflateSync(strToU8(JSON.stringify(doc)))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('share links', () => {
  it('round-trips the dome, the construction with every dimension, and the view', () => {
    const doc = toShareDoc(settings, view, defaultDims)
    expect(doc.v).toBe(SHARE_VERSION)
    // Every dimension written out, defaults included, so the link stands alone.
    expect(Object.keys(doc.build.dims).sort()).toEqual(Object.keys(defaultDims('lapped')).sort())
    const back = decodeShare(encodeShare(doc))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.settings.frequency).toBe(2)
    expect(back.settings.mode).toBe('section')
    expect(back.settings.triangulate).toBe(true)
    expect(back.settings.technique).toBe('lapped')
    expect(back.settings.dimsBy.lapped).toEqual({ ...defaultDims('lapped'), thickness: 2, both: 1 })
    // Only the shared technique travels.
    expect(back.settings.dimsBy.timber).toBeUndefined()
    expect(back.view).toEqual(view)
  })

  it('makes a short, URL-safe link', () => {
    const url = shareUrl(toShareDoc(settings, view, defaultDims), { origin: 'https://x.y', pathname: '/geodesic/' })
    expect(url).toMatch(/^https:\/\/x\.y\/geodesic\/#share=[A-Za-z0-9_-]+$/)
    expect(url.length).toBeLessThan(400)
    expect(readSharedHash(new URL(url).hash)?.ok).toBe(true)
  })

  it('refuses a link from a newer version, saying why', () => {
    const doc = { ...toShareDoc(settings, view, defaultDims), v: SHARE_VERSION + 1 }
    const r = decodeShare(raw(doc))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/newer version/)
  })

  it('refuses damaged links and foreign documents', () => {
    expect(decodeShare('not-a-link').ok).toBe(false)
    expect(decodeShare(raw({ hello: 1 })).ok).toBe(false)
    expect(decodeShare(raw({ app: 'geodesic' })).ok).toBe(false)
  })

  it('clamps out-of-range values and drops unknown ones', () => {
    const doc = toShareDoc(settings, view, defaultDims) as ShareDoc & Record<string, unknown>
    const bad = { ...doc, dome: { ...doc.dome, frequency: 99, cut: -3, mode: 'sideways' }, build: { technique: 'lapped', dims: { thickness: 999, nonsense: 5 } }, view: { explode: 7 } }
    const r = decodeShare(raw(bad))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.settings.frequency).toBe(12)
    expect(r.settings.cut).toBe(0.001)
    expect(r.settings.mode).toBe(DEFAULT_SETTINGS.mode)
    expect(r.settings.dimsBy.lapped).toEqual({ thickness: 12 })
    expect(r.view?.explode).toBe(1)
  })

  it('still opens the old #p=…&v=… links, as version 0', () => {
    const r = readSharedHash('#p=geo&v=2&s=icosa&r=3&u=m&h=0.6&m=sec&tri=1&t=timber&d=width:45')
    expect(r?.ok).toBe(true)
    if (!r?.ok) return
    expect(r.version).toBe(0)
    expect(r.settings).toMatchObject({ frequency: 2, radius: 3, cut: 0.6, mode: 'section', triangulate: true, technique: 'timber' })
    expect(r.settings.dimsBy.timber).toEqual({ width: 45 })
  })

  it('ignores a URL with nothing shared', () => {
    expect(readSharedHash('')).toBeNull()
    expect(readSharedHash('#foo=1')).toBeNull()
  })
})

describe('stored state', () => {
  it('repairs whatever storage holds', () => {
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(cleanSettings({ frequency: '3', unit: 'parsec', dimsBy: { timber: { width: 45 }, bogus: { x: 1 } } })).toEqual({ ...DEFAULT_SETTINGS, dimsBy: { timber: { width: 45 } } })
    expect(cleanView({ colorBy: 'neon', labels: true })).toEqual({ ...DEFAULT_VIEW, labels: true })
  })
})
