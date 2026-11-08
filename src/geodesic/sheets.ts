/**
 * Fabrication drawings, one per part type. Pure functions: no DOM, so the
 * same drawings can come from a CLI.
 *
 * Each part is drawn once, as a list of shapes, and written out three ways:
 * - `svg`: the part at 1:1 (1 unit = 1 mm, or 1 inch for imperial domes),
 *   with its label, data and a scale bar; cutter layers (outline red, marks
 *   blue, text black).
 * - `dxf`: the same at 1:1, as DXF R12, layers OUTLINE, MARKS, TEXT.
 * - `page`: a printable page, all the same size (A4, or US Letter for
 *   imperial domes): header, the part scaled to fit, its data table, and a
 *   footer with a true scale bar.
 */
import type { Build } from './build'
import type { Dome, FaceType, HubType, StrutType } from './types'
import { cross, dot, normalize, sub } from './vec'

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in'

export interface Sheet {
  /** File-safe name: `panel-P2`, `strut-B`. */
  id: string
  kind: 'overview' | 'panel' | 'strut' | 'hub'
  /** The part label (`P2`, `B′`, `H4`), or `Overview`. */
  label: string
  /** The family index in `dome.faceTypes` / `strutTypes` / `hubTypes`. */
  index: number
  qty: number
  /** The 1:1 sheet's size, in `units`. */
  width: number
  height: number
  units: 'mm' | 'in'
  /** The part at 1:1. */
  svg: string
  dxf: string
  /** The printable page, `pageSize` millimetres. */
  page: string
}

export const TO_MM: Record<LengthUnit, number> = { m: 1000, cm: 10, mm: 1, ft: 304.8, in: 25.4 }
export const imperialUnit = (u: LengthUnit) => u === 'ft' || u === 'in'

/** The page every PDF sheet shares, in millimetres, landscape. */
export const pageSize = (unit: LengthUnit) => (imperialUnit(unit) ? { w: 279.4, h: 215.9, name: 'Letter' } : { w: 297, h: 210, name: 'A4' })

/* ---------------------------------------------------------------- */
/*  Shapes, and how they are written                                 */
/* ---------------------------------------------------------------- */

type P = [number, number]
type Layer = 'outline' | 'marks' | 'text'
type Tone = 'ink' | 'muted' | 'accent' | 'faint'

type Shape =
  | { t: 'poly'; layer: 'outline' | 'marks'; pts: P[]; closed: boolean; dash?: boolean; weight?: number; color?: string }
  | { t: 'circle'; layer: 'outline' | 'marks'; c: P; r: number }
  /** Arc from a0 to a1, counter-clockwise as seen (y up), degrees. */
  | { t: 'arc'; layer: 'marks'; c: P; r: number; a0: number; a1: number }
  | { t: 'fill'; pts: P[]; color: string }
  | { t: 'text'; at: P; s: string; size: number; anchor: 'start' | 'middle' | 'end'; middle: boolean; weight: number; rotate: number; tone: Tone }

/** Coordinates run x right, y down (as in SVG); angles are as seen. */
export class Drawing {
  shapes: Shape[] = []
  minX = Infinity
  minY = Infinity
  maxX = -Infinity
  maxY = -Infinity

  private grow(...pts: P[]) {
    for (const [x, y] of pts) {
      this.minX = Math.min(this.minX, x)
      this.minY = Math.min(this.minY, y)
      this.maxX = Math.max(this.maxX, x)
      this.maxY = Math.max(this.maxY, y)
    }
  }
  poly(layer: 'outline' | 'marks', pts: P[], closed = true, opts: { dash?: boolean; weight?: number; color?: string } = {}) {
    this.grow(...pts)
    this.shapes.push({ t: 'poly', layer, pts, closed, ...opts })
  }
  line(layer: 'outline' | 'marks', a: P, b: P, opts: { dash?: boolean; weight?: number; color?: string } = {}) {
    this.poly(layer, [a, b], false, opts)
  }
  circle(layer: 'outline' | 'marks', c: P, r: number) {
    this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r])
    this.shapes.push({ t: 'circle', layer, c, r })
  }
  arc(c: P, r: number, a0: number, a1: number) {
    this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r])
    this.shapes.push({ t: 'arc', layer: 'marks', c, r, a0, a1 })
  }
  fill(pts: P[], color: string) {
    this.grow(...pts)
    this.shapes.push({ t: 'fill', pts, color })
  }
  /** `size` is the cap height. */
  text(at: P, s: string, size: number, opts: { anchor?: 'start' | 'middle' | 'end'; middle?: boolean; weight?: number; rotate?: number; tone?: Tone } = {}) {
    const w = s.length * size * 0.62
    const anchor = opts.anchor ?? 'start'
    if (!opts.rotate) {
      const x0 = anchor === 'middle' ? at[0] - w / 2 : anchor === 'end' ? at[0] - w : at[0]
      const y0 = opts.middle ? at[1] - size * 0.7 : at[1] - size * 1.1
      this.grow([x0, y0], [x0 + w, y0 + size * 1.4])
    } else {
      this.grow([at[0] - w / 2, at[1] - w / 2], [at[0] + w / 2, at[1] + w / 2])
    }
    this.shapes.push({ t: 'text', at, s, size, anchor, middle: !!opts.middle, weight: opts.weight ?? 400, rotate: opts.rotate ?? 0, tone: opts.tone ?? 'ink' })
  }
  /** Copy another drawing's shapes in, moved by (dx, dy). */
  place(other: Drawing, dx: number, dy: number) {
    const m = ([x, y]: P): P => [x + dx, y + dy]
    for (const s of other.shapes) {
      if (s.t === 'poly' || s.t === 'fill') this.shapes.push({ ...s, pts: s.pts.map(m) })
      else if (s.t === 'circle' || s.t === 'arc') this.shapes.push({ ...s, c: m(s.c) })
      else this.shapes.push({ ...s, at: m(s.at) })
    }
    this.grow([other.minX + dx, other.minY + dy], [other.maxX + dx, other.maxY + dy])
  }
}

/** Line weights and colours: for a cutter (hairlines, layer colours) or for print. */
interface Style {
  stroke: Record<'outline' | 'marks', string>
  width: Record<'outline' | 'marks', number>
  panelFill: string
  tone: Record<Tone, string>
}

const cutterStyle = (mm: number): Style => ({
  stroke: { outline: '#ff0000', marks: '#0000ff' },
  width: { outline: 0.25 * mm, marks: 0.25 * mm },
  panelFill: 'none',
  tone: { ink: '#000000', muted: '#333333', accent: '#0000ff', faint: '#777777' },
})

const PRINT: Style = {
  stroke: { outline: '#18181b', marks: '#2563eb' },
  width: { outline: 0.35, marks: 0.2 },
  panelFill: '#f4f4f5',
  tone: { ink: '#18181b', muted: '#52525b', accent: '#2563eb', faint: '#a1a1aa' },
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n = (x: number) => (Math.abs(x) < 1e-9 ? '0' : x.toFixed(3).replace(/\.?0+$/, ''))
const FONT = 'Helvetica, Arial, sans-serif'

function svgShapes(d: Drawing, st: Style): string {
  const byLayer: Record<Layer, string[]> = { outline: [], marks: [], text: [] }
  for (const s of d.shapes) {
    if (s.t === 'poly') {
      const pts = s.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')
      const w = st.width[s.layer] * (s.weight ?? 1)
      const dash = s.dash ? ` stroke-dasharray="${n(w * 6)} ${n(w * 4)}"` : ''
      const fill = s.closed && s.layer === 'outline' ? st.panelFill : 'none'
      const stroke = s.color ?? st.stroke[s.layer]
      byLayer[s.layer].push(
        s.closed
          ? `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}" stroke-linejoin="round"${dash}/>`
          : `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${n(w)}" stroke-linecap="round"${dash}/>`,
      )
    } else if (s.t === 'circle') {
      byLayer[s.layer].push(`<circle cx="${n(s.c[0])}" cy="${n(s.c[1])}" r="${n(s.r)}" fill="none" stroke="${st.stroke[s.layer]}" stroke-width="${n(st.width[s.layer])}"/>`)
    } else if (s.t === 'arc') {
      const pt = (a: number): P => [s.c[0] + s.r * Math.cos((a * Math.PI) / 180), s.c[1] - s.r * Math.sin((a * Math.PI) / 180)]
      const [p0, p1] = [pt(s.a0), pt(s.a1)]
      const large = ((s.a1 - s.a0 + 360) % 360) > 180 ? 1 : 0
      byLayer.marks.push(
        `<path d="M ${n(p0[0])} ${n(p0[1])} A ${n(s.r)} ${n(s.r)} 0 ${large} 0 ${n(p1[0])} ${n(p1[1])}" fill="none" stroke="${st.stroke.marks}" stroke-width="${n(st.width.marks)}"/>`,
      )
    } else if (s.t === 'fill') {
      byLayer.marks.push(`<polygon points="${s.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="${s.color}" stroke="none"/>`)
    } else {
      const rot = s.rotate ? ` transform="rotate(${n(s.rotate)} ${n(s.at[0])} ${n(s.at[1])})"` : ''
      // A central baseline, placed by hand: not every renderer honours dominant-baseline.
      const y = s.middle ? s.at[1] + s.size / 2 : s.at[1]
      byLayer.text.push(
        `<text x="${n(s.at[0])}" y="${n(y)}" font-family="${FONT}" font-size="${n(s.size * 1.38)}"${s.weight !== 400 ? ` font-weight="${s.weight}"` : ''} text-anchor="${s.anchor}" fill="${st.tone[s.tone]}"${rot}>${esc(s.s)}</text>`,
      )
    }
  }
  const layer = (id: Layer) => `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}">${byLayer[id].join('')}</g>`
  return layer('outline') + layer('marks') + layer('text')
}

function svgDocument(body: string, x: number, y: number, w: number, h: number, units: 'mm' | 'in') {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${n(w)}${units}" height="${n(h)}${units}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>${body}</svg>`
  )
}

/** DXF text is plain ASCII; R12 writes the degree sign as %%d. */
const dxfText = (s: string) =>
  s
    .replace(/°/g, '%%d')
    .replace(/×/g, 'x')
    .replace(/′/g, "'")
    .replace(/·/g, '-')
    .replace(/²/g, '2')
    .replace(/Ø/g, 'dia ')
    .replace(/–/g, '-')
    .replace(/[^\x20-\x7e]/g, '?')

/** The drawing as DXF R12, y flipped up, layers OUTLINE (red), MARKS (blue), TEXT. */
function dxfDocument(d: Drawing, units: 'mm' | 'in'): string {
  const out: string[] = []
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? n(value) : value)
  const LAYER = { outline: 'OUTLINE', marks: 'MARKS', text: 'TEXT' }
  const f = ([x, y]: P): P => [x, -y]
  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1009')
  g(9, '$INSUNITS'); g(70, units === 'mm' ? 4 : 1)
  g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'TABLES')
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1)
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0)
  g(0, 'ENDTAB')
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, 3)
  for (const [name, color] of [['OUTLINE', 1], ['MARKS', 5], ['TEXT', 7]] as const) {
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS')
  }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'ENTITIES')
  for (const s of d.shapes) {
    if (s.t === 'poly') {
      if (s.pts.length === 2 && !s.closed) {
        const [a, b] = s.pts.map(f)
        g(0, 'LINE'); g(8, LAYER[s.layer]); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0)
        continue
      }
      g(0, 'POLYLINE'); g(8, LAYER[s.layer]); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, s.closed ? 1 : 0)
      for (const p of s.pts.map(f)) {
        g(0, 'VERTEX'); g(8, LAYER[s.layer]); g(10, p[0]); g(20, p[1]); g(30, 0)
      }
      g(0, 'SEQEND'); g(8, LAYER[s.layer])
    } else if (s.t === 'circle') {
      const c = f(s.c)
      g(0, 'CIRCLE'); g(8, LAYER[s.layer]); g(10, c[0]); g(20, c[1]); g(30, 0); g(40, s.r)
    } else if (s.t === 'arc') {
      const c = f(s.c)
      g(0, 'ARC'); g(8, 'MARKS'); g(10, c[0]); g(20, c[1]); g(30, 0); g(40, s.r); g(50, ((s.a0 % 360) + 360) % 360); g(51, ((s.a1 % 360) + 360) % 360)
    } else if (s.t === 'fill') {
      const [a, b, c, e] = s.pts.map(f)
      // SOLID takes its corners in a zigzag: 1, 2, 4, 3.
      g(0, 'SOLID'); g(8, 'MARKS'); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0); g(12, e[0]); g(22, e[1]); g(32, 0); g(13, c[0]); g(23, c[1]); g(33, 0)
    } else {
      const at = f(s.at)
      const h = s.anchor === 'middle' ? 1 : s.anchor === 'end' ? 2 : 0
      g(0, 'TEXT'); g(8, 'TEXT'); g(10, at[0]); g(20, at[1]); g(30, 0); g(40, s.size); g(1, dxfText(s.s))
      if (s.rotate) g(50, -s.rotate)
      if (h || s.middle) {
        g(72, h)
        g(11, at[0]); g(21, at[1]); g(31, 0)
        if (s.middle) g(73, 2)
      }
    }
  }
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return out.join('\n') + '\n'
}

/* ---------------------------------------------------------------- */
/*  Words and numbers                                                */
/* ---------------------------------------------------------------- */

export const deg = (x: number) => `${x.toFixed(2)}°`
export const fmtLen = (x: number, unit: LengthUnit) => `${x.toFixed({ m: 4, cm: 2, mm: 1, ft: 4, in: 3 }[unit])} ${unit}`
export const fileSafe = (s: string) => s.replace(/′/g, 'p').replace(/[^A-Za-z0-9_-]/g, '_')
const POLY = (m: number) => ({ 3: 'triangle', 4: 'quad', 5: 'pentagon', 6: 'hexagon' })[m] ?? `${m}-gon`

function domeLine(dome: Dome, unit: LengthUnit) {
  const p = dome.params
  return `${p.pattern === 'goldberg' ? 'Goldberg' : 'Geodesic'} ${p.frequency}V ${p.solid} · r ${p.radius} ${unit} · cut ${Number(p.cut.toFixed(4))} (${p.mode})`
}

/** A part's facts: the page's data table, and the 1:1 sheet's notes. */
export interface Facts {
  title: string
  kind: string
  /** Rows of [key, value]; a row with no value is a heading. */
  rows: [string, string?][]
  /** Tables of columns, under the rows. */
  table?: { head: string[]; rows: string[][] }
}

/* ---------------------------------------------------------------- */
/*  Parts                                                            */
/* ---------------------------------------------------------------- */

/** Panel corners at true shape, laid on the longest side, as seen from outside (y down). */
function panelOutline(t: FaceType, R: number): P[] {
  let pts: P[] = t.outline.map(([x, y]) => [x * R, y * R])
  const m = pts.length
  const len = (i: number) => Math.hypot(pts[(i + 1) % m][0] - pts[i][0], pts[(i + 1) % m][1] - pts[i][1])
  const longest = pts.reduce((b, _, i) => (len(i) > len(b) ? i : b), 0)
  const [a0, a1] = [pts[longest], pts[(longest + 1) % m]]
  const rot = -Math.atan2(a1[1] - a0[1], a1[0] - a0[0])
  const [c, s] = [Math.cos(rot), Math.sin(rot)]
  pts = pts.map(([x, y]) => [(x - a0[0]) * c - (y - a0[1]) * s, (x - a0[0]) * s + (y - a0[1]) * c])
  // y up → y down: flipping keeps the drawing as seen from outside, not its mirror.
  return pts.map(([x, y]) => [x, -y])
}

const normalize2 = ([x, y]: P): P => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

/**
 * The angle between the two panels at each strut, by panel type and strut
 * label: the blade tilt for a bevelled seam is half of it.
 */
function panelBevels(dome: Dome): Map<string, { min: number; max: number }> {
  const normals = dome.faces.map((f) => {
    const p = f.v.map((v) => dome.vertices[v])
    return normalize(cross(sub(p[1], p[0]), sub(p[2], p[0])))
  })
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const facesOf = new Map<string, number[]>()
  dome.faces.forEach((f, fi) =>
    f.v.forEach((v, i) => {
      const k = key(v, f.v[(i + 1) % f.v.length])
      facesOf.set(k, [...(facesOf.get(k) ?? []), fi])
    }),
  )
  const strutOf = new Map(dome.struts.map((s) => [key(s.a, s.b), s.type]))
  const out = new Map<string, { min: number; max: number }>()
  dome.faces.forEach((f, fi) =>
    f.v.forEach((v, i) => {
      const k = key(v, f.v[(i + 1) % f.v.length])
      const pair = facesOf.get(k)!
      if (pair.length !== 2) return
      const other = pair[0] === fi ? pair[1] : pair[0]
      const angle = (Math.acos(Math.max(-1, Math.min(1, dot(normals[fi], normals[other])))) * 180) / Math.PI
      const id = `${f.type}|${dome.strutTypes[strutOf.get(k)!].label}`
      const r = out.get(id) ?? { min: Infinity, max: -Infinity }
      out.set(id, { min: Math.min(r.min, angle), max: Math.max(r.max, angle) })
    }),
  )
  return out
}

const bevelText = (b: { min: number; max: number } | undefined) =>
  !b ? 'open edge' : b.max - b.min < 0.01 ? deg(b.min / 2) : `${deg(b.min / 2)}–${deg(b.max / 2)}`

function panelFacts(dome: Dome, t: FaceType, unit: LengthUnit, bevels: Map<string, { min: number; max: number }>): Facts {
  const R = dome.params.radius
  const m = t.outline.length
  const side = (i: number) => Math.hypot(t.outline[(i + 1) % m][0] - t.outline[i][0], t.outline[(i + 1) % m][1] - t.outline[i][1]) * R
  return {
    title: t.label,
    kind: `Panel · ${POLY(m)}${t.kind === 'cut' ? ` · cut piece of ${dome.faceTypes[t.parent!].label}` : ''}`,
    rows: [
      ['Quantity', String(t.count)],
      ['Area', `${t.area.toFixed(4)} ${unit}²`],
      ...(t.mirrorOf != null ? ([['Mirror of', dome.faceTypes[t.mirrorOf].label]] as [string, string][]) : []),
      ['Drawn', 'as seen from outside'],
    ],
    table: {
      head: ['Side', 'Strut', 'Length', 'Bevel', 'Corner'],
      rows: t.outline.map((_, i) => [String(i + 1), t.struts[i], fmtLen(side(i), unit), bevelText(bevels.get(`${t.index}|${t.struts[i]}`)), deg(t.angles[i])]),
    },
  }
}

/**
 * The panel at scale `k` (dome length → output units): outline, the label in
 * the middle, each side's strut and length outside it, each corner's angle
 * inside. `full` adds the bevels (the 1:1 sheet has no table beside it).
 */
function drawPanel(d: Drawing, dome: Dome, t: FaceType, k: number, th: number, full: boolean, bevels: Map<string, { min: number; max: number }>, unit: LengthUnit) {
  const pts = panelOutline(t, dome.params.radius * k)
  const m = pts.length
  d.poly('outline', pts)
  const cx = pts.reduce((s, p) => s + p[0], 0) / m
  const cy = pts.reduce((s, p) => s + p[1], 0) / m
  d.text([cx, cy], t.label, th * 1.8, { anchor: 'middle', middle: true, weight: 700 })
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % m]
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
    const L = Math.hypot(dx, dy)
    // Counter-clockwise as seen, with y down: outward is (−dy, dx).
    const mid: P = [(p[0] + q[0]) / 2 + (-dy / L) * th * 1.3, (p[1] + q[1]) / 2 + (dx / L) * th * 1.3]
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI
    if (ang > 90 || ang < -90) ang += 180
    const bevel = full ? ` · bevel ${bevelText(bevels.get(`${t.index}|${t.struts[i]}`))}` : ''
    d.text(mid, `${t.struts[i]} · ${fmtLen(L / k, unit)}${bevel}`, th * 0.85, { anchor: 'middle', middle: true, rotate: ang, tone: 'muted' })
  })
  pts.forEach((p, i) => {
    const prev = pts[(i + m - 1) % m]
    const next = pts[(i + 1) % m]
    const u = normalize2([prev[0] - p[0], prev[1] - p[1]])
    const v = normalize2([next[0] - p[0], next[1] - p[1]])
    const bis = normalize2([u[0] + v[0], u[1] + v[1]])
    const off = (th * 2.2) / Math.max(0.35, Math.sin((t.angles[i] * Math.PI) / 360))
    d.text([p[0] + bis[0] * off, p[1] + bis[1] * off], deg(t.angles[i]), th * 0.75, { anchor: 'middle', middle: true, tone: 'accent' })
  })
}

function strutFacts(dome: Dome, t: StrutType, unit: LengthUnit): Facts {
  const ends =
    t.kind === 'ring'
      ? ['in the base plane', 'in the base plane']
      : t.kind === 'cut'
        ? [`hub ${deg(t.endAngle!)}`, `meets the base plane at ${deg(t.cutAngle!)}`]
        : [`hub ${deg(t.endAngle!)}`, `hub ${deg(t.endAngle2 ?? t.endAngle!)}`]
  return {
    title: t.label,
    kind: t.kind === 'whole' ? 'Strut' : t.kind === 'cut' ? `Strut · cut piece of ${dome.strutTypes[t.parent!].label}` : 'Strut · base ring',
    rows: [
      ['Quantity', String(t.count)],
      ['Length', fmtLen(t.length, unit)],
      ['Length ÷ r', t.chordFactor.toFixed(6)],
      ...(t.centralAngle != null ? ([['Central angle', deg(t.centralAngle)]] as [string, string][]) : []),
      ['End 1', ends[0]],
      ['End 2', ends[1]],
      ['Measured', t.kind === 'whole' ? 'node to node' : t.kind === 'cut' ? 'node to the base plane' : 'along the base plane'],
    ],
  }
}

/**
 * The strut in elevation at scale `k`, node to node, ends square. The end
 * angles are written as data, not cut into the drawing: how an end is
 * finished depends on the connector, which the primitive does not choose.
 */
function drawStrut(d: Drawing, t: StrutType, k: number, th: number, unit: LengthUnit) {
  const L = t.length * k
  const w = Math.max(L * 0.035, th * 1.6)
  const half = w / 2
  d.poly('outline', [
    [0, -half],
    [L, -half],
    [L, half],
    [0, half],
  ])
  d.line('marks', [-th * 2, 0], [L + th * 2, 0], { dash: true })
  const dy = -half - th * 2.4
  d.line('marks', [0, -half - th * 0.5], [0, dy - th * 0.6])
  d.line('marks', [L, -half - th * 0.5], [L, dy - th * 0.6])
  d.line('marks', [0, dy], [L, dy])
  const tick = th * 0.5
  d.line('marks', [-tick, dy + tick], [tick, dy - tick])
  d.line('marks', [L - tick, dy + tick], [L + tick, dy - tick])
  d.text([L / 2, dy - th * 0.6], fmtLen(t.length, unit), th, { anchor: 'middle', weight: 700 })
  d.text([L / 2, 0], t.label, th * 1.2, { anchor: 'middle', middle: true, weight: 700 })
  const ends =
    t.kind === 'ring'
      ? ['in the base plane', 'in the base plane']
      : t.kind === 'cut'
        ? [`hub ${deg(t.endAngle!)}`, `meets base at ${deg(t.cutAngle!)}`]
        : [`hub ${deg(t.endAngle!)}`, `hub ${deg(t.endAngle2 ?? t.endAngle!)}`]
  d.text([0, half + th * 1.8], ends[0], th * 0.85, { tone: 'accent' })
  d.text([L, half + th * 1.8], ends[1], th * 0.85, { anchor: 'end', tone: 'accent' })
}

function hubFacts(dome: Dome, t: HubType): Facts {
  const rise = 'Dip'
  return {
    title: t.label,
    kind: t.kind === 'cut' ? 'Cut point on the base plane' : `Hub · ${t.valence}-way${t.base ? ' · on the base' : ''}`,
    rows: [
      ['Quantity', String(t.count)],
      ...(t.mirrorOf != null ? ([['Mirror of', dome.hubTypes[t.mirrorOf].label]] as [string, string][]) : []),
      ['Seen', 'from outside, down the sphere radius'],
      [rise, 'below the tangent plane'],
      ['Turn', 'around the axis to the next arm'],
    ],
    table: {
      head: ['Arm', 'Strut', rise, 'Turn', 'Between'],
      rows: t.arms.map((a, i) => [String(i + 1), a.strut, deg(a.dip), deg(a.turn), t.arms.length > 1 ? deg(a.between) : '—']),
    },
  }
}

/** The hub seen from outside, arms at their true turns, arm 1 up: a template to trace. `a` is the arm length. */
function drawHub(d: Drawing, t: HubType, a: number, th: number) {
  d.circle('marks', [0, 0], a * 1.06)
  d.circle('outline', [0, 0], a * 0.03)
  let theta = 90
  t.arms.forEach((arm, i) => {
    const r = (theta * Math.PI) / 180
    const dir: P = [Math.cos(r), -Math.sin(r)]
    d.line('outline', [dir[0] * a * 0.06, dir[1] * a * 0.06], [dir[0] * a, dir[1] * a], { weight: 2 })
    const lab: P = [dir[0] * (a * 1.06 + th * 2.6), dir[1] * (a * 1.06 + th * 2.6)]
    d.text([lab[0], lab[1] - th * 0.4], `${i + 1} · ${arm.strut}`, th * 1.05, { anchor: 'middle', middle: true, weight: 700 })
    d.text([lab[0], lab[1] + th * 1.4], `dip ${deg(arm.dip)}`, th * 0.8, { anchor: 'middle', middle: true, tone: 'accent' })
    if (t.arms.length > 1) {
      const rr = a * 0.38
      d.arc([0, 0], rr, theta, theta + arm.turn)
      const tm = ((theta + arm.turn / 2) * Math.PI) / 180
      d.text([Math.cos(tm) * rr * 1.5, -Math.sin(tm) * rr * 1.5], deg(arm.turn), th * 0.8, { anchor: 'middle', middle: true, tone: 'accent' })
    }
    theta += arm.turn
  })
}

/* ---------------------------------------------------------------- */
/*  The 1:1 sheet: part, notes above, scale bar below                 */
/* ---------------------------------------------------------------- */

const drawingUnits = (unit: LengthUnit) => {
  const imperial = imperialUnit(unit)
  return { units: imperial ? ('in' as const) : ('mm' as const), k: imperial ? TO_MM[unit] / 25.4 : TO_MM[unit], mm: imperial ? 1 / 25.4 : 1 }
}

/** A bar of `len` (in output units) labelled `label`, in five black and white cells. */
function scaleBar(d: Drawing, at: P, len: number, h: number, th: number, label: string) {
  for (let i = 0; i < 5; i++) {
    const x = at[0] + (i * len) / 5
    d.fill([[x, at[1]], [x + len / 5, at[1]], [x + len / 5, at[1] + h], [x, at[1] + h]], i % 2 ? '#ffffff' : '#18181b')
  }
  d.poly('marks', [at, [at[0] + len, at[1]], [at[0] + len, at[1] + h], [at[0], at[1] + h]], true, { weight: 0.6, color: '#18181b' })
  d.text([at[0], at[1] + h + th * 1.6], '0', th * 0.8, { tone: 'muted' })
  d.text([at[0] + len, at[1] + h + th * 1.6], label, th * 0.8, { anchor: 'end', tone: 'muted' })
}

/** Text height for a part this size at 1:1: readable when printed full size, not swamping small parts. */
const textHeight = (size: number, mm: number) => Math.min(30 * mm, Math.max(3 * mm, size * 0.03))

function fullSize(part: Drawing, facts: Facts, dome: Dome, unit: LengthUnit, th: number) {
  const { units, mm } = drawingUnits(unit)
  const d = new Drawing()
  const x0 = part.minX
  // Notes above the part.
  const notes = [
    facts.kind,
    ...facts.rows.filter(([k]) => k !== 'Quantity').map(([k, v]) => (v ? `${k}: ${v}` : k)),
    ...(facts.table ? [facts.table.head.join(' · '), ...facts.table.rows.map((r) => r.join(' · '))] : []),
    domeLine(dome, unit),
  ]
  const top = part.minY - th * 4 - notes.length * th * 1.8
  d.text([x0, top - th * 3], facts.title, th * 2.2, { weight: 700 })
  d.text([x0 + facts.title.length * th * 2.2 * 0.72 + th * 1.5, top - th * 3], `× ${facts.rows.find(([k]) => k === 'Quantity')?.[1] ?? '1'}`, th * 1.5)
  notes.forEach((l, i) => d.text([x0, top + i * th * 1.8], l, th, { tone: i === 0 ? 'ink' : 'muted' }))
  d.place(part, 0, 0)
  const bar = units === 'mm' ? 100 : 4
  scaleBar(d, [x0, part.maxY + th * 3], bar, th * 0.8, th, `${bar} ${units} · 1:1 · check this bar`)
  const margin = th * 2.5
  const x = d.minX - margin
  const y = d.minY - margin
  const w = d.maxX - d.minX + 2 * margin
  const h = d.maxY - d.minY + 2 * margin
  return {
    svg: svgDocument(svgShapes(d, cutterStyle(mm)), x, y, w, h, units),
    dxf: dxfDocument(d, units),
    width: w,
    height: h,
    units,
  }
}

/* ---------------------------------------------------------------- */
/*  The printable page                                               */
/* ---------------------------------------------------------------- */

/** Real-world bar lengths (in mm) a scale bar may show. */
const BAR_MM = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
const BAR_IN = [0.5, 1, 2, 6, 12, 24, 36, 48, 120, 240].map((x) => x * 25.4)

const barLabel = (mmLen: number, unit: LengthUnit) => {
  if (imperialUnit(unit)) {
    const inches = Math.round((mmLen / 25.4) * 100) / 100
    return inches >= 12 ? `${Math.round((inches / 12) * 100) / 100} ft` : `${inches} in`
  }
  return mmLen >= 1000 ? `${mmLen / 1000} m` : `${mmLen} mm`
}

/** A tidy ratio: 1:12.5, 1:8, 1:250. */
const ratio = (s: number) => {
  const r = 1 / s
  return r >= 10 ? `1:${Math.round(r)}` : r >= 2 ? `1:${r.toFixed(1).replace(/\.0$/, '')}` : r >= 1 ? `1:${r.toFixed(2).replace(/\.?0+$/, '')}` : `${(1 / r).toFixed(1)}:1`
}

const PAGE_TH = 2.3 // body text cap height, mm

interface PageCtx {
  dome: Dome
  unit: LengthUnit
  page: number
  pages: number
}

/** The frame every page shares: header, rules, footer with the page number. */
function pageFrame(ctx: PageCtx, title: string, qty: string, kind: string) {
  const { w: W, h: H } = pageSize(ctx.unit)
  const M = 12
  const d = new Drawing()
  // No background shape here: the document has one, and a shape in the marks
  // layer would be painted over the outlines.
  d.text([M, M + 8], title, 8, { weight: 700 })
  d.text([M + title.length * 8 * 0.7 + 5, M + 8], qty, 4.2, { tone: 'muted' })
  d.text([M, M + 14.5], kind, PAGE_TH, { tone: 'muted' })
  d.text([W - M, M + 5], domeLine(ctx.dome, ctx.unit).split(' · ')[0], PAGE_TH, { anchor: 'end', weight: 700 })
  d.text([W - M, M + 10], domeLine(ctx.dome, ctx.unit).split(' · ').slice(1).join(' · '), PAGE_TH, { anchor: 'end', tone: 'muted' })
  // Frame rules in neutral grey: blue is for data.
  d.line('marks', [M, M + 19], [W - M, M + 19], { weight: 1.5, color: '#d4d4d8' })
  d.line('marks', [M, H - M - 11], [W - M, H - M - 11], { weight: 1.5, color: '#d4d4d8' })
  d.text([W - M, H - M - 3], `${ctx.page} / ${ctx.pages}`, PAGE_TH, { anchor: 'end', tone: 'muted' })
  return { d, W, H, M, body: { x0: M, y0: M + 25, x1: W - M, y1: H - M - 17 } }
}

/** The facts as a table in a column `w` wide; returns the height used. */
function factsColumn(d: Drawing, f: Facts, x: number, y: number, w: number) {
  const row = PAGE_TH * 2.05
  let yy = y
  const wide = (s: string) => s.length * PAGE_TH * 0.68
  for (const [k, v] of f.rows) {
    d.text([x, yy], k, PAGE_TH, { tone: 'muted' })
    // A value too long to share the line with its key goes on the next.
    if (v && wide(k) + wide(v) + 3 > w) yy += row * 0.85
    if (v) d.text([x + w, yy], v, PAGE_TH, { anchor: 'end' })
    yy += row
  }
  if (f.table) {
    yy += row * 0.5
    const cols = f.table.head.length
    // First two columns narrow (index, label); the rest share what is left, right-aligned.
    const xs = [x, x + 9, ...Array.from({ length: cols - 2 }, (_, i) => x + 18 + ((w - 18) * (i + 1)) / (cols - 2))]
    const cell = (r: string[], tone: Tone, weight = 400) =>
      r.forEach((c, i) => d.text([i < 2 ? xs[i] : xs[i], yy], c, PAGE_TH * 0.92, { anchor: i < 2 ? 'start' : 'end', tone, weight }))
    cell(f.table.head, 'muted', 700)
    yy += row * 0.6
    d.line('marks', [x, yy], [x + w, yy], { weight: 1.5, color: '#d4d4d8' })
    yy += row
    for (const r of f.table.rows) {
      cell(r, 'ink')
      yy += row
    }
  }
  return yy - y
}

/**
 * A part on a page: the drawing scaled to fit the left of the body, its
 * facts on the right, and a scale bar of a round real length.
 */
function partPage(ctx: PageCtx, f: Facts, qty: string, draw: (k: number, th: number) => Drawing, extent: { w: number; h: number }, nominal = false) {
  const { d, M, H, body } = pageFrame(ctx, f.title, qty, f.kind)
  const colW = 78
  const box = { x0: body.x0, y0: body.y0, x1: body.x1 - colW - 10, y1: body.y1 }
  factsColumn(d, f, body.x1 - colW, body.y0 + 2, colW)
  d.line('marks', [body.x1 - colW - 5, body.y0 - 2], [body.x1 - colW - 5, body.y1], { weight: 1.5, color: '#e4e4e7' })
  // Fit the drawing, leaving room for the notes drawn around it.
  const pad = PAGE_TH * 9
  // Never enlarged: a part that fits prints at full size.
  const s = Math.min(1 / TO_MM.mm, (box.x1 - box.x0 - pad) / extent.w, (box.y1 - box.y0 - pad) / extent.h)
  // Shrink further while the notes still spill over: text keeps its size, so check again.
  let sf = s
  let final = draw(sf, PAGE_TH)
  for (let i = 0; i < 6; i++) {
    const fit = Math.min(1, (box.x1 - box.x0) / (final.maxX - final.minX), (box.y1 - box.y0) / (final.maxY - final.minY))
    if (fit >= 1) break
    sf *= fit * 0.98
    final = draw(sf, PAGE_TH)
  }
  d.place(final, (box.x0 + box.x1) / 2 - (final.minX + final.maxX) / 2, (box.y0 + box.y1) / 2 - (final.minY + final.maxY) / 2)
  // Footer: a bar of a round length, and the scale it was drawn at.
  if (nominal) {
    d.text([M, H - M - 3], 'Template: arm length nominal, angles true', PAGE_TH, { tone: 'muted' })
  } else {
    const choices = imperialUnit(ctx.unit) ? BAR_IN : BAR_MM
    const real = choices.find((c) => c * sf >= 25) ?? choices[choices.length - 1]
    scaleBar(d, [M, H - M - 7.5], real * sf, 1.8, PAGE_TH, barLabel(real, ctx.unit))
    const note = sf > 0.9999 ? 'full size when printed at 100%' : 'for full size use the SVG or DXF'
    d.text([M + real * sf + 6, H - M - 5.6], `Scale ${sf > 0.9999 ? '1:1' : ratio(sf)} · ${note}`, PAGE_TH, { tone: 'muted' })
  }
  return svgDocument(svgShapes(d, PRINT), 0, 0, pageSize(ctx.unit).w, pageSize(ctx.unit).h, 'mm')
}

/** The first page: what the dome is, every part with its count, and the face schema. */
function overviewPage(ctx: PageCtx) {
  const { dome, unit } = ctx
  const s = dome.stats
  const { d, body } = pageFrame(ctx, 'Parts', `${s.struts + s.faces + s.hubs} pieces`, `${s.struts} struts · ${s.faces} panels · ${s.hubs} hubs${s.cutPoints ? ` (incl. ${s.cutPoints} cut points)` : ''}`)
  const row = PAGE_TH * 2.05
  const maxRows = Math.floor((body.y1 - body.y0 - row * 3) / row)
  const column = (x: number, w: number, title: string, items: [string, string, string][]) => {
    d.text([x, body.y0 + 2], title, PAGE_TH * 1.1, { weight: 700 })
    let y = body.y0 + 2 + row * 1.3
    d.line('marks', [x, y - row * 0.6], [x + w, y - row * 0.6], { weight: 1.5, color: '#d4d4d8' })
    const shown = items.length > maxRows ? items.slice(0, maxRows - 1) : items
    for (const [a, b, c] of shown) {
      d.text([x, y + row * 0.4], a, PAGE_TH, { weight: 700 })
      d.text([x + 14, y + row * 0.4], `× ${b}`, PAGE_TH, { tone: 'muted' })
      d.text([x + w, y + row * 0.4], c, PAGE_TH, { anchor: 'end' })
      y += row
    }
    if (shown.length < items.length) d.text([x, y + row * 0.4], `+ ${items.length - shown.length} more, on their own pages`, PAGE_TH * 0.9, { tone: 'muted' })
  }
  column(body.x0, 52, 'Struts', dome.strutTypes.filter((t) => t.count).map((t) => [t.label, String(t.count), fmtLen(t.length, unit)]))
  column(body.x0 + 60, 58, 'Panels', dome.faceTypes.filter((t) => t.count).map((t) => [t.label, String(t.count), `${POLY(t.outline.length)} ${t.area.toFixed(3)} ${unit}²`]))
  column(body.x0 + 126, 40, 'Hubs', dome.hubTypes.map((t) => [t.label, String(t.count), t.kind === 'cut' ? 'cut pt' : `${t.valence}-way`]))
  // Measurements and the schema on the right.
  const x = body.x0 + 176
  const w = body.x1 - x
  const facts: Facts = {
    title: '',
    kind: '',
    rows: [
      ['Height', fmtLen(s.height, unit)],
      ...(s.euler === 2 ? [] : ([['Base Ø', fmtLen(s.baseDiameter, unit)], ['Base', s.baseDeviation < 1e-6 * dome.params.radius ? 'flat' : `stepped ${fmtLen(s.baseDeviation, unit)}`]] as [string, string][])),
      ['Skin', `${s.surfaceArea.toFixed(3)} ${unit}²`],
      ['Strut run', fmtLen(s.totalStrutLength, unit)],
    ],
  }
  const used = factsColumn(d, facts, x, body.y0 + 2, w)
  const { frequency: V, points, edges } = dome.schema
  const side = Math.min(w, ((body.y1 - body.y0 - used - 12) * 2) / Math.sqrt(3))
  const h = (side * Math.sqrt(3)) / 2
  const top = body.y1 - h
  const A: P = [x + w / 2, top]
  const B: P = [x + w / 2 - side / 2, top + h]
  const C: P = [x + w / 2 + side / 2, top + h]
  const at = (i: number, j: number): P => [A[0] + (i / V) * (B[0] - A[0]) + (j / V) * (C[0] - A[0]), A[1] + (i / V) * (B[1] - A[1]) + (j / V) * (C[1] - A[1])]
  d.text([x, top - 4], 'One base face (not to scale)', PAGE_TH * 0.9, { tone: 'muted' })
  for (const e of edges) {
    const p = at(points[e.from].i, points[e.from].j)
    const q = at(points[e.to].i, points[e.to].j)
    d.line('outline', p, q, { weight: 0.6 })
    if (V <= 6) d.text([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], dome.strutTypes[e.type].label, PAGE_TH * (V <= 3 ? 0.9 : 0.7), { anchor: 'middle', middle: true, weight: 700, tone: 'accent' })
  }
  return svgDocument(svgShapes(d, PRINT), 0, 0, pageSize(unit).w, pageSize(unit).h, 'mm')
}

/* ---------------------------------------------------------------- */
/*  All of it                                                        */
/* ---------------------------------------------------------------- */

/** Every sheet for a dome: the overview, then each panel, strut and hub type in use. */
export function buildSheets(dome: Dome, unit: LengthUnit, build?: Build | null): Sheet[] {
  if (build) return constructionSheets(dome, unit, build)
  const bevels = panelBevels(dome)
  const { k, mm } = drawingUnits(unit)
  const kPage = TO_MM[unit] // dome length → page millimetres, before scaling
  const panels = dome.faceTypes.filter((t) => t.count)
  const struts = dome.strutTypes.filter((t) => t.count)
  const hubs = dome.hubTypes
  const pages = 1 + panels.length + struts.length + hubs.length
  let page = 1
  const ctx = (): PageCtx => ({ dome, unit, page: ++page, pages })

  // The overview's 1:1 sheet is its page; it has no geometry at true size.
  const overview = overviewPage({ dome, unit, page: 1, pages })
  const out: Sheet[] = [
    {
      id: 'overview',
      kind: 'overview',
      label: 'Overview',
      index: -1,
      qty: 1,
      width: pageSize(unit).w,
      height: pageSize(unit).h,
      units: 'mm',
      svg: overview,
      dxf: '',
      page: overview,
    },
  ]

  for (const t of panels) {
    const f = panelFacts(dome, t, unit, bevels)
    const one = panelOutline(t, dome.params.radius * k)
    const size = Math.max(...one.map((p) => p[0])) - Math.min(...one.map((p) => p[0]))
    const th = textHeight(size, mm)
    const part = new Drawing()
    drawPanel(part, dome, t, k, th, true, bevels, unit)
    const pts = panelOutline(t, dome.params.radius * kPage)
    const extent = { w: Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), h: Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])) }
    const pageSvg = partPage(ctx(), f, `× ${t.count}`, (s, th2) => {
      const d = new Drawing()
      drawPanel(d, dome, t, kPage * s, th2, false, bevels, unit)
      return d
    }, extent)
    out.push({ id: `panel-${fileSafe(t.label)}`, kind: 'panel', label: t.label, index: t.index, qty: t.count, ...fullSize(part, f, dome, unit, th), page: pageSvg })
  }

  for (const t of struts) {
    const f = strutFacts(dome, t, unit)
    const th = textHeight(t.length * k * 0.6, mm)
    const part = new Drawing()
    drawStrut(part, t, k, th, unit)
    const pageSvg = partPage(ctx(), f, `× ${t.count}`, (s, th2) => {
      const d = new Drawing()
      drawStrut(d, t, kPage * s, th2, unit)
      return d
    }, { w: t.length * kPage, h: t.length * kPage * 0.1 })
    out.push({ id: `strut-${fileSafe(t.label)}`, kind: 'strut', label: t.label, index: t.index, qty: t.count, ...fullSize(part, f, dome, unit, th), page: pageSvg })
  }

  for (const t of hubs) {
    const f = hubFacts(dome, t)
    const th = 3.2 * mm
    const part = new Drawing()
    drawHub(part, t, 70 * mm, th)
    // The hub template is nominal: on the page it simply fills its box.
    const pageSvg = partPage(ctx(), f, `× ${t.count}`, (s, th2) => {
      const d = new Drawing()
      drawHub(d, t, 100 * s, th2)
      return d
    }, { w: 230, h: 230 }, true)
    out.push({ id: `hub-${fileSafe(t.label)}`, kind: 'hub', label: t.label, index: t.index, qty: t.count, ...fullSize(part, f, dome, unit, th), page: pageSvg })
  }
  return out
}

/** The first page of a construction: its parts by kind, the hardware, and the dimensions it was built with. */
function constructionOverview(ctx: PageCtx, build: Build, title: string) {
  const { d, body } = pageFrame(ctx, title, `${build.parts.reduce((s, p) => s + p.qty, 0)} parts`, 'Every part, with its count; each has its own page')
  const row = PAGE_TH * 2.05
  const maxRows = Math.floor((body.y1 - body.y0 - row * 3) / row)
  const groups = [...new Set(build.parts.map((p) => p.name))]
  const colW = 64
  groups.forEach((name, gi) => {
    const x = body.x0 + gi * (colW + 8)
    const items = build.parts.filter((p) => p.name === name)
    d.text([x, body.y0 + 2], name.endsWith('ing') ? name : `${name}s`, PAGE_TH * 1.1, { weight: 700 })
    let y = body.y0 + 2 + row * 1.3
    d.line('marks', [x, y - row * 0.6], [x + colW, y - row * 0.6], { weight: 1.5, color: '#d4d4d8' })
    const shown = items.length > maxRows ? items.slice(0, maxRows - 1) : items
    for (const p of shown) {
      d.text([x, y + row * 0.4], p.label, PAGE_TH, { weight: 700 })
      d.text([x + 12, y + row * 0.4], `× ${p.qty}`, PAGE_TH, { tone: 'muted' })
      d.text([x + colW, y + row * 0.4], p.spec.split(' · ')[0], PAGE_TH, { anchor: 'end' })
      y += row
    }
    if (shown.length < items.length) d.text([x, y + row * 0.4], `+ ${items.length - shown.length} more`, PAGE_TH * 0.9, { tone: 'muted' })
  })
  const x = body.x0 + groups.length * (colW + 8)
  const w = Math.min(body.x1 - x, 90)
  const facts: Facts = {
    title: '',
    kind: '',
    rows: [
      ['Built with', ''],
      ...build.dimRows,
      ...(build.hardware.length ? ([['Hardware', '']] as [string, string][]) : []),
      ...build.hardware.map((h) => [`${h.qty} × ${h.label}`, h.spec.split(',')[0]] as [string, string]),
    ],
  }
  factsColumn(d, facts, x, body.y0 + 2, w)
  build.warnings.forEach((t, i) => d.text([body.x0, body.y1 - (build.warnings.length - i) * row], `! ${t}`, PAGE_TH * 0.9, { tone: 'accent' }))
  return svgDocument(svgShapes(d, PRINT), 0, 0, pageSize(ctx.unit).w, pageSize(ctx.unit).h, 'mm')
}

/** Sheets for a construction: an overview, then a page per part type. */
function constructionSheets(dome: Dome, unit: LengthUnit, build: Build): Sheet[] {
  const { k, mm } = drawingUnits(unit)
  const kPage = TO_MM[unit]
  const pages = 1 + build.parts.length
  let page = 1
  const overview = constructionOverview({ dome, unit, page: 1, pages }, build, 'Parts')
  const out: Sheet[] = [
    { id: 'overview', kind: 'overview', label: 'Overview', index: -1, qty: 1, width: pageSize(unit).w, height: pageSize(unit).h, units: 'mm', svg: overview, dxf: '', page: overview },
  ]
  for (const p of build.parts) {
    const th = textHeight(Math.max(p.size.w, p.size.h * 2) * k * 0.6, mm)
    const part = new Drawing()
    p.draw(part, k, th, true)
    const pageSvg = partPage({ dome, unit, page: ++page, pages }, p.facts, `× ${p.qty}`, (s, th2) => {
      const d = new Drawing()
      p.draw(d, kPage * s, th2, false)
      return d
    }, { w: p.size.w * kPage, h: p.size.h * kPage })
    out.push({ id: p.id, kind: p.kind, label: p.label, index: p.index, qty: p.qty, ...fullSize(part, p.facts, dome, unit, th), page: pageSvg })
  }
  return out
}
