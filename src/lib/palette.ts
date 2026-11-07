/**
 * Colour for a family (strut, panel or hub type): every family gets its own
 * hue, as far as possible from every other one.
 *
 * The first eight are a validated categorical order (colour-blind safe as
 * neighbours). Past eight, each next colour is the candidate furthest, in
 * OKLab, from all colours already taken, within a lightness band that reads
 * on the surface. Colours are fixed by the family's index (its letter), so a
 * cut never repaints a strut. With many families some hues inevitably come
 * close; the label always names the type.
 */

type Scheme = 'light' | 'dark'

const SEED: Record<Scheme, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#3fae3f', '#9085e9', '#e66767'],
}

/** Lightness band (OKLab L) for generated colours: dark enough on white, light enough on black. */
const BAND: Record<Scheme, number[]> = {
  light: [0.48, 0.56, 0.64, 0.72],
  dark: [0.62, 0.7, 0.78, 0.86],
}

type Lab = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLCH → `#rrggbb`, or null outside the sRGB gamut. */
function oklchToHex(L: number, C: number, hDeg: number): string | null {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  if (rgb.some((c) => c < -1e-4 || c > 1 + 1e-4)) return null
  return `#${rgb.map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, '0')).join('')}`
}

const dist = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

const cache = new Map<string, string[]>()

/** `n` colours, each as far as possible from the others. */
export function distinctColors(n: number, scheme: Scheme): string[] {
  const key = `${scheme}:${n}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = SEED[scheme].slice(0, n)
  if (n > out.length) {
    const candidates: { hex: string; lab: Lab }[] = []
    for (const L of BAND[scheme]) {
      for (const C of [0.09, 0.13, 0.17]) {
        for (let h = 0; h < 360; h += 10) {
          const hex = oklchToHex(L, C, h)
          if (hex) candidates.push({ hex, lab: hexToLab(hex) })
        }
      }
    }
    const taken = out.map(hexToLab)
    // Keep away from greys too, so a type never reads as the base ring.
    const greys: Lab[] = [hexToLab('#808080'), hexToLab(scheme === 'light' ? '#b0b0b0' : '#5a5a5a')]
    while (out.length < n) {
      let best = candidates[0]
      let bestD = -1
      for (const c of candidates) {
        const d = Math.min(...taken.map((t) => dist(t, c.lab)), ...greys.map((g) => dist(g, c.lab) * 1.5))
        if (d > bestD) {
          bestD = d
          best = c
        }
      }
      out.push(best.hex)
      taken.push(best.lab)
    }
  }
  cache.set(key, out)
  return out
}

function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** Mix a colour toward the surface, for the families not in focus. */
export function fade(color: string, surface: string, amount: number): string {
  return lerpHex(color, surface, amount)
}

/**
 * Colours for a list of types where whole pieces come first: whole types get
 * distinct colours, a cut piece wears its parent's, anything else (base ring
 * struts) the neutral ink.
 */
export function pieceColors(types: { kind: string; parent: number | null }[], scheme: Scheme, neutral: string): string[] {
  const base = distinctColors(types.filter((t) => t.kind === 'whole').length, scheme)
  return types.map((t, i) => (t.kind === 'whole' ? base[i] : t.kind === 'cut' && t.parent != null ? base[t.parent] : neutral))
}

/** A swatch for a cut piece: the parent's colour, hatched. */
export function hatched(color: string): string {
  return `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)`
}
