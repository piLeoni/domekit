/**
 * Closed polyhedral solids: the parts of a construction, for the 3D view and
 * the STEP file. Every face is planar; a face may have holes.
 */
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from './vec'

export type P2 = [number, number]

/**
 * Points, and faces as loops of point indices. The first loop of a face runs
 * counter-clockwise seen from outside the solid; any further loops are holes
 * and run the other way. Every edge is shared by exactly two faces.
 */
export interface Solid {
  points: Vec3[]
  faces: number[][][]
}

/** A right-handed frame: `u × v = n`. */
export interface Frame {
  o: Vec3
  u: Vec3
  v: Vec3
  n: Vec3
}

/** A frame at `o` with normal `n` and `u` as close to `toward` as the normal allows. */
export function frameAt(o: Vec3, n: Vec3, toward: Vec3): Frame {
  const nn = normalize(n)
  let u = sub(toward, scale(nn, dot(toward, nn)))
  if (length(u) < 1e-9) u = Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0])
  u = normalize(u)
  return { o, u, v: cross(nn, u), n: nn }
}

export const inFrame = (f: Frame, x: number, y: number, z = 0): Vec3 => add(add(add(f.o, scale(f.u, x)), scale(f.v, y)), scale(f.n, z))

export const area2 = (pts: P2[]) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2

const ccw = (pts: P2[]) => (area2(pts) < 0 ? [...pts].reverse() : pts)
const cw = (pts: P2[]) => (area2(pts) > 0 ? [...pts].reverse() : pts)

/** A circle as a counter-clockwise polygon. */
export const circle2 = (c: P2, r: number, sides = 24, phase = 0): P2[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = phase + (i / sides) * Math.PI * 2
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]
  })

/** Convex hull, counter-clockwise (monotone chain). */
export function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const turn = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  const upper: P2[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * A flat outline with holes, drawn in the frame's (u, v) plane, extruded
 * along n from z0 to z1 (z0 < z1).
 */
export function prism(f: Frame, outline: P2[], holes: P2[][], z0: number, z1: number): Solid {
  const loops = [ccw(outline), ...holes.map(cw)]
  const points: Vec3[] = []
  const bottom: number[][] = []
  const top: number[][] = []
  for (const loop of loops) {
    bottom.push(loop.map(([x, y]) => points.push(inFrame(f, x, y, z0)) - 1))
    top.push(loop.map(([x, y]) => points.push(inFrame(f, x, y, z1)) - 1))
  }
  const faces: number[][][] = [top, bottom.map((l) => [...l].reverse())]
  loops.forEach((loop, k) => {
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length
      faces.push([[bottom[k][i], bottom[k][j], top[k][j], top[k][i]]])
    }
  })
  return { points, faces }
}

/** A round bar from a to b, as a prism of `sides` flats. */
export function cylinder(a: Vec3, b: Vec3, r: number, sides = 16): Solid {
  const axis = sub(b, a)
  const f = frameAt(a, axis, Math.abs(axis[2]) < 0.9 * length(axis) ? [0, 0, 1] : [1, 0, 0])
  return prism(f, circle2([0, 0], r, sides), [], 0, length(axis))
}

/**
 * A slab between two parallel polygons: `outer` and `inner` have the same
 * number of corners, both counter-clockwise seen from outside; `outer` is the
 * face away from the solid's inside.
 */
export function slab(outer: Vec3[], inner: Vec3[]): Solid {
  const m = outer.length
  const points = [...outer, ...inner]
  const faces: number[][][] = [[outer.map((_, i) => i)], [inner.map((_, i) => m + i).reverse()]]
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m
    faces.push([[m + i, m + j, j, i]])
  }
  return { points, faces }
}

/** Newell normal of a loop, not normalized: its length is twice the area. */
export function loopNormal(points: Vec3[], loop: number[]): Vec3 {
  const nrm: Vec3 = [0, 0, 0]
  for (let i = 0; i < loop.length; i++) {
    const a = points[loop[i]]
    const b = points[loop[(i + 1) % loop.length]]
    nrm[0] += (a[1] - b[1]) * (a[2] + b[2])
    nrm[1] += (a[2] - b[2]) * (a[0] + b[0])
    nrm[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return nrm
}

/** Signed volume: positive when the faces point outward. */
export function volume(s: Solid): number {
  let v = 0
  for (const face of s.faces)
    for (const loop of face) {
      const p0 = s.points[loop[0]]
      for (let i = 1; i < loop.length - 1; i++) v += dot(p0, cross(s.points[loop[i]], s.points[loop[i + 1]]))
    }
  return v / 6
}

export const moveSolid = (s: Solid, by: (p: Vec3) => Vec3): Solid => ({ points: s.points.map(by), faces: s.faces })

/** A half-space `n · x ≥ d`. */
export interface HalfSpace {
  n: Vec3
  d: number
}

/**
 * The convex solid inside every half-space, or null when it is empty or
 * unbounded. Each vertex is where three planes meet inside all the others;
 * each face is the vertices on one plane, in order around it.
 */
export function convexSolid(hs: HalfSpace[], eps = 1e-9): Solid | null {
  const points: Vec3[] = []
  const tol = eps * Math.max(1, ...hs.map((h) => Math.abs(h.d)))
  const inside = (p: Vec3) => hs.every((h) => dot(h.n, p) >= h.d - tol * 10)
  for (let a = 0; a < hs.length; a++)
    for (let b = a + 1; b < hs.length; b++)
      for (let c = b + 1; c < hs.length; c++) {
        const [A, B, C] = [hs[a], hs[b], hs[c]]
        const bc = cross(B.n, C.n)
        const det = dot(A.n, bc)
        if (Math.abs(det) < 1e-12) continue
        const p = scale(add(add(scale(bc, A.d), scale(cross(C.n, A.n), B.d)), scale(cross(A.n, B.n), C.d)), 1 / det)
        if (inside(p) && !points.some((q) => length(sub(p, q)) < tol * 100)) points.push(p)
      }
  if (points.length < 4) return null
  const faces: number[][][] = []
  for (const h of hs) {
    const on = points.map((p, i) => [p, i] as const).filter(([p]) => Math.abs(dot(h.n, p) - h.d) < tol * 100)
    if (on.length < 3) continue
    const c = scale(on.reduce((s, [p]) => add(s, p), [0, 0, 0] as Vec3), 1 / on.length)
    // Seen from outside, along -n: counter-clockwise.
    const out = scale(h.n, -1)
    const f = frameAt(c, out, sub(on[0][0], c))
    const ang = (p: Vec3) => Math.atan2(dot(sub(p, c), f.v), dot(sub(p, c), f.u))
    faces.push([on.sort((x, y) => ang(x[0]) - ang(y[0])).map(([, i]) => i)])
  }
  return { points, faces }
}

/** Clip a convex 2D polygon to `a·x + b·y ≥ c`. */
export function clip2(poly: P2[], a: number, b: number, c: number): P2[] {
  const out: P2[] = []
  const f = (p: P2) => a * p[0] + b * p[1] - c
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp >= 0) out.push(p)
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  })
  return out
}
