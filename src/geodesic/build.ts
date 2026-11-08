/**
 * Construction techniques: how the primitive becomes parts you can make.
 * Each technique takes the dome and a few material dimensions (millimetres)
 * and returns its part types (with a drawing each), the hardware, and every
 * part as a solid, placed, for the 3D view and the STEP file.
 *
 * Geometry is in the dome's length unit, like `params.radius`.
 */
import { Drawing, TO_MM, deg, fileSafe, imperialUnit, type Facts, type LengthUnit } from './sheets'
import { circle2, clip2, convexSolid, cylinder, frameAt, hull, prism, slab, type HalfSpace, type P2, type Solid } from './solid'
import { toStep } from './step'
import type { Dome } from './types'
import { add, cross, distance, dot, length, normalize, scale, sub, type Vec3 } from './vec'

export type Technique = 'primitive' | 'panels' | 'mitre1' | 'mitre2' | 'frames' | 'pipe' | 'plates' | 'timber'

export interface DimSpec {
  key: string
  label: string
  /** Default, millimetres. */
  mm: number
  min: number
  max: number
}

export interface TechniqueSpec {
  id: Technique
  name: string
  text: string
  dims: DimSpec[]
}

const TUBE: DimSpec[] = [
  { key: 'od', label: 'Tube outside Ø', mm: 23.4, min: 4, max: 300 },
  { key: 'wall', label: 'Tube wall', mm: 1.5, min: 0.3, max: 30 },
  { key: 'flat', label: 'Flattened length', mm: 45, min: 5, max: 600 },
  { key: 'margin', label: 'Hole to tube end', mm: 15, min: 2, max: 300 },
  { key: 'bolt', label: 'Bolt Ø', mm: 8, min: 2, max: 60 },
]

export const TECHNIQUES: TechniqueSpec[] = [
  {
    id: 'primitive',
    name: 'Primitive',
    text: 'The geometry alone: struts node to node, panels as flat faces, hubs as angles. No material, no thickness.',
    dims: [],
  },
  {
    id: 'panels',
    name: 'Sheet panels',
    text: 'Hubless, no frame: thick sheet (plywood, foam board, polycarbonate) cut to the panels and joined edge to edge. Every edge is bevelled toward the dome centre, so neighbours meet flush.',
    dims: [{ key: 'thickness', label: 'Sheet thickness', mm: 18, min: 0.5, max: 300 }],
  },
  {
    id: 'mitre1',
    name: 'Single mitre',
    text: 'Hubless, one timber strut per edge, shared by the two faces. Each end is cut to a point, two mitres meeting on the node axis, so all the struts at a node meet tip to tip. The top is ridged to carry both panels’ decking, which is what makes the nodes stiff.',
    dims: [
      { key: 'sheath', label: 'Decking thickness', mm: 12, min: 0, max: 100 },
      { key: 'width', label: 'Strut width', mm: 38, min: 10, max: 300 },
      { key: 'depth', label: 'Strut depth', mm: 89, min: 10, max: 600 },
    ],
  },
  {
    id: 'mitre2',
    name: 'Double mitre',
    text: 'Hubless, a timber frame per face: every edge is two struts side by side, one from each frame, bevelled to sit face to face and bolted through. Frame corners are mitred, compound cuts so the bevelled outer sides meet exactly (inside, at the bottom of a corner, one beam stands a little past the other: given per frame).',
    dims: frameDims(10, 3, 89),
  },
  {
    id: 'frames',
    name: 'Good Karma',
    text: 'Good Karma Domes: a 2×6 frame per face, corners butted (each strut runs past its corner, the next butts into it), glued and screwed, decking glued and nailed on in the shop (8d ring-shank at 4″). Neighbouring frames make a double strut, bolted through (four 3/8″ × 4″ per side).',
    dims: frameDims(9.5, 4, 140),
  },
  {
    id: 'pipe',
    name: 'Flattened pipe',
    text: 'Tube struts (EMT conduit, steel or aluminium tube) with flattened, drilled and bent ends, stacked on one bolt at each node.',
    dims: TUBE,
  },
  {
    id: 'plates',
    name: 'Plate hubs',
    text: 'A flat plate at every node, tangent to the sphere. Tube struts with flattened, bent ends bolt under it, one bolt each.',
    dims: [
      { key: 'plate', label: 'Plate thickness', mm: 5, min: 0.5, max: 60 },
      { key: 'circle', label: 'Hole distance from centre', mm: 50, min: 5, max: 1000 },
      { key: 'edge', label: 'Plate edge around holes', mm: 20, min: 2, max: 300 },
      ...TUBE,
    ],
  },
  {
    id: 'timber',
    name: 'Timber on star hubs',
    text: 'Square-cut timber struts with a saw kerf in each end, slotted over steel fins welded to a tube at every node and bolted through. The fins carry the angles, so every wood cut is square.',
    dims: [
      { key: 'width', label: 'Beam width', mm: 38, min: 10, max: 300 },
      { key: 'depth', label: 'Beam depth (radial)', mm: 89, min: 10, max: 600 },
      { key: 'tube', label: 'Hub tube Ø', mm: 60, min: 10, max: 500 },
      { key: 'fin', label: 'Fin into the beam', mm: 120, min: 10, max: 600 },
      { key: 'finT', label: 'Fin thickness', mm: 6, min: 1, max: 40 },
      { key: 'gap', label: 'Gap, tube to beam', mm: 5, min: 0, max: 100 },
      { key: 'bolt', label: 'Bolt Ø', mm: 10, min: 3, max: 30 },
    ],
  },
]

function frameDims(bolt: number, perSide: number, depth: number): DimSpec[] {
  return [
    { key: 'sheath', label: 'Decking thickness', mm: 12, min: 0, max: 100 },
    { key: 'width', label: 'Beam width (in the face)', mm: 38, min: 10, max: 300 },
    { key: 'depth', label: 'Beam depth', mm: depth, min: 10, max: 600 },
    { key: 'bolt', label: 'Bolt Ø', mm: bolt, min: 3, max: 30 },
    { key: 'perSide', label: 'Bolts per side', mm: perSide, min: 1, max: 20 },
  ]
}

export const techniqueSpec = (t: Technique) => TECHNIQUES.find((s) => s.id === t)!

export const defaultDims = (t: Technique): Record<string, number> => Object.fromEntries(techniqueSpec(t).dims.map((d) => [d.key, d.mm]))

/** One kind of part to make. `kind` and `index` name the primitive family it comes from. */
export interface PartType {
  /** File-safe: `strut-B`, `panel-P2`, `hub-H1`. */
  id: string
  kind: 'strut' | 'panel' | 'hub'
  index: number
  label: string
  /** What it is: `Tube`, `Panel`, `Plate`. */
  name: string
  qty: number
  /** Its key sizes, in one line. */
  spec: string
  facts: Facts
  /** Drawing extent at 1:1, in dome units. */
  size: { w: number; h: number }
  /**
   * Draw it at `k` output units per dome unit. `exact` (the 1:1 sheet) draws
   * every size true; otherwise thin features are widened to stay visible.
   */
  draw: (d: Drawing, k: number, th: number, exact: boolean) => void
}

export interface Hardware {
  label: string
  spec: string
  qty: number
}

export type Material = 'wood' | 'sheet' | 'steel' | 'bolt'

/** A part, placed. `part` indexes `Build.parts`; hardware has none. */
export interface PlacedSolid {
  part: number | null
  kind: 'strut' | 'panel' | 'hub' | null
  index: number
  name: string
  /** Parts that move together in an exploded view: a strut with its ends, a hub with its fins. */
  group: string
  /** What it is made of, for the model's material look. */
  material: Material
  /** Extra outward lift in an exploded view, for layers: sheathing over its frame. */
  lift?: number
  /** The strut type whose colour it takes in the model, when not its part's: a frame beam on its edge. */
  tint?: number
  solid: Solid
}

export interface Build {
  technique: Technique
  dims: Record<string, number>
  /** The dimensions with their names, for notes: [label, mm]. */
  dimRows: [string, number][]
  unit: LengthUnit
  parts: PartType[]
  hardware: Hardware[]
  solids: PlacedSolid[]
  warnings: string[]
}

/* ---------------------------------------------------------------- */
/*  Small sizes and words                                            */
/* ---------------------------------------------------------------- */

/** A small size given in mm, written in mm (metric) or inches (imperial). */
const smallText = (mm: number, unit: LengthUnit) => (imperialUnit(unit) ? `${(mm / 25.4).toFixed(3)} in` : `${mm.toFixed(1)} mm`)

/** Round a bolt length up to the next 5 mm (or quarter inch). */
const boltLength = (mm: number, unit: LengthUnit) => (imperialUnit(unit) ? Math.ceil(mm / 6.35) * 6.35 : Math.ceil(mm / 5) * 5)

const P2n = ([x, y]: P2): P2 => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

/* ---------------------------------------------------------------- */
/*  Nodes: where each strut leaves, in the node's own plane          */
/* ---------------------------------------------------------------- */

interface Arm {
  strut: number
  other: number
  /** Unit direction toward the other end, in the node's plane. */
  t: Vec3
  /** Angle of `t` around the node normal, radians, from the first arm. */
  angle: number
}

interface Node {
  p: Vec3
  /** Outward normal of the node's plane: always the sphere radius, cut points included. */
  n: Vec3
  arms: Arm[]
}

function tangentToward(p: Vec3, q: Vec3, n: Vec3): Vec3 {
  const d = normalize(sub(q, p))
  const t = sub(d, scale(n, dot(d, n)))
  return length(t) < 1e-9 ? frameAt(p, n, [1, 0, 0]).u : normalize(t)
}

function nodesOf(dome: Dome): Node[] {
  const R = dome.params.radius
  const nodes: Node[] = dome.vertices.map((v) => ({ p: scale(v, R), n: normalize(v), arms: [] }))
  dome.struts.forEach((s, si) => {
    for (const [a, b] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      nodes[a].arms.push({ strut: si, other: b, t: tangentToward(nodes[a].p, nodes[b].p, nodes[a].n), angle: 0 })
    }
  })
  for (const node of nodes) {
    if (!node.arms.length) continue
    const f = frameAt(node.p, node.n, node.arms[0].t)
    for (const a of node.arms) a.angle = (Math.atan2(dot(a.t, f.v), dot(a.t, f.u)) + Math.PI * 2) % (Math.PI * 2)
    node.arms.sort((a, b) => a.angle - b.angle)
  }
  return nodes
}

/** Angle between a strut and its node's plane, degrees: how far its end is bent. */
const bendAt = (node: Node, other: Vec3) => (Math.asin(Math.min(1, Math.abs(dot(normalize(sub(other, node.p)), node.n)))) * 180) / Math.PI

/* ---------------------------------------------------------------- */
/*  Tube struts with flattened, bent ends                            */
/* ---------------------------------------------------------------- */

interface TubeDims {
  od: number
  wall: number
  flat: number
  margin: number
  hole: number
}

/** Where one end's tab lies: its hole, the direction it points, its plane, and its offset along the plane normal. */
interface TubeEnd {
  hole: Vec3
  t: Vec3
  n: Vec3
  off: number
}

const flatWidth = (d: TubeDims) => (Math.PI * (d.od - d.wall)) / 2
const flatThickness = (d: TubeDims) => 2 * d.wall

/** The bend point: the tab's far end, where the round tube starts. */
const bendPoint = (e: TubeEnd, d: TubeDims) => add(add(e.hole, scale(e.t, d.flat - d.margin)), scale(e.n, e.off))

/** A tube strut as three solids (two tabs, the tube), and its developed sizes. */
function tubeStrut(ea: TubeEnd, eb: TubeEnd, d: TubeDims) {
  const ba = bendPoint(ea, d)
  const bb = bendPoint(eb, d)
  const straight = distance(ba, bb)
  const axis = normalize(sub(bb, ba))
  const tab = (e: TubeEnd): Solid => {
    const f = { o: add(e.hole, scale(e.n, e.off)), u: e.t, v: cross(e.n, e.t), n: e.n }
    const w = flatWidth(d) / 2
    const outline: P2[] = [
      [-d.margin, -w],
      [d.flat - d.margin, -w],
      [d.flat - d.margin, w],
      [-d.margin, w],
    ]
    return prism(f, outline, [circle2([0, 0], d.hole / 2, 16)], -flatThickness(d) / 2, flatThickness(d) / 2)
  }
  const bend = (e: TubeEnd, dir: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(e.t, dir)))) * 180) / Math.PI
  return {
    solids: [tab(ea), cylinder(ba, bb, d.od / 2, 16), tab(eb)],
    straight,
    bends: [bend(ea, axis), bend(eb, scale(axis, -1))] as [number, number],
  }
}

/** The tube laid flat (developed), x along it: flattened ends, holes, bend lines, sizes. */
function drawTube(d: Drawing, label: string, L: number, td: TubeDims, bends: [number, number], k: number, th: number, exact: boolean, unit: LengthUnit, mm: number) {
  const len = L * k
  const flat = td.flat * mm * k
  const margin = td.margin * mm * k
  // Widths true at full size; on a page, widened so the ends stay readable.
  const grow = exact ? 1 : Math.max(1, (th * 1.6) / (td.od * mm * k))
  const r = (td.od * mm * k * grow) / 2
  const w = (flatWidth(td) * mm * k * grow) / 2
  const hole = (td.hole * mm * k * Math.min(grow, 2.5)) / 2
  d.poly('outline', [
    [0, -w], [flat, -w], [flat, -r], [len - flat, -r], [len - flat, -w], [len, -w],
    [len, w], [len - flat, w], [len - flat, r], [flat, r], [flat, w], [0, w],
  ])
  d.circle('outline', [margin, 0], hole)
  d.circle('outline', [len - margin, 0], hole)
  d.line('marks', [flat, -w - th * 0.6], [flat, w + th * 0.6], { dash: true })
  d.line('marks', [len - flat, -w - th * 0.6], [len - flat, w + th * 0.6], { dash: true })
  d.text([flat + th * 0.5, w + th * 1.9], `bend ${deg(bends[0])}`, th * 0.85, { tone: 'accent' })
  d.text([len - flat - th * 0.5, w + th * 1.9], `bend ${deg(bends[1])}`, th * 0.85, { anchor: 'end', tone: 'accent' })
  // Overall length above, hole to hole below.
  const dim = (x0: number, x1: number, y: number, text: string, below: boolean) => {
    const tick = th * 0.5
    d.line('marks', [x0, y], [x1, y])
    d.line('marks', [x0 - tick, y + tick], [x0 + tick, y - tick])
    d.line('marks', [x1 - tick, y + tick], [x1 + tick, y - tick])
    d.text([(x0 + x1) / 2, below ? y + th * 1.6 : y - th * 0.6], text, th, { anchor: 'middle', weight: 700 })
  }
  dim(0, len, -w - th * 2.4, `cut ${smallText(L / mm, unit)}`, false)
  dim(margin, len - margin, w + th * 4.2, `holes ${smallText((L - 2 * td.margin * mm) / mm, unit)}`, true)
  d.text([len / 2, 0], label, th * 1.1, { anchor: 'middle', middle: true, weight: 700 })
  if (!exact) endDetail(d, td, bends[0], [0, w + th * 9], Math.min(len * 0.45, th * 34), th, unit)
}

/** One end, enlarged: the flat, the hole, the bend line and their sizes. Not to scale with the rest. */
function endDetail(d: Drawing, td: TubeDims, bend: number, at: P2, width: number, th: number, unit: LengthUnit) {
  const show = td.flat * 1.8
  const k = width / show
  const [x0, y0] = at
  const w = (flatWidth(td) * k) / 2
  const r = (td.od * k) / 2
  const flat = td.flat * k
  const yc = y0 + w + th * 3
  d.text([x0, y0 + th], `End detail, enlarged`, th * 0.9, { weight: 700 })
  d.poly('outline', [[x0 + width, yc - r], [x0 + flat, yc - r], [x0 + flat, yc - w], [x0, yc - w], [x0, yc + w], [x0 + flat, yc + w], [x0 + flat, yc + r], [x0 + width, yc + r]], false)
  d.line('marks', [x0 + width, yc - r], [x0 + width, yc + r], { dash: true })
  d.circle('outline', [x0 + td.margin * k, yc], (td.hole / 2) * k)
  d.line('marks', [x0 + flat, yc - w - th * 0.8], [x0 + flat, yc + w + th * 0.8], { dash: true })
  d.text([x0 + flat + th * 0.5, yc - w - th * 0.2], `bend ${deg(bend)} here`, th * 0.85, { tone: 'accent' })
  const dim = (a: number, b: number, y: number, text: string) => {
    const tick = th * 0.4
    d.line('marks', [a, y], [b, y])
    d.line('marks', [a - tick, y + tick], [a + tick, y - tick])
    d.line('marks', [b - tick, y + tick], [b + tick, y - tick])
    d.text([(a + b) / 2, y + th * 1.5], text, th * 0.85, { anchor: 'middle' })
  }
  dim(x0, x0 + flat, yc + w + th * 1.6, `flat ${smallText(td.flat, unit)}`)
  dim(x0, x0 + td.margin * k, yc + w + th * 4.4, `hole ${smallText(td.margin, unit)}`)
  d.text([x0 + width + th, yc - w * 0.4], `flat width ≈ ${smallText(flatWidth(td), unit)}`, th * 0.85, { tone: 'muted' })
  d.text([x0 + width + th, yc + w * 0.4 + th * 0.6], `hole Ø ${smallText(td.hole, unit)}`, th * 0.85, { tone: 'muted' })
}

/* ---------------------------------------------------------------- */
/*  The techniques                                                   */
/* ---------------------------------------------------------------- */

export function buildConstruction(dome: Dome, technique: Technique, dimsIn: Record<string, number>, unit: LengthUnit): Build | null {
  if (technique === 'primitive') return null
  const dims = { ...defaultDims(technique), ...dimsIn }
  const mm = 1 / TO_MM[unit]
  const out: Build = { technique, dims, dimRows: techniqueSpec(technique).dims.map((d) => [d.label, dims[d.key]]), unit, parts: [], hardware: [], solids: [], warnings: [] }
  if (technique === 'panels') panels(dome, dims, unit, mm, out)
  else if (technique === 'mitre1') singles(dome, dims, unit, mm, out)
  else if (technique === 'frames' || technique === 'mitre2') frames(dome, dims, unit, mm, out, technique === 'frames')
  else if (technique === 'timber') timber(dome, dims, unit, mm, out)
  else tubes(dome, technique, dims, unit, mm, out)
  return out
}

/** Plane `n · x = d`. */
interface Plane {
  n: Vec3
  d: number
}

/** The point on three planes, or null when two are parallel. */
function meet(a: Plane, b: Plane, c: Plane): Vec3 | null {
  const bc = cross(b.n, c.n)
  const det = dot(a.n, bc)
  if (Math.abs(det) < 1e-12) return null
  return scale(add(add(scale(bc, a.d), scale(cross(c.n, a.n), b.d)), scale(cross(a.n, b.n), c.d)), 1 / det)
}

/**
 * The plane each panel side is cut on, for a side running a → b
 * counter-clockwise seen from outside: always through the side and the sphere
 * centre, base sides included (how the dome meets the ground is not our
 * concern). Oriented so the panel's inside is `n · x ≥ d`.
 */
function edgePlanes(dome: Dome) {
  const R = dome.params.radius
  return (a: number, b: number): Plane => {
    return { n: normalize(cross(scale(dome.vertices[a], R), scale(dome.vertices[b], R))), d: 0 }
  }
}

const strutKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

/** The outline of `pts` (in a plane with normal `n`) in 2D, seen from outside, its longest side level along the bottom, y down. */
function layFlat(pts: Vec3[], n: Vec3, others: Vec3[][] = []) {
  const c = scale(pts.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3), 1 / pts.length)
  const fr = frameAt(c, n, sub(pts[1], pts[0]))
  const to2 = (p: Vec3): P2 => [dot(sub(p, c), fr.u), dot(sub(p, c), fr.v)]
  const o2 = pts.map(to2)
  const m = o2.length
  const sideLen = (i: number) => Math.hypot(o2[(i + 1) % m][0] - o2[i][0], o2[(i + 1) % m][1] - o2[i][1])
  const longest = o2.reduce((b, _, i) => (sideLen(i) > sideLen(b) ? i : b), 0)
  const a0 = o2[longest]
  const a1 = o2[(longest + 1) % m]
  const rot = -Math.atan2(a1[1] - a0[1], a1[0] - a0[0])
  const turn = ([x, y]: P2): P2 => {
    const [cx, cy] = [x - a0[0], y - a0[1]]
    return [cx * Math.cos(rot) - cy * Math.sin(rot), -(cx * Math.sin(rot) + cy * Math.cos(rot))]
  }
  return { outline: o2.map(turn), others: others.map((l) => l.map(to2).map(turn)) }
}

const angleBetween = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180) / Math.PI

/** Blade tilt of a cut on plane normal `m`, for a board whose face has normal `n`: 0 when the cut is square to the face. */
const tiltFrom = (m: Vec3, n: Vec3) => (Math.asin(Math.min(1, Math.abs(dot(normalize(m), normalize(n))))) * 180) / Math.PI

function panels(dome: Dome, dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build) {
  const T = dims.thickness * mm
  const R = dome.params.radius
  const P = dome.vertices.map((v) => scale(v, R))
  const strutOf = new Map(dome.struts.map((s) => [strutKey(s.a, s.b), s.type]))
  const edgePlane = edgePlanes(dome)
  let inverted = false
  const sample = new Map<number, { outer: Vec3[]; inner: Vec3[]; nf: Vec3; sides: { strut: string; tilt: number }[] }>()
  dome.faces.forEach((f, fi) => {
    const outer = f.v.map((v) => P[v])
    const m = outer.length
    const nf = normalize(cross(sub(outer[1], outer[0]), sub(outer[2], outer[0])))
    const face: Plane = { n: nf, d: dot(nf, outer[0]) - T }
    const planes = f.v.map((v, i) => edgePlane(v, f.v[(i + 1) % m]))
    const inner = outer.map((o, i) => meet(face, planes[(i + m - 1) % m], planes[i]) ?? sub(o, scale(nf, T)))
    // Too thick for the panel: the inner face turns inside out.
    // (or, for a sheet as thick as the dome is deep, passes the centre).
    const flip = face.d <= 0 || inner.some((p, i) => dot(cross(sub(inner[(i + 1) % m], p), sub(inner[(i + m - 1) % m], p)), nf) <= 0)
    if (flip) inverted = true
    out.solids.push({ part: null, material: 'sheet', kind: 'panel', index: f.type, name: `${dome.faceTypes[f.type].label}-${fi + 1}`, group: `f${fi}`, solid: slab(outer, inner) })
    if (!sample.has(f.type)) {
      sample.set(f.type, {
        outer,
        inner,
        nf,
        sides: f.v.map((v, i) => {
          const w = f.v[(i + 1) % m]
          const label = dome.strutTypes[strutOf.get(v < w ? `${v}-${w}` : `${w}-${v}`) ?? 0]?.label ?? '?'
          return { strut: label, tilt: (Math.asin(Math.min(1, Math.abs(dot(nf, planes[i].n)))) * 180) / Math.PI }
        }),
      })
    }
  })
  if (inverted) out.warnings.push(`The sheet is too thick for the smallest panels: their inner face collapses. Use thinner sheet or a larger dome.`)

  for (const t of dome.faceTypes) {
    const s = sample.get(t.index)
    if (!t.count || !s) continue
    // Both outlines in the panel's plane, seen from outside, longest outer side level at the bottom.
    const c = scale(s.outer.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3), 1 / s.outer.length)
    const fr = frameAt(c, s.nf, sub(s.outer[1], s.outer[0]))
    const to2 = (p: Vec3): P2 => [dot(sub(p, c), fr.u), dot(sub(p, c), fr.v)]
    let o2 = s.outer.map(to2)
    let i2 = s.inner.map(to2)
    const m = o2.length
    const sideLen = (pts: P2[], i: number) => Math.hypot(pts[(i + 1) % m][0] - pts[i][0], pts[(i + 1) % m][1] - pts[i][1])
    const longest = o2.reduce((b, _, i) => (sideLen(o2, i) > sideLen(o2, b) ? i : b), 0)
    const a0 = o2[longest]
    const a1 = o2[(longest + 1) % m]
    const rot = -Math.atan2(a1[1] - a0[1], a1[0] - a0[0])
    const turn = ([x, y]: P2): P2 => {
      const [cx, cy] = [x - a0[0], y - a0[1]]
      return [cx * Math.cos(rot) - cy * Math.sin(rot), -(cx * Math.sin(rot) + cy * Math.cos(rot))]
    }
    o2 = o2.map(turn)
    i2 = i2.map(turn)
    const xs = o2.map((p) => p[0])
    const ys = o2.map((p) => p[1])
    const tilts = s.sides.map((x) => x.tilt)
    const part = out.parts.length
    out.parts.push({
      id: `panel-${fileSafe(t.label)}`,
      kind: 'panel',
      index: t.index,
      label: t.label,
      name: 'Panel',
      qty: t.count,
      spec: `${smallText(dims.thickness, unit)} sheet · edges ${deg(Math.min(...tilts))}${Math.max(...tilts) - Math.min(...tilts) > 0.01 ? `–${deg(Math.max(...tilts))}` : ''}`,
      facts: {
        title: t.label,
        kind: `Panel · ${m} sides · ${smallText(dims.thickness, unit)} sheet`,
        rows: [
          ['Quantity', String(t.count)],
          ['Outer face area', `${t.area.toFixed(4)} ${unit}²`],
          ['Edges', 'cut toward the dome centre'],
          ['Bevel', 'blade tilt from square'],
          ['Outer face', 'solid line, seen from outside'],
          ['Inner face', 'dashed, smaller'],
        ],
        table: {
          head: ['Side', 'Strut', 'Outer', 'Inner', 'Bevel'],
          rows: s.sides.map((x, i) => [String(i + 1), x.strut, smallText(sideLen(o2, i) / mm, unit), smallText(sideLen(i2, i) / mm, unit), deg(x.tilt)]),
        },
      },
      size: { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      draw: (d, k, th) => {
        const O = o2.map(([x, y]): P2 => [x * k, y * k])
        const I = i2.map(([x, y]): P2 => [x * k, y * k])
        d.poly('outline', O)
        d.poly('marks', I, true, { dash: true })
        const cx = O.reduce((a, p) => a + p[0], 0) / m
        const cy = O.reduce((a, p) => a + p[1], 0) / m
        d.text([cx, cy], t.label, th * 1.8, { anchor: 'middle', middle: true, weight: 700 })
        O.forEach((p, i) => {
          const q = O[(i + 1) % m]
          const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
          const L = Math.hypot(dx, dy)
          const mid: P2 = [(p[0] + q[0]) / 2 + (-dy / L) * th * 1.3, (p[1] + q[1]) / 2 + (dx / L) * th * 1.3]
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI
          if (ang > 90 || ang < -90) ang += 180
          d.text(mid, `${s.sides[i].strut} · ${smallText(L / k / mm, unit)} · bevel ${deg(s.sides[i].tilt)}`, th * 0.85, { anchor: 'middle', middle: true, rotate: ang, tone: 'muted' })
        })
      },
    })
    for (const ps of out.solids) if (ps.kind === 'panel' && ps.index === t.index) ps.part = part
  }
}

function tubes(dome: Dome, technique: 'pipe' | 'plates', dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build) {
  const nodes = nodesOf(dome)
  const td: TubeDims = { od: dims.od * mm, wall: dims.wall * mm, flat: dims.flat * mm, margin: dims.margin * mm, hole: (dims.bolt + 1) * mm }
  const tdMm: TubeDims = { od: dims.od, wall: dims.wall, flat: dims.flat, margin: dims.margin, hole: dims.bolt + 1 }
  const tf = flatThickness(td)
  const plates = technique === 'plates'
  const plate = (dims.plate ?? 0) * mm
  const circle = (dims.circle ?? 0) * mm

  if (dims.flat - dims.margin < dims.bolt) out.warnings.push('The flattened length barely clears the hole: make it longer, or the hole closer to the end.')
  if (dims.margin < dims.bolt) out.warnings.push('The hole is closer to the tube end than one bolt diameter: the end may tear out.')
  if (plates && dims.flat - dims.margin <= dims.edge) out.warnings.push('The flattened ends are shorter than the plate edge: tubes would bend under the plate. Lengthen the flats or trim the plate edge.')

  // Each end of each strut: its tab, in its node's plane.
  const endOf = (node: number, strut: number): TubeEnd => {
    const nd = nodes[node]
    const k = nd.arms.findIndex((a) => a.strut === strut)
    const arm = nd.arms[k]
    if (plates) return { hole: add(nd.p, scale(arm.t, circle)), t: arm.t, n: nd.n, off: -(plate / 2 + tf / 2) }
    // One bolt: the tabs stack on it, centred on the node, in the order the arms go round.
    return { hole: nd.p, t: arm.t, n: nd.n, off: (k - (nd.arms.length - 1) / 2) * tf }
  }

  const sample = new Map<number, { straight: number; bends: [number, number] }>()
  const spread = new Map<number, number>()
  dome.struts.forEach((s, si) => {
    const r = tubeStrut(endOf(s.a, si), endOf(s.b, si), td)
    const label = dome.strutTypes[s.type].label
    r.solids.forEach((solid, j) => out.solids.push({ part: null, material: 'steel', kind: 'strut', index: s.type, name: `${label}-${si + 1}${['-end1', '', '-end2'][j]}`, group: `s${si}`, solid }))
    // Sizes per type come from the ends at the middle of their stack: where a
    // tab sits in a stack moves its bend by a fraction of a degree.
    const nominal = plates ? r : tubeStrut({ ...endOf(s.a, si), off: 0 }, { ...endOf(s.b, si), off: 0 }, td)
    const first = sample.get(s.type)
    if (!first) sample.set(s.type, { straight: nominal.straight, bends: [...nominal.bends].sort((a, b) => a - b) as [number, number] })
    else spread.set(s.type, Math.max(spread.get(s.type) ?? 0, Math.abs(first.straight - nominal.straight)))
  })

  for (const t of dome.strutTypes) {
    const s = sample.get(t.index)
    if (!t.count || !s) continue
    const L = 2 * td.flat + s.straight
    const varies = (spread.get(t.index) ?? 0) / mm
    const part = out.parts.length
    out.parts.push({
      id: `strut-${fileSafe(t.label)}`,
      kind: 'strut',
      index: t.index,
      label: t.label,
      name: 'Tube',
      qty: t.count,
      spec: `cut ${smallText(L / mm, unit)} · holes ${smallText((L - 2 * td.margin) / mm, unit)} · bends ${deg(s.bends[0])}${Math.abs(s.bends[1] - s.bends[0]) > 0.01 ? ` / ${deg(s.bends[1])}` : ''}`,
      facts: {
        title: t.label,
        kind: `Tube · ${smallText(dims.od, unit)} × ${smallText(dims.wall, unit)} wall${t.kind === 'cut' ? ` · cut piece of ${dome.strutTypes[t.parent!].label}` : t.kind === 'ring' ? ' · base ring' : ''}`,
        rows: [
          ['Quantity', String(t.count)],
          ['Cut length', smallText(L / mm, unit)],
          ['Hole to hole', smallText((L - 2 * td.margin) / mm, unit)],
          ['Node to node', smallText(t.length / mm, unit)],
          ['Flatten', `${smallText(dims.flat, unit)} at each end`],
          ['Hole', `Ø ${smallText(dims.bolt + 1, unit)}, ${smallText(dims.margin, unit)} from the end`],
          ['Bend, end 1', `${deg(s.bends[0])} at the end of the flat`],
          ['Bend, end 2', `${deg(s.bends[1])} at the end of the flat`],
          ['Note', plates ? 'flats bolt under the plate' : 'flats stack on the node bolt; bends for mid-stack'],
          ...(varies > 0.05 ? ([['Varies', `up to ${smallText(varies, unit)} between nodes`]] as [string, string][]) : []),
        ],
      },
      size: { w: L, h: Math.max(flatWidth(td), L * 0.04) },
      draw: (d, k, th, exact) => drawTube(d, t.label, L, tdMm, s.bends, k, th, exact, unit, mm),
    })
    for (const ps of out.solids) if (ps.kind === 'strut' && ps.index === t.index) ps.part = part
  }

  // Bolts, and for plate hubs the plates.
  const bolts = new Map<string, number>()
  const addBolts = (lenMm: number, qty: number) => {
    const L = boltLength(lenMm, unit)
    const key = smallText(L, unit)
    bolts.set(key, (bolts.get(key) ?? 0) + qty)
  }
  const plateSample = new Map<number, { holes: P2[]; labels: string[]; bends: number[] }>()
  nodes.forEach((nd, i) => {
    if (!nd.arms.length) return
    const type = dome.hubs[i].type
    const label = dome.hubTypes[type].label
    if (!plates) {
      const stack = nd.arms.length * tf
      addBolts(stack / mm + 2.5 * dims.bolt, 1)
      const ext = stack / 2 + dims.bolt * mm
      out.solids.push({ part: null, material: 'bolt', kind: null, index: -1, name: `bolt-${label}-${i + 1}`, group: `n${i}`, solid: cylinder(sub(nd.p, scale(nd.n, ext)), add(nd.p, scale(nd.n, ext)), (dims.bolt * mm) / 2, 10) })
      return
    }
    const f = frameAt(nd.p, nd.n, nd.arms[0].t)
    const holes: P2[] = nd.arms.map((a) => [Math.cos(a.angle) * circle, Math.sin(a.angle) * circle])
    const edge = dims.edge * mm
    const outline = hull([...circle2([0, 0], edge, 32), ...holes.flatMap((h) => circle2(h, edge, 32))])
    out.solids.push({ part: null, material: 'steel', kind: 'hub', index: type, name: `${label}-${i + 1}`, group: `n${i}`, solid: prism(f, outline, holes.map((h) => circle2(h, td.hole / 2, 20)), -plate / 2, plate / 2) })
    addBolts(dims.plate + 2 * dims.wall + 2.5 * dims.bolt, nd.arms.length)
    for (const a of nd.arms) {
      const h = add(nd.p, scale(a.t, circle))
      out.solids.push({
        part: null, material: 'bolt',
        kind: null,
        index: -1,
        name: `bolt-${label}-${i + 1}`,
        group: `n${i}`,
        solid: cylinder(sub(h, scale(nd.n, plate / 2 + tf + dims.bolt * 0.8 * mm)), add(h, scale(nd.n, plate / 2 + dims.bolt * 0.8 * mm)), (dims.bolt * mm) / 2, 10),
      })
    }
    if (!plateSample.has(type)) {
      plateSample.set(type, {
        holes,
        labels: nd.arms.map((a) => dome.strutTypes[dome.struts[a.strut].type].label),
        bends: nd.arms.map((a) => bendAt(nd, nodes[a.other].p)),
      })
    }
  })

  if (plates) {
    const crowded: { label: string; gap: number }[] = []
    for (const t of dome.hubTypes) {
      const s = plateSample.get(t.index)
      if (!s) continue
      const edge = dims.edge * mm
      const outline = hull([...circle2([0, 0], edge, 48), ...s.holes.flatMap((h) => circle2(h, edge, 48))])
      // Seen from outside, y down.
      const seen = (p: P2): P2 => [p[0], -p[1]]
      const xs = outline.map((p) => p[0])
      const ys = outline.map((p) => p[1])
      const gaps = s.holes.map((h, i) => distance([...h, 0], [...s.holes[(i + 1) % s.holes.length], 0]))
      const tight = s.holes.length > 1 ? Math.min(...gaps) / mm : Infinity
      if (tight < 2.5 * dims.bolt) crowded.push({ label: t.label, gap: tight })
      const part = out.parts.length
      const across = (Math.max(...xs) - Math.min(...xs)) / mm
      out.parts.push({
        id: `hub-${fileSafe(t.label)}`,
        kind: 'hub',
        index: t.index,
        label: t.label,
        name: 'Plate',
        qty: t.count,
        spec: `${s.holes.length} holes · ${smallText(across, unit)} across · ${smallText(dims.plate, unit)} plate`,
        facts: {
          title: t.label,
          kind: `Plate · ${s.holes.length} holes${t.kind === 'cut' ? ' · on the base plane' : ''}${t.mirrorOf != null ? ` · mirror of ${dome.hubTypes[t.mirrorOf].label}` : ''}`,
          rows: [
            ['Quantity', String(t.count)],
            ['Thickness', smallText(dims.plate, unit)],
            ['Holes', `Ø ${smallText(dims.bolt + 1, unit)} at ${smallText(dims.circle, unit)} from centre`],
            ['Size', `${smallText(across, unit)} × ${smallText((Math.max(...ys) - Math.min(...ys)) / mm, unit)}`],
            ['Drawn', 'seen from outside; tubes bolt underneath'],
          ],
          table: {
            head: ['Hole', 'Strut', 'Bend', 'Turn'],
            rows: s.holes.map((h, i) => {
              const nx = s.holes[(i + 1) % s.holes.length]
              const turn = ((Math.atan2(nx[1], nx[0]) - Math.atan2(h[1], h[0]) + Math.PI * 4) % (Math.PI * 2)) * (180 / Math.PI)
              return [String(i + 1), s.labels[i], deg(s.bends[i]), s.holes.length > 1 ? deg(turn || 360) : '—']
            }),
          },
        },
        size: { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
        draw: (d, k, th) => {
          const K = (p: P2): P2 => seen([p[0] * k, p[1] * k])
          d.poly('outline', outline.map(K))
          const c = th * 0.8
          d.line('marks', [-c, 0], [c, 0])
          d.line('marks', [0, -c], [0, c])
          s.holes.forEach((h, i) => {
            const p = K(h)
            d.circle('outline', p, (td.hole / 2) * k)
            d.line('marks', [0, 0], p, { dash: true })
            const dir = P2n(p)
            // Clear of the plate: further out where the label's width lies across the direction.
            const half = Math.max(`${i + 1} · ${s.labels[i]}`.length, `bend ${deg(s.bends[i])}`.length * 0.8) * th * 0.31
            const off = edge * k + th * 1.2 + Math.abs(dir[0]) * half + Math.abs(dir[1]) * th * 1.4
            const lab: P2 = [p[0] + dir[0] * off, p[1] + dir[1] * off]
            d.text([lab[0], lab[1] - th * 0.5], `${i + 1} · ${s.labels[i]}`, th, { anchor: 'middle', middle: true, weight: 700 })
            d.text([lab[0], lab[1] + th * 1.2], `bend ${deg(s.bends[i])}`, th * 0.8, { anchor: 'middle', middle: true, tone: 'accent' })
          })
          d.text([0, th * 2.2], t.label, th * 1.1, { anchor: 'middle', middle: true, weight: 700 })
        },
      })
      for (const ps of out.solids) if (ps.kind === 'hub' && ps.index === t.index) ps.part = part
    }
    if (crowded.length) {
      const worst = Math.min(...crowded.map((c) => c.gap))
      out.warnings.push(
        `Holes crowd on plate${crowded.length > 1 ? 's' : ''} ${crowded.map((c) => c.label).join(', ')}: as close as ${smallText(worst, unit)}, centre to centre. Two struts leave in nearly the same direction there; increase the hole distance from centre, or plan those holes by hand.`,
      )
    }
  }

  for (const [len, qty] of [...bolts.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))) {
    out.hardware.push({ label: 'Bolt', spec: `Ø ${smallText(dims.bolt, unit)} × ${len}, nut, 2 washers`, qty })
  }
}

/** The parts and hardware as a table. */
export function partsCsv(build: Build): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [['part', 'what', 'qty', 'spec']]
  for (const p of build.parts) rows.push([p.label, p.name, String(p.qty), p.spec])
  for (const h of build.hardware) rows.push([h.label, 'hardware', String(h.qty), h.spec])
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n'
}

/** Every part, placed, as one STEP file in millimetres. */
export function buildStep(build: Build, name: string): string {
  const parts = build.solids.map((s) => ({ name: s.part != null ? `${build.parts[s.part].name} ${s.name}` : s.name, solid: s.solid }))
  return toStep(parts, { name, toMm: TO_MM[build.unit] })
}

/* ---------------------------------------------------------------- */
/*  Frame panels: a timber frame per face, sheathed, bolted together */
/* ---------------------------------------------------------------- */

/**
 * Timber triangle frames under decking, a frame per face: each edge is two
 * beams side by side, one from each frame. Corners mitred (compound), or
 * butted in a pinwheel: each beam runs through its start corner, flush with
 * the outside, and the next one butts square into its inner side.
 */
function frames(dome: Dome, dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build, butt: boolean) {
  const karma = butt
  const ts = dims.sheath * mm
  const bw = dims.width * mm
  const bd = dims.depth * mm
  const R = dome.params.radius
  const P = dome.vertices.map((v) => scale(v, R))
  const edgePlane = edgePlanes(dome)
  const strutOf = new Map(dome.struts.map((s) => [strutKey(s.a, s.b), s.type]))
  const facesOf = new Map<string, number[]>()
  dome.faces.forEach((f, fi) => f.v.forEach((v, i) => {
    const k = strutKey(v, f.v[(i + 1) % f.v.length])
    facesOf.set(k, [...(facesOf.get(k) ?? []), fi])
  }))

  type Member = BeamCut
  const sample = new Map<number, { top: Vec3[]; quads: Vec3[][]; nf: Vec3; members: Member[] }>()
  const sheetSample = new Map<number, { outer: Vec3[]; nf: Vec3 }>()
  const lip = new Map<number, number>()
  let crossed = false
  let bolts = 0
  let beamCount = 0
  let nails = 0

  dome.faces.forEach((f, fi) => {
    const label = dome.faceTypes[f.type].label
    const outer = f.v.map((v) => P[v])
    const m = outer.length
    const nf = normalize(cross(sub(outer[1], outer[0]), sub(outer[2], outer[0])))
    const d0 = dot(nf, outer[0])
    const E = f.v.map((v, i) => edgePlane(v, f.v[(i + 1) % m]))
    const at = (depth: number) => outer.map((o, i) => meet({ n: nf, d: d0 - depth }, E[(i + m - 1) % m], E[i]) ?? sub(o, scale(nf, depth)))
    // The sheathing, then the frame under it.
    if (ts > 0) out.solids.push({ part: null, material: 'sheet', kind: 'panel', index: f.type, name: `${label}-${fi + 1}-sheathing`, group: `f${fi}`, lift: 1, solid: slab(outer, at(ts)) })
    const T = at(ts)
    const B = at(ts + bd)
    const top: Plane = { n: nf, d: d0 - ts }
    const bottom: Plane = { n: nf, d: d0 - ts - bd }
    // Each beam's inner side is square to the face, `bw` in from the outer edge.
    const Ein = T.map((t, i): Plane => {
      const q = normalize(cross(nf, sub(T[(i + 1) % m], t)))
      return { n: q, d: dot(q, t) + bw }
    })
    const Q = T.map((t, i) => meet(top, Ein[(i + m - 1) % m], Ein[i]) ?? t)
    // Mitre at each corner: through the outer corner line and the inner corner, so both beams' bevelled sides meet.
    const M = T.map((t, i): Plane => {
      const n = normalize(cross(sub(B[i], t), sub(Q[i], t)))
      return { n, d: dot(n, t) }
    })
    // The plane each beam's ends are cut on.
    const startOf = (i: number) => (butt ? E[(i + m - 1) % m] : M[i])
    const endOf = (i: number) => (butt ? Ein[(i + 1) % m] : M[(i + 1) % m])
    // A mitre can hold the outer corner line or the square inner one, not both: at the bottom of the
    // inner corner one beam stands past the other.
    if (!butt) M.forEach((pl, i) => {
      const p = meet(bottom, Ein[i], pl)
      const q = meet(bottom, Ein[(i + m - 1) % m], pl)
      if (p && q) lip.set(f.type, Math.max(lip.get(f.type) ?? 0, distance(p, q)))
    })
    if (Q.some((q, i) => dot(cross(sub(Q[(i + 1) % m], q), sub(Q[(i + m - 1) % m], q)), nf) <= 0)) crossed = true
    const members: Member[] = []
    const quads: Vec3[][] = []
    beamCount += m
    if (karma && ts > 0) nails += outer.reduce((n, o, i) => n + Math.ceil(distance(o, outer[(i + 1) % m]) / (101.6 * mm)), 0)
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      const S = startOf(i)
      const F = endOf(i)
      const corner = (h: Plane, side: Plane, end: Plane, or: Vec3) => meet(h, side, end) ?? or
      const tp = [corner(top, E[i], S, T[i]), corner(top, E[i], F, T[j]), corner(top, Ein[i], F, Q[j]), corner(top, Ein[i], S, Q[i])]
      const bt = [corner(bottom, E[i], S, B[i]), corner(bottom, E[i], F, B[j]), corner(bottom, Ein[i], F, Q[j]), corner(bottom, Ein[i], S, Q[i])]
      const strut = dome.strutTypes[strutOf.get(strutKey(f.v[i], f.v[j])) ?? 0]?.label ?? '?'
      out.solids.push({ part: null, material: 'wood', kind: 'panel', index: f.type, name: `${label}-${fi + 1}-beam${i + 1}`, group: `f${fi}`, tint: strutOf.get(strutKey(f.v[i], f.v[j])), solid: slab(tp, bt) })
      quads.push(tp)
      const edge = sub(T[j], T[i])
      // In the beam's own frame: x along the outer edge, y in the face toward the inside, z down from the top.
      const xh = normalize(edge)
      const yh = cross(nf, xh)
      const loc = (p: Vec3): Vec3 => [dot(sub(p, T[i]), xh), dot(sub(p, T[i]), yh), -dot(sub(p, T[i]), nf)]
      members.push({
        top: tp.map(loc),
        bottom: bt.map(loc),
        strut,
        length: distance(tp[0], tp[1]),
        inner: distance(tp[3], tp[2]),
        bevel: tiltFrom(E[i].n, nf),
        ends: [Math.abs(90 - angleBetween(edge, sub(tp[3], tp[0]))), Math.abs(90 - angleBetween(scale(edge, -1), sub(tp[2], tp[1])))],
        tilts: [tiltFrom(S.n, nf), tiltFrom(F.n, nf)],
      })
      // Bolts through this beam and its neighbour's, once per shared side.
      const shared = facesOf.get(strutKey(f.v[i], f.v[j]))!
      if (shared.length === 2 && shared[0] === fi) {
        const n = Math.max(1, Math.round(dims.perSide))
        bolts += n
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n
          let x = add(add(T[i], scale(edge, t)), scale(nf, -bd / 2))
          x = sub(x, scale(E[i].n, dot(E[i].n, x) - E[i].d))
          // Through both beams, plus a washer and nut's worth each side.
          const reach = bw + dims.bolt * mm * 0.9
          out.solids.push({ part: null, material: 'bolt', kind: null, index: -1, name: `bolt-${label}-${fi + 1}-${i + 1}-${k + 1}`, group: `e${fi}-${i}`, solid: cylinder(sub(x, scale(E[i].n, reach)), add(x, scale(E[i].n, reach)), (dims.bolt * mm) / 2, 10) })
        }
      }
    }
    if (!sample.has(f.type)) sample.set(f.type, { top: T, quads, nf, members })
    if (!sheetSample.has(f.type)) sheetSample.set(f.type, { outer, nf })
  })
  if (crossed) out.warnings.push('The beams are too wide for the smallest frames: their inner edges cross. Use narrower beams or a larger dome.')

  for (const t of dome.faceTypes) {
    const s = sample.get(t.index)
    if (!t.count || !s) continue
    const flat = layFlat(s.top, s.nf, s.quads)
    const O = flat.outline
    const quads = flat.others
    const m = O.length
    const xs = O.map((p) => p[0])
    const ys = O.map((p) => p[1])
    const beams = beamDetails(s.members, dims, { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, unit, mm)
    const part = out.parts.length
    out.parts.push({
      id: `frame-${fileSafe(t.label)}`,
      kind: 'panel',
      index: t.index,
      label: t.label,
      name: 'Frame',
      qty: t.count,
      spec: `${m} beams ${smallText(dims.width, unit)} × ${smallText(dims.depth, unit)} · ${s.members.map((x) => smallText(x.length / mm, unit).split(' ')[0]).join(' / ')}`,
      facts: {
        title: t.label,
        kind: `Frame · ${m} beams ${smallText(dims.width, unit)} × ${smallText(dims.depth, unit)}`,
        rows: [
          ['Quantity', `${t.count} frames, ${t.count * m} beams`],
          ['Length', 'long point, on the face under the decking'],
          ['Bevel', 'outer side, blade tilt from square'],
          ['Ends', 'mitre in the face · blade tilt'],
          ['Saw', 'decking side down, inner side to the fence'],
          ['Corners', butt ? 'butted: each beam runs through its start corner' : `mitred; inside lip ${smallText((lip.get(t.index) ?? 0) / mm, unit)} max`],
          ['Drawn', 'from outside, decking off; each beam below'],
        ],
        table: {
          head: ['Beam', 'Strut', 'Length', 'Bevel', 'Mitres', 'Tilts'],
          rows: s.members.map((x, i) => [String(i + 1), x.strut, smallText(x.length / mm, unit), `${x.bevel.toFixed(1)}°`, `${x.ends[0].toFixed(1)}/${x.ends[1].toFixed(1)}°`, `${x.tilts[0].toFixed(1)}/${x.tilts[1].toFixed(1)}°`]),
        },
      },
      size: { w: Math.max(Math.max(...xs) - Math.min(...xs), beams.w), h: Math.max(...ys) - Math.min(...ys) + beams.h },
      draw: (d, k, th, exact) => {
        const o = O.map(([x, y]): P2 => [x * k, y * k])
        beams.draw(d, k, th, exact, Math.max(...o.map((p) => p[1])))
        for (const q of quads) d.poly('outline', q.map(([x, y]): P2 => [x * k, y * k]))
        const cx = o.reduce((a, p) => a + p[0], 0) / m
        const cy = o.reduce((a, p) => a + p[1], 0) / m
        d.text([cx, cy], t.label, th * 1.8, { anchor: 'middle', middle: true, weight: 700 })
        o.forEach((p, i) => {
          const q = o[(i + 1) % m]
          const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
          const L = Math.hypot(dx, dy)
          const mid: P2 = [(p[0] + q[0]) / 2 + (-dy / L) * th * 1.3, (p[1] + q[1]) / 2 + (dx / L) * th * 1.3]
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI
          if (ang > 90 || ang < -90) ang += 180
          const mb = s.members[i]
          d.text(mid, `${i + 1} · ${mb.strut} · ${smallText(mb.length / mm, unit)} · bevel ${deg(mb.bevel)}`, th * 0.85, { anchor: 'middle', middle: true, rotate: ang, tone: 'muted' })
        })
      },
    })
    for (const ps of out.solids) if (ps.kind === 'panel' && ps.index === t.index && ps.name.includes('-beam')) ps.part = part
  }

  if (ts > 0) deckingParts(dome, dims, unit, mm, out, sheetSample)
  out.hardware.push({ label: 'Bolt', spec: `Ø ${smallText(dims.bolt, unit)} × ${smallText(boltLength(2 * dims.width + 2.5 * dims.bolt, unit), unit)}, nut, 2 washers`, qty: bolts })
  out.hardware.push({ label: 'Screw', spec: `${karma ? '3″ deck screw' : `${imperialUnit(unit) ? '3″' : '75 mm'} wood screw`}, 2 per beam end, ${butt ? 'through the butt joint' : 'across the mitre'}`, qty: beamCount * 4 })
  if (karma && nails) out.hardware.push({ label: 'Nail', spec: '8d ring-shank, decking edges at 4″, glued', qty: nails })
}

/** The decking, a part type per face type, from one sample of each: outer outline and normal. */
function deckingParts(dome: Dome, dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build, sheetSample: Map<number, { outer: Vec3[]; nf: Vec3 }>) {
  for (const t of dome.faceTypes) {
    const s = sheetSample.get(t.index)
    if (!t.count || !s) continue
    const flat = layFlat(s.outer, s.nf)
    const O = flat.outline
    const m = O.length
    const xs = O.map((p) => p[0])
    const ys = O.map((p) => p[1])
    const sides = O.map((p, i) => Math.hypot(O[(i + 1) % m][0] - p[0], O[(i + 1) % m][1] - p[1]))
    const part = out.parts.length
    out.parts.push({
      id: `panel-${fileSafe(t.label)}`,
      kind: 'panel',
      index: t.index,
      label: t.label,
      name: 'Decking',
      qty: t.count,
      spec: `${smallText(dims.sheath, unit)} · sides ${sides.map((x) => smallText(x / mm, unit).split(' ')[0]).join(' / ')}`,
      facts: {
        title: t.label,
        kind: `Decking · ${smallText(dims.sheath, unit)}`,
        rows: [
          ['Quantity', String(t.count)],
          ['Area', `${t.area.toFixed(4)} ${unit}²`],
          ['Edges', 'cut toward the dome centre, flush with the next panel'],
          ['Drawn', 'outer face, seen from outside'],
        ],
        table: { head: ['Side', 'Length'], rows: sides.map((x, i) => [String(i + 1), smallText(x / mm, unit)]) },
      },
      size: { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      draw: (d, k, th) => {
        const o = O.map(([x, y]): P2 => [x * k, y * k])
        d.poly('outline', o)
        const cx = o.reduce((a, p) => a + p[0], 0) / m
        const cy = o.reduce((a, p) => a + p[1], 0) / m
        d.text([cx, cy], t.label, th * 1.8, { anchor: 'middle', middle: true, weight: 700 })
        o.forEach((p, i) => {
          const q = o[(i + 1) % m]
          const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
          const L = Math.hypot(dx, dy)
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI
          if (ang > 90 || ang < -90) ang += 180
          d.text([(p[0] + q[0]) / 2 + (-dy / L) * th * 1.3, (p[1] + q[1]) / 2 + (dx / L) * th * 1.3], smallText(L / k / mm, unit), th * 0.85, { anchor: 'middle', middle: true, rotate: ang, tone: 'muted' })
        })
      },
    })
    for (const ps of out.solids) if (ps.kind === 'panel' && ps.index === t.index && ps.name.endsWith('-sheathing')) ps.part = part
  }
}

/* ---------------------------------------------------------------- */
/*  Single struts, mitred to a point at every node                   */
/* ---------------------------------------------------------------- */

/**
 * One timber strut per edge, shared by its two faces. Its sides are parallel
 * to the radial plane through the edge; its top is ridged, each half under
 * one panel's decking; at each node its end is cut to a point on the planes
 * halfway to its two neighbours, so all the struts meet around the node axis.
 */
function singles(dome: Dome, dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build) {
  const ts = dims.sheath * mm
  const w = dims.width * mm
  const dep = dims.depth * mm
  const R = dome.params.radius
  const P = dome.vertices.map((v) => scale(v, R))
  const nodes = nodesOf(dome)
  const edgePlane = edgePlanes(dome)
  const facesOf = new Map<string, number[]>()
  const planeOf: { n: Vec3; d: number }[] = []
  const sheetSample = new Map<number, { outer: Vec3[]; nf: Vec3 }>()
  dome.faces.forEach((f, fi) => {
    const outer = f.v.map((v) => P[v])
    const m = outer.length
    const nf = normalize(cross(sub(outer[1], outer[0]), sub(outer[2], outer[0])))
    const d0 = dot(nf, outer[0])
    planeOf.push({ n: nf, d: d0 })
    f.v.forEach((v, i) => {
      const k = strutKey(v, f.v[(i + 1) % m])
      facesOf.set(k, [...(facesOf.get(k) ?? []), fi])
    })
    if (ts > 0) {
      const E = f.v.map((v, i) => edgePlane(v, f.v[(i + 1) % m]))
      const inner = outer.map((o, i) => meet({ n: nf, d: d0 - ts }, E[(i + m - 1) % m], E[i]) ?? sub(o, scale(nf, ts)))
      out.solids.push({ part: null, material: 'sheet', kind: 'panel', index: f.type, name: `${dome.faceTypes[f.type].label}-${fi + 1}-sheathing`, group: `f${fi}`, lift: 1, solid: slab(outer, inner) })
    }
    if (!sheetSample.has(f.type)) sheetSample.set(f.type, { outer, nf })
  })

  /** The planes a strut's end is cut on at node `ni`: halfway to each neighbour, through the node axis. */
  const wedge = (ni: number, strut: number): HalfSpace[] => {
    const node = nodes[ni]
    const n = node.arms.length
    const k = node.arms.findIndex((a) => a.strut === strut)
    const res: HalfSpace[] = []
    for (const l of new Set([(k + 1) % n, (k + n - 1) % n])) {
      if (l === k) continue
      const a = node.arms[k]
      const b = node.arms[l]
      const gap = (((l === (k + 1) % n ? b.angle - a.angle : a.angle - b.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      // An open side (a cut point at the base): nothing to meet there.
      if (gap >= Math.PI - 1e-6) continue
      let nrm = normalize(cross(node.n, normalize(add(a.t, b.t))))
      if (dot(nrm, a.t) < 0) nrm = scale(nrm, -1)
      res.push({ n: nrm, d: dot(nrm, node.p) })
    }
    return res
  }

  type Cut = { mitre: number; tilt: number }
  type Made = { strut: number; type: number; solid: Solid; ends: [Cut[], Cut[]]; ridge: number[]; local: (p: Vec3) => Vec3; up: Vec3; x: Vec3; y: Vec3; o: Vec3; hs: HalfSpace[] }
  const made: Made[] = []
  let failed = 0
  dome.struts.forEach((st, si) => {
    const a = P[st.a]
    const b = P[st.b]
    const x = normalize(sub(b, a))
    const r = normalize(cross(a, b))
    const u0 = normalize(add(nodes[st.a].n, nodes[st.b].n))
    const up = normalize(sub(u0, scale(x, dot(u0, x))))
    const y = cross(up, x)
    const fs = facesOf.get(strutKey(st.a, st.b)) ?? []
    const hs: HalfSpace[] = [
      { n: r, d: -w / 2 },
      { n: scale(r, -1), d: -w / 2 },
      ...fs.map((fi) => ({ n: scale(planeOf[fi].n, -1), d: -(planeOf[fi].d - ts) })),
      { n: up, d: dot(up, a) - ts - dep },
    ]
    const endPlanes: [HalfSpace[], HalfSpace[]] = [wedge(st.a, si), wedge(st.b, si)]
    if (endPlanes[0].length < 2) hs.push({ n: x, d: dot(x, a) })
    if (endPlanes[1].length < 2) hs.push({ n: scale(x, -1), d: -dot(x, b) })
    hs.push(...endPlanes[0], ...endPlanes[1])
    const solid = convexSolid(hs)
    if (!solid) return failed++
    // Cuts as set on a mitre saw with the strut's bottom on the table: the angle from square, the blade tilt.
    // Listed left then right, seen from outside with the strut's start on the left.
    const cuts = (planes: HalfSpace[]): Cut[] =>
      [...planes]
        .sort((p, q) => dot(q.n, y) - dot(p.n, y))
        .map((p) => {
          const trace = normalize(cross(p.n, up))
          return { mitre: Math.abs(90 - angleBetween(x, trace)), tilt: tiltFrom(p.n, up) }
        })
    const ridge = fs.map((fi) => angleBetween(planeOf[fi].n, up)).sort((p, q) => p - q)
    const local = (p: Vec3): Vec3 => [dot(sub(p, a), x), dot(sub(p, a), y), dot(sub(p, a), up)]
    made.push({ strut: si, type: st.type, solid, ends: [cuts(endPlanes[0]), cuts(endPlanes[1])], ridge, local, up, x, y, o: a, hs })
  })
  if (failed) out.warnings.push(`${failed} struts could not be formed: the struts are too wide or deep for this dome.`)

  // Struts of a type with the same end cuts make one part; a strut turned end for end is the same piece.
  const sig = (c: Cut[]) => c.map((q) => `${q.mitre.toFixed(1)}/${q.tilt.toFixed(1)}`)
  const key = (m: Made) => {
    const f = [...sig(m.ends[0]), '|', ...sig(m.ends[1])].join(' ')
    const r = [...sig(m.ends[1]).reverse(), '|', ...sig(m.ends[0]).reverse()].join(' ')
    return `${m.type}#${f < r ? f : r}#${m.ridge.map((q) => q.toFixed(1)).join('/')}`
  }
  const groups = new Map<string, Made[]>()
  for (const m of made) groups.set(key(m), [...(groups.get(key(m)) ?? []), m])
  const byType = new Map<number, number>()
  for (const [, list] of [...groups].sort((p, q) => p[1][0].type - q[1][0].type)) {
    const s = list[0]
    const t = dome.strutTypes[s.type]
    const n = (byType.get(s.type) ?? 0) + 1
    byType.set(s.type, n)
    const variants = [...groups.values()].filter((l) => l[0].type === s.type).length
    const label = variants > 1 ? `${t.label}${n}` : t.label
    const pts = s.solid.points.map(s.local)
    const xs = pts.map((p) => p[0])
    const L = Math.max(...xs) - Math.min(...xs)
    const part = out.parts.length
    const fmtCuts = (c: Cut[]) => (c.length ? `${c.map((q) => q.mitre.toFixed(1)).join(' / ')}°` : 'square')
    const fmtTilts = (c: Cut[]) => (c.length ? `${c.map((q) => q.tilt.toFixed(1)).join(' / ')}°` : '—')
    const detail = strutDetail(s, L, dims, unit, mm)
    out.parts.push({
      id: `strut-${fileSafe(label)}`,
      kind: 'strut',
      index: s.type,
      label,
      name: 'Strut',
      qty: list.length,
      spec: `${smallText(L / mm, unit)} tip to tip · ${smallText(dims.width, unit).split(' ')[0]} × ${smallText(dims.depth, unit)}`,
      facts: {
        title: label,
        kind: `Strut · ${smallText(dims.width, unit)} × ${smallText(dims.depth, unit)} · pointed ends`,
        rows: [
          ['Quantity', String(list.length)],
          ['Tip to tip', smallText(L / mm, unit)],
          ['Ends', 'two cuts to a point, meeting on the node axis'],
          ['Saw', 'bottom on the table: mitre from square, blade tilt'],
          ['Top', `ridged, ${s.ridge.map((q) => `${q.toFixed(1)}°`).join(' / ')}, under the decking`],
        ],
        table: {
          head: ['End', 'Mitres', 'Tilts'],
          rows: [
            ['Start', fmtCuts(s.ends[0]), fmtTilts(s.ends[0])],
            ['End', fmtCuts(s.ends[1]), fmtTilts(s.ends[1])],
          ],
        },
      },
      size: detail.size,
      draw: (d, k, th, exact) => detail.draw(d, k, th, exact, label),
    })
    for (const m of list) out.solids.push({ part, material: 'wood', kind: 'strut', index: m.type, name: `${label}-${m.strut + 1}`, group: `s${m.strut}`, solid: m.solid })
  }
  if (ts > 0) deckingParts(dome, dims, unit, mm, out, sheetSample)
  out.hardware.push({ label: 'Screw', spec: `${imperialUnit(unit) ? '3″' : '75 mm'} wood screw, 2 per strut end, into its neighbours at the node`, qty: made.length * 4 })
}

/** A pointed strut: the whole of it from outside, then both ends and the section, enlarged. */
function strutDetail(
  s: { solid: Solid; ends: [{ mitre: number; tilt: number }[], { mitre: number; tilt: number }[]]; ridge: number[]; local: (p: Vec3) => Vec3; hs: HalfSpace[]; x: Vec3; y: Vec3; up: Vec3; o: Vec3 },
  L: number,
  dims: Record<string, number>,
  unit: LengthUnit,
  mm: number,
) {
  const w = dims.width * mm
  const dep = dims.depth * mm
  const pts = s.solid.points.map(s.local)
  const x0 = Math.min(...pts.map((p) => p[0]))
  // Plan from outside: x along the strut, y up the page.
  const plan = hull(pts.map((p): P2 => [p[0] - x0, p[1]]))
  // The section halfway along: y across, z up.
  const mid = x0 + L / 2
  let sec: P2[] = [[-10 * w, -10 * dep], [10 * w, -10 * dep], [10 * w, 10 * dep], [-10 * w, 10 * dep]]
  for (const h of s.hs) {
    const ny = dot(h.n, s.y)
    const nz = dot(h.n, s.up)
    if (Math.abs(ny) < 1e-12 && Math.abs(nz) < 1e-12) continue
    sec = clip2(sec, ny, nz, h.d - dot(h.n, s.o) - mid * dot(h.n, s.x))
  }
  const sy = sec.map((p) => p[0])
  const sz = sec.map((p) => p[1])
  const secW = Math.max(...sy) - Math.min(...sy)
  const secH = Math.max(...sz) - Math.min(...sz)
  const a = Math.min(L / 2, Math.max(w * 2.2, dep))
  const gapB = w * 0.9
  const gapS = dep * 0.7
  const rowW = 2 * a + gapB + gapS + secW
  const E = [...NICE].reverse().find((e) => e * rowW <= L * 1.1 && e * secH <= L * 0.3) ?? 1
  const planH = Math.max(...plan.map((p) => p[1])) - Math.min(...plan.map((p) => p[1]))
  return {
    size: { w: Math.max(L, rowW * E), h: planH + secH * E * 1.4 },
    draw(d: Drawing, k: number, th: number, exact: boolean, label: string) {
      const P = ([x, y]: P2, sc: number, ox: number, oy: number): P2 => [ox + x * sc, oy - y * sc]
      d.poly('outline', plan.map((p) => P(p, k, 0, 0)))
      const top = Math.min(...plan.map((p) => P(p, k, 0, 0)[1]))
      const bottom = Math.max(...plan.map((p) => P(p, k, 0, 0)[1]))
      const tick = th * 0.5
      const yd = top - th * 2.4
      d.line('marks', [0, yd], [L * k, yd])
      d.line('marks', [-tick, yd + tick], [tick, yd - tick])
      d.line('marks', [L * k - tick, yd + tick], [L * k + tick, yd - tick])
      d.text([(L * k) / 2, yd - th * 0.6], `tip to tip ${smallText(L / mm, unit)}`, th, { anchor: 'middle', weight: 700 })
      d.text([(L * k) / 2, bottom + th * 1.8], label, th * 1.1, { anchor: 'middle', weight: 700 })
      // Enlarged: both ends, the middle broken out, and the section.
      const sc = (exact ? 1 : E) * k
      const head = bottom + th * 5
      d.text([0, head], exact ? 'Ends and section, full size' : 'Ends and section, enlarged', th * 1.1, { weight: 700 })
      const yc = head + th * 2.5 + w * 1.2 * sc
      const gap = Math.max(gapB * sc, th * 15 - 2 * a * sc)
      const part = (lo: number, hi: number, ox: number) => {
        let poly = clip2(plan, 1, 0, lo)
        poly = clip2(poly, -1, 0, -hi)
        d.poly('outline', poly.map(([x, y]) => P([x - lo, y], sc, ox, yc)))
      }
      part(0, a, 0)
      const xr = a * sc + gap
      part(L - a, L, xr)
      for (const xb of [a * sc, xr]) d.poly('marks', [[xb, yc - w * 0.8 * sc], [xb, yc - w * 0.15 * sc], [xb + th * 0.35, yc], [xb - th * 0.35, yc + w * 0.1 * sc], [xb, yc + w * 0.8 * sc]], false)
      // Each end: the square line through the tip, each cut swept from it.
      const tipAt = (left: boolean): P2 => {
        const tip = plan.reduce((b, p) => (left ? p[0] < b[0] : p[0] > b[0]) ? p : b)
        return left ? P(tip, sc, 0, yc) : P([tip[0] - (L - a), tip[1]], sc, xr, yc)
      }
      const rad = Math.min(w * sc * 0.9, th * 4)
      ;([0, 1] as const).forEach((e) => {
        const c = tipAt(e === 0)
        const cuts = s.ends[e]
        d.line('marks', [c[0], c[1] - w * 0.75 * sc], [c[0], c[1] + w * 0.75 * sc], { dash: true })
        if (cuts.length === 2) {
          const [up, dn] = cuts
          if (e === 0) {
            d.arc(c, rad, 90 - up.mitre, 90)
            d.arc(c, rad, 270, 270 + dn.mitre)
          } else {
            d.arc(c, rad, 90, 90 + up.mitre)
            d.arc(c, rad, 270 - dn.mitre, 270)
          }
        }
        const anchor = e === 0 ? 'start' : 'end'
        const tx = e === 0 ? 0 : xr + a * sc
        const yb = yc + w * 0.9 * sc + th * 1.6
        d.text([tx, yb], cuts.length ? `mitres ${cuts.map((q) => deg(q.mitre)).join(' / ')}` : 'square', th * 0.85, { anchor, tone: 'accent' })
        if (cuts.length) d.text([tx, yb + th * 1.2], `tilts ${cuts.map((q) => deg(q.tilt)).join(' / ')}`, th * 0.85, { anchor, tone: 'accent' })
      })
      // The section, top up.
      const ox = xr + a * sc + gapS * sc - Math.min(...sy) * sc
      const zTop = Math.max(...sz)
      const secP = sec.map(([y, z]): P2 => [ox + y * sc, yc - w * 1.2 * sc + (zTop - z) * sc])
      if (secP.length <= 4) d.fill(secP, '#ececee')
      d.poly('outline', secP)
      const sb = Math.max(...secP.map((p) => p[1]))
      const sl = Math.min(...secP.map((p) => p[0]))
      d.text([sl, sb + th * 1.7], `ridge ${s.ridge.map((q) => deg(q)).join(' / ')}`, th * 0.85, { tone: 'accent' })
      d.text([sl, sb + th * 2.9], `${smallText(dims.width, unit).split(' ')[0]} × ${smallText(dims.depth, unit)}`, th * 0.85, { tone: 'muted' })
    },
  }
}

/** One frame beam: its sizes and cuts, and its faces in its own frame (x along the outer edge, y inward, z down). */
interface BeamCut {
  strut: string
  length: number
  inner: number
  bevel: number
  ends: [number, number]
  tilts: [number, number]
  /** Top face (under the decking): outer start, outer end, inner end, inner start. */
  top: Vec3[]
  /** Bottom face, the same corners. */
  bottom: Vec3[]
}

const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]

/**
 * The frame's beams, one row per different beam (mirror pairs share a row):
 * both ends in plan, the beam broken in the middle, with the mitre against a
 * square line; and the section, with the bevel against the square stock.
 * Enlarged on the page; true size on the 1:1 sheet.
 */
function beamDetails(members: BeamCut[], dims: Record<string, number>, frame: { w: number; h: number }, unit: LengthUnit, mm: number) {
  const bw = dims.width * mm
  const bd = dims.depth * mm
  const key = (b: BeamCut, flip: boolean) => {
    const e = flip ? [...b.ends].reverse() : b.ends
    const t = flip ? [...b.tilts].reverse() : b.tilts
    return [b.strut, b.length.toFixed(6), b.bevel.toFixed(2), ...e.map((x) => x.toFixed(2)), ...t.map((x) => x.toFixed(2))].join('|')
  }
  const rows: { i: number; same: number[]; mirror: number[] }[] = []
  members.forEach((b, i) => {
    const row = rows.find((r) => key(members[r.i], false) === key(b, false))
    if (row) return row.same.push(i)
    const mirror = rows.find((r) => key(members[r.i], false) === key(b, true))
    if (mirror) return mirror.mirror.push(i)
    rows.push({ i, same: [], mirror: [] })
  })
  // How much of each end to show, and the scale the details are drawn at, relative to the frame.
  const reach = Math.max(...members.flatMap((b) => [...b.top, ...b.bottom].map((p) => Math.min(p[0], b.length - p[0]))))
  const a = Math.max(reach + bw * 0.7, bd)
  const gapB = bw * 0.9
  const gapS = bd * 0.7
  const cols = rows.length > 2 ? 2 : 1
  const rowW = 2 * a + gapB + gapS + bw
  const rowH = Math.max(bw, bd) * 1.6
  const lines = Math.ceil(rows.length / cols)
  // As large as fits under the frame: about as wide, at most as tall.
  const E = [...NICE].reverse().find((e) => e * (rowW * cols + gapS * (cols - 1)) <= frame.w * 1.1 && e * rowH * lines <= frame.h) ?? 1
  return {
    w: (rowW * cols + gapS * (cols - 1)) * E,
    h: rowH * lines * E,
    draw(d: Drawing, k: number, th: number, exact: boolean, below: number) {
      const s = (exact ? 1 : E) * k
      const head = below + th * 4.5
      d.text([0, head], exact ? 'Beams, full size' : 'Beams, enlarged', th * 1.1, { weight: 700 })
      const colW = Math.max((rowW + gapS) * s, th * 15 + (gapS * 2 + bw) * s) + th * 4
      const step = Math.max(bw, bd) * s + th * 7.5
      rows.forEach((r, n) => {
        const b = members[r.i]
        const x0 = (n % cols) * colW
        const y0 = head + th * 2.6 + Math.floor(n / cols) * step
        const names = [r.i, ...r.same].map((x) => x + 1).join(', ')
        const mirror = r.mirror.length ? ` · ${r.mirror.map((x) => x + 1).join(', ')} mirrored` : ''
        d.text([x0, y0], `Beam ${names}${mirror} · ${b.strut} · long point ${smallText(b.length / mm, unit)}`, th * 0.95, { weight: 700 })
        const top = y0 + th * 1.4
        // Plan from outside: outer edge along the bottom, the inside above. The middle is broken
        // out of a long beam, leaving room between the ends for their notes; a short one is whole.
        const broken = b.length > 2 * a + bw
        const gap = Math.max(gapB * s, th * 15 - 2 * a * s)
        const px = (x: number) => x0 + (!broken ? x * s : x < b.length / 2 ? x * s : (x - (b.length - a) + a) * s + gap)
        const py = (y: number) => top + (bw - y) * s
        const P = (p: Vec3): P2 => [px(p[0]), py(p[1])]
        const [t0, t1, q1, q0] = b.top
        const [b0, b1, i1, i0] = b.bottom
        const xa = px(a)
        const xb = px(b.length - a)
        // Hidden: the bottom face's outer edge and end lines (its inner edge is under the top one).
        if (broken) {
          d.poly('outline', [[xa, py(0)], P(t0), P(q0), [xa, py(bw)]], false)
          d.poly('outline', [[xb, py(0)], P(t1), P(q1), [xb, py(bw)]], false)
          d.poly('marks', [[xa, py(b0[1])], P(b0), P(i0)], false, { dash: true })
          d.poly('marks', [[xb, py(b1[1])], P(b1), P(i1)], false, { dash: true })
        } else {
          d.poly('outline', b.top.map(P))
          d.poly('marks', [P(i0), P(b0), P(b1), P(i1)], false, { dash: true })
        }
        // Break lines.
        for (const x of broken ? [xa, xb] : []) {
          const h = py(0) - py(bw)
          d.poly('marks', [[x, py(0) + th * 0.4], [x, py(0) - h * 0.4], [x + th * 0.35, py(0) - h * 0.55], [x - th * 0.35, py(0) - h * 0.7], [x, py(bw) + h * 0.15], [x, py(bw) - th * 0.4]], false)
        }
        // Each end: a square line from the long point, and the mitre swept from it.
        const rad = Math.min(bw * s * 0.85, th * 4)
        ;([[t0, q0, 0], [t1, q1, 1]] as const).forEach(([tp, qp, e]) => {
          const c = P(tp)
          const q = P(qp)
          d.line('marks', c, [c[0], c[1] - bw * s * 1.15], { dash: true })
          const ang = (Math.atan2(-(q[1] - c[1]), q[0] - c[0]) * 180) / Math.PI
          if (e === 0) d.arc(c, rad, ang, 90)
          else d.arc(c, rad, 90, ang)
          d.text([c[0], py(0) + th * 1.7], `mitre ${deg(b.ends[e])}`, th * 0.85, { anchor: e === 0 ? 'start' : 'end', tone: 'accent' })
          d.text([c[0], py(0) + th * 2.9], `tilt ${deg(b.tilts[e])}`, th * 0.85, { anchor: e === 0 ? 'start' : 'end', tone: 'accent' })
        })
        // Section, decking side up, outer side on the left: the square stock dashed, the bevel ripped off it.
        const sx = (y: number) => Math.max(px(b.length), x0 + th * 15) + gapS * s + y * s
        const sy = (z: number) => top + z * s
        const yb = b0[1]
        const sec: P2[] = [[sx(0), sy(0)], [sx(bw), sy(0)], [sx(bw), sy(bd)], [sx(yb), sy(bd)]]
        d.fill(sec, '#ececee')
        d.poly('outline', sec)
        d.poly('marks', [[sx(0), sy(0)], [sx(0), sy(bd)], [sx(yb), sy(bd)]], false, { dash: true })
        d.arc([sx(0), sy(0)], bd * s * 0.62, 270, 270 + b.bevel)
        d.text([sx(bw) + th * 0.6, sy(0) + th * 0.9], 'inner', th * 0.8, { tone: 'muted' })
        d.text([sx(0) - th * 0.6, sy(0) + th * 0.9], 'outer', th * 0.8, { anchor: 'end', tone: 'muted' })
        d.text([sx(0), sy(bd) + th * 1.7], `bevel ${deg(b.bevel)}`, th * 0.85, { tone: 'accent' })
        d.text([sx(0), sy(bd) + th * 2.9], `from ${smallText(dims.width, unit).split(' ')[0]} × ${smallText(dims.depth, unit)}`, th * 0.85, { tone: 'muted' })
      })
    },
  }
}

/* ---------------------------------------------------------------- */
/*  Timber struts on steel star hubs                                 */
/* ---------------------------------------------------------------- */

function timber(dome: Dome, dims: Record<string, number>, unit: LengthUnit, mm: number, out: Build) {
  const nodes = nodesOf(dome)
  const bw = dims.width * mm
  const bd = dims.depth * mm
  const tr = (dims.tube * mm) / 2
  const fl = dims.fin * mm
  const ft = dims.finT * mm
  const gap = dims.gap * mm
  const kerf = ft + 1 * mm
  const fh = bd * 0.8
  const bolt = dims.bolt * mm
  const tubeLen = bd * 1.15

  if (dims.finT + 1 > dims.width * 0.5) out.warnings.push('The fin is thick for the beam: the kerf leaves less than a quarter of the beam each side.')
  if (dims.tube < dims.finT * 3) out.warnings.push('The hub tube is small for the fins.')

  /** How far along the strut its end stands from the node: clear of the tube, plus the gap. */
  const setback = (node: Node, other: Vec3) => {
    const dip = (bendAt(node, other) * Math.PI) / 180
    return tr / Math.cos(dip) + gap
  }
  const holesAt = (s: number) => [s + fl * 0.3, s + fl * 0.75]

  const sample = new Map<number, { cut: number; dips: [number, number] }>()
  dome.struts.forEach((st, si) => {
    const na = nodes[st.a]
    const nb = nodes[st.b]
    const A = na.p
    const B = nb.p
    const L = distance(A, B)
    const x = normalize(sub(B, A))
    const nsum = add(na.n, nb.n)
    const z = normalize(sub(nsum, scale(x, dot(x, nsum))))
    const y = cross(z, x)
    const sa = setback(na, B)
    const sb = setback(nb, A)
    const k2 = kerf / 2
    const outline: P2[] = [
      [sa, -bw / 2], [L - sb, -bw / 2], [L - sb, -k2], [L - sb - fl, -k2], [L - sb - fl, k2], [L - sb, k2],
      [L - sb, bw / 2], [sa, bw / 2], [sa, k2], [sa + fl, k2], [sa + fl, -k2], [sa, -k2],
    ]
    const label = dome.strutTypes[st.type].label
    out.solids.push({ part: null, material: 'wood', kind: 'strut', index: st.type, name: `${label}-${si + 1}`, group: `s${si}`, solid: prism({ o: A, u: x, v: y, n: z }, outline, [], -bd / 2, bd / 2) })
    // A fin at each end, in the strut's own plane, from the tube into the kerf.
    for (const [o, u, s, node, end] of [[A, x, sa, st.a, 1], [B, scale(x, -1), sb, st.b, 2]] as const) {
      const n = cross(u, z)
      const x0 = s - gap
      const hub = dome.hubs[node]
      out.solids.push({
        part: null, material: 'steel', kind: 'hub', index: hub.type, name: `${dome.hubTypes[hub.type].label}-${node + 1}-fin-${label}`, group: `n${node}`,
        solid: prism({ o, u, v: z, n }, [[x0, -fh / 2], [s + fl, -fh / 2], [s + fl, fh / 2], [x0, fh / 2]], [], -ft / 2, ft / 2),
      })
      for (const h of holesAt(s)) {
        const c = add(o, scale(u, h))
        const yy = end === 1 ? y : scale(y, -1)
        out.solids.push({ part: null, material: 'bolt', kind: null, index: -1, name: `bolt-${label}-${si + 1}`, group: `s${si}`, solid: cylinder(sub(c, scale(yy, bw / 2 + bolt)), add(c, scale(yy, bw / 2 + bolt)), bolt / 2, 10) })
      }
    }
    if (!sample.has(st.type)) {
      const dips = [bendAt(na, B), bendAt(nb, A)].sort((a, b) => a - b) as [number, number]
      sample.set(st.type, { cut: L - sa - sb, dips })
    }
  })

  for (const t of dome.strutTypes) {
    const s = sample.get(t.index)
    if (!t.count || !s) continue
    const part = out.parts.length
    const holes = holesAt(0).map((h) => smallText(h / mm, unit).split(' ')[0]).join(', ')
    out.parts.push({
      id: `strut-${fileSafe(t.label)}`,
      kind: 'strut',
      index: t.index,
      label: t.label,
      name: 'Beam',
      qty: t.count,
      spec: `cut ${smallText(s.cut / mm, unit)} square · kerf ${smallText(dims.fin, unit).split(' ')[0]} deep`,
      facts: {
        title: t.label,
        kind: `Beam · ${smallText(dims.width, unit)} × ${smallText(dims.depth, unit)}${t.kind === 'cut' ? ` · cut piece of ${dome.strutTypes[t.parent!].label}` : t.kind === 'ring' ? ' · base ring' : ''}`,
        rows: [
          ['Quantity', String(t.count)],
          ['Cut length', `${smallText(s.cut / mm, unit)}, both ends square`],
          ['Node to node', smallText(t.length / mm, unit)],
          ['Kerf', `${smallText(dims.finT + 1, unit)} × ${smallText(dims.fin, unit)} deep, centred`],
          ['Holes', `Ø ${smallText(dims.bolt + 1, unit)} at ${holes} from each end`],
          ['Stands', 'on edge, depth toward the centre'],
          ['Hub angles', `${deg(s.dips[0])} / ${deg(s.dips[1])}, on the fins`],
        ],
      },
      size: { w: s.cut, h: Math.max(bw, s.cut * 0.04) },
      draw: (d, k, th, exact) => drawBeam(d, t.label, s.cut, dims, k, th, exact, unit, mm),
    })
    for (const ps of out.solids) if (ps.kind === 'strut' && ps.index === t.index) ps.part = part
  }

  // Hubs: a tube along the node's radius with a fin per strut.
  const hubSample = new Map<number, { arms: { strut: string; dip: number; angle: number }[] }>()
  nodes.forEach((nd, i) => {
    if (!nd.arms.length) return
    const type = dome.hubs[i].type
    out.solids.push({ part: null, material: 'steel', kind: 'hub', index: type, name: `${dome.hubTypes[type].label}-${i + 1}-tube`, group: `n${i}`, solid: cylinder(sub(nd.p, scale(nd.n, tubeLen / 2)), add(nd.p, scale(nd.n, tubeLen / 2)), tr, 20) })
    if (!hubSample.has(type))
      hubSample.set(type, { arms: nd.arms.map((a) => ({ strut: dome.strutTypes[dome.struts[a.strut].type].label, dip: bendAt(nd, nodes[a.other].p), angle: a.angle })) })
  })
  for (const t of dome.hubTypes) {
    const s = hubSample.get(t.index)
    if (!s) continue
    const span = tr + gap + fl
    const part = out.parts.length
    out.parts.push({
      id: `hub-${fileSafe(t.label)}`,
      kind: 'hub',
      index: t.index,
      label: t.label,
      name: 'Star hub',
      qty: t.count,
      spec: `${s.arms.length} fins · ${s.arms.map((a) => deg(a.dip)).join(' ')}`,
      facts: {
        title: t.label,
        kind: `Star hub · ${s.arms.length} fins${t.kind === 'cut' ? ' · on the base plane' : ''}${t.mirrorOf != null ? ` · mirror of ${dome.hubTypes[t.mirrorOf].label}` : ''}`,
        rows: [
          ['Quantity', String(t.count)],
          ['Tube', `Ø ${smallText(dims.tube, unit)} × ${smallText(tubeLen / mm, unit)}, radial`],
          ['Fins', `${smallText(dims.gap + dims.fin, unit)} × ${smallText(fh / mm, unit)} × ${smallText(dims.finT, unit)}`],
          ['Fin angle', 'tilt from square to the tube'],
          ['Drawn', 'seen from outside, down the tube'],
        ],
        table: {
          head: ['Fin', 'Strut', 'Angle', 'Turn'],
          rows: s.arms.map((a, i) => {
            const next = s.arms[(i + 1) % s.arms.length]
            const turn = (((next.angle - a.angle) * 180) / Math.PI + 720) % 360
            return [String(i + 1), a.strut, deg(a.dip), s.arms.length > 1 ? deg(turn || 360) : '—']
          }),
        },
      },
      size: { w: span * 2.2, h: span * 2.2 },
      draw: (d, k, th) => {
        d.circle('outline', [0, 0], tr * k)
        s.arms.forEach((a, i) => {
          const dir: P2 = [Math.cos(a.angle), -Math.sin(a.angle)]
          const nrm: P2 = [-dir[1], dir[0]]
          const w = Math.max((ft * k) / 2, th * 0.15)
          const r0 = tr * k
          const r1 = (tr + gap + fl) * Math.cos((a.dip * Math.PI) / 180) * k
          const c = (r: number, sgn: number): P2 => [dir[0] * r + nrm[0] * w * sgn, dir[1] * r + nrm[1] * w * sgn]
          d.poly('outline', [c(r0, -1), c(r1, -1), c(r1, 1), c(r0, 1)])
          const lab: P2 = [dir[0] * (r1 + th * 3.2), dir[1] * (r1 + th * 3.2)]
          d.text([lab[0], lab[1] - th * 0.5], `${i + 1} · ${a.strut}`, th, { anchor: 'middle', middle: true, weight: 700 })
          d.text([lab[0], lab[1] + th * 1.2], `fin ${deg(a.dip)}`, th * 0.8, { anchor: 'middle', middle: true, tone: 'accent' })
        })
        d.text([0, 0], t.label, th, { anchor: 'middle', middle: true, weight: 700 })
      },
    })
    for (const ps of out.solids) if (ps.kind === 'hub' && ps.index === t.index) ps.part = part
  }
  const finCount = dome.struts.length * 2
  out.hardware.push({ label: 'Fin', spec: `${smallText(dims.gap + dims.fin, unit)} × ${smallText(fh / mm, unit)} × ${smallText(dims.finT, unit)} steel, welded to the hubs`, qty: finCount })
  out.hardware.push({ label: 'Bolt', spec: `Ø ${smallText(dims.bolt, unit)} × ${smallText(boltLength(dims.width + 2.5 * dims.bolt, unit), unit)}, nut, 2 washers`, qty: finCount * 2 })
}

/** A beam seen from outside the dome: square ends, a kerf in each, two holes per end. */
function drawBeam(d: Drawing, label: string, L: number, dims: Record<string, number>, k: number, th: number, exact: boolean, unit: LengthUnit, mm: number) {
  const len = L * k
  const grow = exact ? 1 : Math.max(1, (th * 2) / (dims.width * mm * k))
  const w = (dims.width * mm * k * grow) / 2
  const kf = ((dims.finT + 1) * mm * k * Math.min(grow, 2)) / 2
  const fl = dims.fin * mm * k
  d.poly('outline', [[0, -w], [len, -w], [len, w], [0, w]])
  d.poly('marks', [[0, -kf], [fl, -kf], [fl, kf], [0, kf]], false, { dash: true })
  d.poly('marks', [[len, -kf], [len - fl, -kf], [len - fl, kf], [len, kf]], false, { dash: true })
  const hr = ((dims.bolt + 1) * mm * k * Math.min(grow, 2.5)) / 2
  for (const h of [fl * 0.3, fl * 0.75]) {
    d.circle('outline', [h, 0], hr)
    d.circle('outline', [len - h, 0], hr)
  }
  const tick = th * 0.5
  const y = -w - th * 2.4
  d.line('marks', [0, y], [len, y])
  d.line('marks', [-tick, y + tick], [tick, y - tick])
  d.line('marks', [len - tick, y + tick], [len + tick, y - tick])
  d.text([len / 2, y - th * 0.6], `cut ${smallText(L / mm, unit)} · square ends`, th, { anchor: 'middle', weight: 700 })
  d.text([len / 2, 0], label, th * 1.1, { anchor: 'middle', middle: true, weight: 700 })
  d.text([0, w + th * 1.8], `kerf ${smallText(dims.finT + 1, unit)} × ${smallText(dims.fin, unit)}`, th * 0.85, { tone: 'accent' })
  d.text([len, w + th * 1.8], `holes at ${smallText(dims.fin * 0.3, unit)}, ${smallText(dims.fin * 0.75, unit)}`, th * 0.85, { anchor: 'end', tone: 'accent' })
}
