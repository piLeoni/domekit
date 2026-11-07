import { basePolyhedron, type BaseSolid } from './polyhedra'
import type {
  Dome,
  DomeParams,
  Face,
  FaceSchema,
  FaceType,
  FlatCut,
  Hub,
  HubArm,
  HubType,
  PieceKind,
  Strut,
  StrutType,
} from './types'
import { add, cross, distance, dot, length, normalize, scale, sub, type Vec3 } from './vec'

const DEG = 180 / Math.PI
/** Lengths closer than this on the unit sphere are the same strut. */
const SAME = 1e-9
/** A hub this close to the cut plane (in radii) is on it: no sliver pieces from rounding. */
const ON = 1e-6
/** Grouping key for a measured value. */
const q = (x: number) => Math.round(x * 1e7)

/** `A`…`Z`, then `AA`, `AB`… */
export function letter(n: number): string {
  let s = ''
  let k = n
  do {
    s = String.fromCharCode(65 + (k % 26)) + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

/** The subdivided sphere before any cut: Class I, Method 1 (planar grid, projected). */
export interface Sphere {
  solid: BaseSolid
  frequency: number
  vertices: Vec3[]
  faces: [number, number, number][]
  /** For the first base face: hub index at barycentric (i, j). */
  firstFace: Map<string, number>
  /** For the first base face: its small triangles, by face index and grid cell. */
  firstTriangles: { face: number; i: number; j: number; up: boolean }[]
}

export function subdivide(solid: BaseSolid, frequency: number): Sphere {
  const V = Math.max(1, Math.floor(frequency))
  const base = basePolyhedron(solid)
  const vertices: Vec3[] = []
  const index = new Map<string, number>()
  const faces: [number, number, number][] = []
  let firstFace = new Map<string, number>()
  const firstTriangles: Sphere['firstTriangles'] = []

  base.faces.forEach((corners, fi) => {
    const [A, B, C] = corners.map((c) => base.vertices[c])
    // A point is keyed by where it lies on the base solid (corner, edge or
    // face), so points on a shared edge are found from both sides exactly.
    const key = (i: number, j: number): string => {
      const w: [number, number][] = [
        [corners[0], V - i - j],
        [corners[1], i],
        [corners[2], j],
      ]
      const on = w.filter(([, x]) => x > 0)
      if (on.length === 1) return `v${on[0][0]}`
      if (on.length === 2) {
        const [[p, wp], [q]] = on[0][0] < on[1][0] ? on : [on[1], on[0]]
        return `e${p}-${q}-${wp}`
      }
      return `f${fi}-${i}-${j}`
    }
    const at = (i: number, j: number): number => {
      const k = key(i, j)
      let n = index.get(k)
      if (n === undefined) {
        const p = add(A, add(scale(sub(B, A), i / V), scale(sub(C, A), j / V)))
        n = vertices.push(normalize(p)) - 1
        index.set(k, n)
      }
      return n
    }
    const local = new Map<string, number>()
    for (let i = 0; i <= V; i++) for (let j = 0; i + j <= V; j++) local.set(`${i},${j}`, at(i, j))
    if (fi === 0) firstFace = local
    const p = (i: number, j: number) => local.get(`${i},${j}`)!
    for (let i = 0; i < V; i++) {
      for (let j = 0; i + j < V; j++) {
        if (fi === 0) firstTriangles.push({ face: faces.length, i, j, up: true })
        faces.push([p(i, j), p(i + 1, j), p(i, j + 1)])
        if (i + j < V - 1) {
          if (fi === 0) firstTriangles.push({ face: faces.length, i, j, up: false })
          faces.push([p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)])
        }
      }
    }
  })
  return { solid, frequency: V, vertices, faces, firstFace, firstTriangles }
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

/** Any closed polyhedron: vertices, and faces as outward-wound polygons. */
export interface Mesh {
  vertices: Vec3[]
  faces: number[][]
}

/** Each side of a polygon as a vertex pair, the last closing back to the first. */
const ring = (f: readonly number[]) => f.map((v, i) => [v, f[(i + 1) % f.length]] as const)

/**
 * The Goldberg polyhedron: the polar reciprocal of the geodesic sphere.
 *
 * Each triangle becomes a vertex, at the pole of the triangle's plane; each
 * hub becomes a pentagon or hexagon lying in the sphere's tangent plane at
 * that hub. Every panel is exactly flat, and neighbours share their corners:
 * the pole of a triangle lies on the tangent plane of each of its three hubs
 * (spec §3.6, where R / (u·N) · u is the same point for all three).
 */
export function goldberg(sphere: Sphere): Mesh {
  const sv = sphere.vertices
  const vertices = sphere.faces.map(([a, b, c]) => {
    const n = normalize(cross(sub(sv[b], sv[a]), sub(sv[c], sv[a])))
    return scale(n, 1 / dot(n, sv[a]))
  })
  const around: number[][] = sv.map(() => [])
  sphere.faces.forEach((f, fi) => f.forEach((v) => around[v].push(fi)))
  // Order the triangles around each hub counter-clockwise seen from outside.
  const faces = around.map((ts, v) => {
    const n = sv[v]
    const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    const e1 = normalize(sub(ref, scale(n, dot(ref, n))))
    const e2 = cross(n, e1)
    const angle = (t: number) => {
      const d = sub(vertices[t], n)
      return Math.atan2(dot(d, e2), dot(d, e1))
    }
    return [...ts].sort((a, b) => angle(a) - angle(b))
  })
  return { vertices, faces }
}

/**
 * Coefficients where an `exclude` cut leaves a flat base: every node on the
 * open edge lies on one ring. Smallest cap first.
 */
export function flatCuts(mesh: Mesh): FlatCut[] {
  const mins = mesh.faces.map((f) => Math.min(...f.map((v) => mesh.vertices[v][2])))
  const zs = [...new Set(mins.map((m) => q(m)))].map((k) => k / 1e7).sort((a, b) => b - a)
  const out: FlatCut[] = []
  for (const z of zs) {
    const kept = mesh.faces.filter((_, i) => mins[i] >= z - 1e-7)
    if (kept.length === mesh.faces.length) continue
    const use = new Map<string, number>()
    for (const f of kept) for (const [p, r] of ring(f)) use.set(edgeKey(p, r), (use.get(edgeKey(p, r)) ?? 0) + 1)
    let flat = true
    for (const [k, n] of use) {
      if (n !== 1) continue
      if (k.split('-').some((v) => Math.abs(mesh.vertices[Number(v)][2] - z) > 1e-7)) {
        flat = false
        break
      }
    }
    if (flat) out.push({ cut: (1 - z) / 2, faces: kept.length })
  }
  return out
}

/** Group sorted values into families; returns the family index for each input. */
function families(values: number[]): { reps: number[]; of: number[] } {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const reps: number[] = []
  const of = new Array<number>(values.length)
  for (const [v, i] of order) {
    if (!reps.length || v - reps[reps.length - 1] > SAME) reps.push(v)
    of[i] = reps.length - 1
  }
  return { reps, of }
}

function polygonArea(p: Vec3[]): number {
  let a = 0
  for (let i = 1; i < p.length - 1; i++) a += length(cross(sub(p[i], p[0]), sub(p[i + 1], p[0]))) / 2
  return a
}

/** Corner angles, area and flat outline of a planar polygon. */
function shape(p: Vec3[]) {
  const n = p.length
  const angles = p.map((c, i) => {
    const u = normalize(sub(p[(i + n - 1) % n], c))
    const v = normalize(sub(p[(i + 1) % n], c))
    return Math.acos(Math.min(1, Math.max(-1, dot(u, v)))) * DEG
  })
  const ex = normalize(sub(p[1], p[0]))
  const nz = normalize(cross(sub(p[1], p[0]), sub(p[n - 1], p[0])))
  const ey = cross(nz, ex)
  const outline = p.map((c) => {
    const d = sub(c, p[0])
    return [dot(d, ex), dot(d, ey)] as [number, number]
  })
  return { angles, area: polygonArea(p), outline }
}

/** A corner of a kept panel: a hub of the sphere, or a point where a strut crosses the plane. */
interface Corner {
  id: string
  pos: Vec3
  /** The sphere hub, for a hub. */
  hub?: number
  /** The sphere strut crossed, for a cut point. */
  edge?: [number, number]
}

/** Labels for the pieces cut from one parent: `B′`, or `B′1`, `B′2` when there are several. */
function primed(parent: string, i: number, of: number) {
  return of === 1 ? `${parent}′` : `${parent}′${i + 1}`
}

/** Angle a strut from `p` toward `q` dips below the tangent plane at `p` (its radial normal), degrees. */
const dipAt = (p: Vec3, q: Vec3) => Math.asin(Math.max(-1, Math.min(1, -dot(normalize(sub(q, p)), normalize(p))))) * DEG

/** The rotation of a cyclic list of keys that reads first, and where it starts. */
function canonicalCycle(keys: string[]): { key: string; start: number } {
  let best = { key: '', start: 0 }
  for (let r = 0; r < keys.length; r++) {
    const key = keys.map((_, i) => keys[(r + i) % keys.length]).join('|')
    if (r === 0 || key < best.key) best = { key, start: r }
  }
  return best
}

export function generateDome(params: DomeParams): Dome {
  const sphere = subdivide(params.solid, params.frequency)
  const pattern = params.pattern ?? 'geodesic'
  const src: Mesh = pattern === 'goldberg' ? goldberg(sphere) : sphere
  const R = params.radius
  const cut = Math.min(1, Math.max(0, params.cut))
  const mode = params.mode
  const zc = 1 - 2 * cut
  const sv = src.vertices
  const side = sv.map(([, , z]) => (z > zc + ON ? 1 : z < zc - ON ? -1 : 0))

  // ---- Families of the whole polyhedron: letters that never move with the cut.
  // A strut family is a length and the angles at its two ends (equal on the
  // geodesic sphere; they can differ on the Goldberg polyhedron).
  const allEdges = new Map<string, [number, number]>()
  for (const f of src.faces) for (const [p, r] of ring(f)) allEdges.set(edgeKey(p, r), [p, r])
  const edgeList = [...allEdges.entries()]
  const edgeInfo = edgeList.map(([, [a, b]]) => {
    const ends = [dipAt(sv[a], sv[b]), dipAt(sv[b], sv[a])].sort((x, y) => x - y)
    return { len: distance(sv[a], sv[b]), ends }
  })
  const byLength = families(edgeInfo.map((e) => e.len))
  const famKey = (i: number) => `${byLength.of[i]}|${edgeInfo[i].ends.map((x) => Math.round(x * 1e4)).join(',')}`
  const famFirst = new Map<string, number>()
  edgeInfo.forEach((_, i) => famFirst.has(famKey(i)) || famFirst.set(famKey(i), i))
  const famOrder = [...famFirst.entries()].sort(
    ([, a], [, b]) => byLength.of[a] - byLength.of[b] || edgeInfo[a].ends[0] - edgeInfo[b].ends[0] || edgeInfo[a].ends[1] - edgeInfo[b].ends[1],
  )
  const famIndex = new Map(famOrder.map(([k], i) => [k, i]))
  const typeOfEdge = new Map<string, number>()
  edgeList.forEach(([k], i) => typeOfEdge.set(k, famIndex.get(famKey(i))!))

  const strutTypes: StrutType[] = famOrder.map(([, e], i) => {
    const { ends } = edgeInfo[e]
    const cf = byLength.reps[byLength.of[e]]
    const [a, b] = edgeList[e][1]
    const symmetric = Math.abs(ends[1] - ends[0]) < 1e-6
    return {
      label: letter(i),
      index: i,
      kind: 'whole',
      parent: null,
      chordFactor: cf,
      length: cf * R,
      centralAngle: Math.acos(Math.max(-1, Math.min(1, dot(normalize(sv[a]), normalize(sv[b]))))) * DEG,
      endAngle: ends[0],
      endAngle2: symmetric ? null : ends[1],
      cutAngle: null,
      count: 0,
    }
  })

  // A panel family is its sides and corners in order around it: the same
  // ring read from any starting corner. Read the other way round, it is the
  // panel's mirror image, which is a different part when the two faces differ.
  const sides = (f: readonly number[]) => ring(f).map(([a, b]) => typeOfEdge.get(edgeKey(a, b))!)
  const ringKey = (f: readonly number[]) => {
    const types = sides(f)
    const angles = shape(f.map((v) => sv[v])).angles
    return canonicalCycle(types.map((t, i) => `${t}:${Math.round(angles[i] * 1e4)}`))
  }
  const faceFamily = new Map<string, number>()
  const familyFirst: { face: number; start: number; key: string; mirrorKey: string }[] = []
  const srcFaceFamily = src.faces.map((f, fi) => {
    const c = ringKey(f)
    let t = faceFamily.get(c.key)
    if (t === undefined) {
      t = familyFirst.push({ face: fi, start: c.start, key: c.key, mirrorKey: ringKey([...f].reverse()).key }) - 1
      faceFamily.set(c.key, t)
    }
    return t
  })
  const sigOf = (types: number[]) => [...types].sort((a, b) => a - b).map((t) => strutTypes[t].label)
  // Whole panels named in the order of their struts: AAB before ABB; mirror pairs side by side.
  const familyOrder = familyFirst
    .map((_, t) => t)
    .sort(
      (a, b) =>
        src.faces[familyFirst[a].face].length - src.faces[familyFirst[b].face].length ||
        sigOf(sides(src.faces[familyFirst[a].face])).join().localeCompare(sigOf(sides(src.faces[familyFirst[b].face])).join()) ||
        [familyFirst[a].key, familyFirst[a].mirrorKey].sort()[0].localeCompare([familyFirst[b].key, familyFirst[b].mirrorKey].sort()[0]) ||
        familyFirst[a].key.localeCompare(familyFirst[b].key),
    )
  const rankOfFamily = new Array<number>(familyFirst.length)
  familyOrder.forEach((t, r) => (rankOfFamily[t] = r))
  const faceTypes: FaceType[] = familyOrder.map((t, r) => {
    const { face, start, mirrorKey } = familyFirst[t]
    const f0 = src.faces[face]
    const f = f0.map((_, i) => f0[(start + i) % f0.length])
    const edges = sides(f)
    const s = shape(f.map((v) => sv[v]))
    const labels = sigOf(edges)
    const mirror = faceFamily.get(mirrorKey)
    return {
      label: `P${r + 1}`,
      index: r,
      kind: 'whole',
      parent: null,
      mirrorOf: mirror === undefined || mirror === t ? null : rankOfFamily[mirror],
      signature: labels.join(labels.some((l) => l.length > 1) ? '·' : ''),
      struts: edges.map((e) => strutTypes[e].label),
      edges,
      area: s.area * R * R,
      angles: s.angles,
      outline: s.outline,
      count: 0,
    }
  })

  // ---- The cut: the panels kept, whole or clipped.
  const hubCorner = (v: number): Corner => ({ id: `v${v}`, pos: sv[v], hub: v })
  const crossing = (p: number, r: number): Corner => {
    const [a, b] = p < r ? [p, r] : [r, p]
    const t = (zc - sv[a][2]) / (sv[b][2] - sv[a][2])
    return { id: `x${a}-${b}`, pos: add(sv[a], scale(sub(sv[b], sv[a]), t)), edge: [a, b] }
  }
  const kept: { corners: Corner[]; whole: boolean; family: number }[] = []
  src.faces.forEach((f, fi) => {
    const s = f.map((v) => side[v])
    const family = rankOfFamily[srcFaceFamily[fi]]
    // A panel lying in the plane itself (the Goldberg floor at cut 1) is kept.
    const above = s.some((x) => x > 0) || s.every((x) => x === 0)
    if (!above) return
    if (mode === 'include' || s.every((x) => x >= 0)) {
      kept.push({ corners: f.map(hubCorner), whole: true, family })
      return
    }
    if (mode === 'exclude') return
    // Section: keep the part of the panel on or above the plane.
    const corners: Corner[] = []
    for (let i = 0; i < f.length; i++) {
      const a = f[i]
      const b = f[(i + 1) % f.length]
      if (side[a] >= 0) corners.push(hubCorner(a))
      if (side[a] * side[b] < 0) corners.push(crossing(a, b))
    }
    if (corners.length >= 3) kept.push({ corners, whole: false, family })
  })

  // ---- Nodes.
  const vertices: Vec3[] = []
  const nodeKind: ('hub' | 'cut')[] = []
  const nodeOf = new Map<string, number>()
  const node = (c: Corner) => {
    let n = nodeOf.get(c.id)
    if (n === undefined) {
      n = vertices.push(c.pos) - 1
      nodeKind.push(c.hub === undefined ? 'cut' : 'hub')
      nodeOf.set(c.id, n)
    }
    return n
  }

  // ---- Struts, from the panels' sides.
  interface RawStrut { a: number; b: number; kind: PieceKind; parent: number | null; len: number; cutAngle: number | null; hubDip: number | null }
  const raw: RawStrut[] = []
  const strutOf = new Map<string, number>()
  const use = new Map<string, number>()
  const sideStruts: number[][] = kept.map(({ corners }) =>
    corners.map((c, i) => {
      const d = corners[(i + 1) % corners.length]
      const key = c.id < d.id ? `${c.id}|${d.id}` : `${d.id}|${c.id}`
      use.set(key, (use.get(key) ?? 0) + 1)
      let k = strutOf.get(key)
      if (k === undefined) {
        const a = node(c)
        const b = node(d)
        const len = distance(c.pos, d.pos)
        let s: RawStrut
        if (c.hub !== undefined && d.hub !== undefined) {
          s = { a, b, kind: 'whole', parent: typeOfEdge.get(edgeKey(c.hub, d.hub))!, len, cutAngle: null, hubDip: null }
        } else {
          const x = c.hub === undefined ? c : d
          const h = c.hub === undefined ? d : c
          if (h.hub !== undefined && x.edge!.includes(h.hub)) {
            // A strut of the sphere, trimmed where it crosses the plane.
            const dz = Math.abs(h.pos[2] - x.pos[2])
            s = {
              a,
              b,
              kind: 'cut',
              parent: typeOfEdge.get(edgeKey(...x.edge!))!,
              len,
              cutAngle: Math.asin(Math.min(1, dz / len)) * DEG,
              hubDip: dipAt(h.pos, x.pos),
            }
          } else {
            s = { a, b, kind: 'ring', parent: null, len, cutAngle: null, hubDip: null }
          }
        }
        k = raw.push(s) - 1
        strutOf.set(key, k)
      }
      return k
    }),
  )

  // Cut pieces: one family per parent, length and angle to the plane.
  const cutGroups = new Map<string, { parent: number; len: number; cutAngle: number; hubDip: number; members: number[] }>()
  const ringGroups = new Map<string, { len: number; members: number[] }>()
  const typeOfRaw = new Array<number>(raw.length)
  raw.forEach((s, i) => {
    if (s.kind === 'whole') {
      typeOfRaw[i] = s.parent!
      strutTypes[s.parent!].count++
    } else if (s.kind === 'cut') {
      const key = `${s.parent}|${q(s.len)}|${Math.round(s.cutAngle! * 1e5)}|${Math.round(s.hubDip! * 1e5)}`
      const g = cutGroups.get(key) ?? { parent: s.parent!, len: s.len, cutAngle: s.cutAngle!, hubDip: s.hubDip!, members: [] }
      g.members.push(i)
      cutGroups.set(key, g)
    } else {
      const key = `${q(s.len)}`
      const g = ringGroups.get(key) ?? { len: s.len, members: [] }
      g.members.push(i)
      ringGroups.set(key, g)
    }
  })
  const cutList = [...cutGroups.values()].sort((a, b) => a.parent - b.parent || b.len - a.len)
  cutList.forEach((g) => {
    const siblings = cutList.filter((x) => x.parent === g.parent)
    const t = strutTypes.length
    const p = strutTypes[g.parent]
    strutTypes.push({
      label: primed(p.label, siblings.indexOf(g), siblings.length),
      index: t,
      kind: 'cut',
      parent: g.parent,
      chordFactor: g.len,
      length: g.len * R,
      centralAngle: null,
      endAngle: g.hubDip,
      endAngle2: null,
      cutAngle: g.cutAngle,
      count: g.members.length,
    })
    for (const m of g.members) typeOfRaw[m] = t
  })
  ;[...ringGroups.values()]
    .sort((a, b) => a.len - b.len)
    .forEach((g, i) => {
      const t = strutTypes.length
      strutTypes.push({
        label: `R${i + 1}`,
        index: t,
        kind: 'ring',
        parent: null,
        chordFactor: g.len,
        length: g.len * R,
        centralAngle: null,
        endAngle: null,
        endAngle2: null,
        cutAngle: 0,
        count: g.members.length,
      })
      for (const m of g.members) typeOfRaw[m] = t
    })
  const struts: Strut[] = raw.map((s, i) => ({ a: s.a, b: s.b, type: typeOfRaw[i] }))

  // ---- Panels: whole ones keep their sphere family; clipped ones get their own.
  const faces: Face[] = []
  const cutFaceGroups = new Map<string, { parent: number; first: number; members: number[] }>()
  kept.forEach((k, i) => {
    const v = k.corners.map((c) => nodeOf.get(c.id)!)
    if (k.whole) {
      faces.push({ v, type: k.family })
      faceTypes[k.family].count++
      return
    }
    const sideLens = k.corners.map((c, j) => q(distance(c.pos, k.corners[(j + 1) % k.corners.length].pos))).sort((a, b) => a - b)
    const key = `${k.family}|${k.corners.length}|${sideLens.join(',')}`
    const g = cutFaceGroups.get(key) ?? { parent: k.family, first: i, members: [] }
    g.members.push(faces.length)
    cutFaceGroups.set(key, g)
    faces.push({ v, type: -1 })
  })
  const cutFaceList = [...cutFaceGroups.values()].map((g) => ({ ...g, area: polygonArea(kept[g.first].corners.map((c) => c.pos)) }))
  cutFaceList.sort((a, b) => a.parent - b.parent || b.area - a.area)
  cutFaceList.forEach((g) => {
    const siblings = cutFaceList.filter((x) => x.parent === g.parent)
    const t = faceTypes.length
    const corners = kept[g.first].corners
    const edges = sideStruts[g.first].map((s) => typeOfRaw[s])
    const s = shape(corners.map((c) => c.pos))
    faceTypes.push({
      label: primed(faceTypes[g.parent].label, siblings.indexOf(g), siblings.length),
      index: t,
      kind: 'cut',
      parent: g.parent,
      mirrorOf: null,
      signature: [...edges].sort((a, b) => a - b).map((e) => strutTypes[e].label).join(' '),
      struts: edges.map((e) => strutTypes[e].label),
      edges,
      area: s.area * R * R,
      angles: s.angles,
      outline: s.outline,
      count: g.members.length,
    })
    for (const m of g.members) faces[m].type = t
  })

  // ---- The open edge: struts with a panel on one side only.
  const baseNode = new Set<number>()
  let shoelace = 0
  for (const { corners } of kept) {
    corners.forEach((c, i) => {
      const d = corners[(i + 1) % corners.length]
      const key = c.id < d.id ? `${c.id}|${d.id}` : `${d.id}|${c.id}`
      if (use.get(key) !== 1) return
      baseNode.add(nodeOf.get(c.id)!)
      baseNode.add(nodeOf.get(d.id)!)
      shoelace += c.pos[0] * d.pos[1] - d.pos[0] * c.pos[1]
    })
  }

  // ---- Nodes, classified by what the connector must hold: the arms in
  // order around the node, each with its strut type and angles.
  const neighbours: { to: number; type: number }[][] = vertices.map(() => [])
  for (const s of struts) {
    neighbours[s.a].push({ to: s.b, type: s.type })
    neighbours[s.b].push({ to: s.a, type: s.type })
  }
  /** The arms of node v, counter-clockwise seen from outside, unrotated. */
  const armsAt = (v: number): HubArm[] => {
    const p = vertices[v]
    // A hub's axis is the sphere's radius; a cut point's is the plane's normal.
    const n: Vec3 = nodeKind[v] === 'cut' ? [0, 0, 1] : normalize(p)
    const sign = nodeKind[v] === 'cut' ? 1 : -1
    const ref = Math.abs(n[2]) < 0.9 ? ([0, 0, 1] as Vec3) : ([1, 0, 0] as Vec3)
    const e1 = normalize(sub(ref, scale(n, dot(ref, n))))
    const e2 = cross(n, e1)
    const raw = neighbours[v].map(({ to, type }) => {
      const d = normalize(sub(vertices[to], p))
      const along = dot(d, n)
      return { type, d, dip: Math.asin(Math.max(-1, Math.min(1, sign * along))) * DEG, az: Math.atan2(dot(d, e2), dot(d, e1)) }
    })
    raw.sort((a, b) => a.az - b.az)
    return raw.map((a, i) => {
      const b = raw[(i + 1) % raw.length]
      let turn = ((b.az - a.az) * DEG + 360) % 360
      if (raw.length === 1) turn = 360
      const between = raw.length === 1 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(a.d, b.d)))) * DEG
      return { strut: strutTypes[a.type].label, type: a.type, dip: a.dip, turn, between }
    })
  }
  const armKey = (a: HubArm) => `${a.type}:${Math.round(a.dip * 1e4)}:${Math.round(a.turn * 1e4)}`
  /** The rotation of a cyclic arm list that reads first, and its key. */
  const canonical = (arms: HubArm[]) => {
    let best = { key: '', at: 0 }
    for (let r = 0; r < arms.length; r++) {
      const key = arms.map((_, i) => armKey(arms[(r + i) % arms.length])).join('|')
      if (r === 0 || key < best.key) best = { key, at: r }
    }
    return { key: best.key, arms: arms.map((_, i) => arms[(best.at + i) % arms.length]) }
  }
  /** The same connector seen in a mirror: order reversed, each turn now leading to the previous arm. */
  const mirror = (arms: HubArm[]): HubArm[] => {
    const n = arms.length
    return arms.map((_, i) => {
      const a = arms[n - 1 - i]
      const prev = arms[(2 * n - 2 - i) % n]
      return { ...a, turn: prev.turn, between: prev.between }
    })
  }

  const nodeGroups = new Map<string, { kind: 'hub' | 'cut'; base: boolean; arms: HubArm[]; mirrorKey: string; members: number[] }>()
  vertices.forEach((_, v) => {
    const base = baseNode.has(v)
    const arms = armsAt(v)
    const c = canonical(arms)
    const key = `${nodeKind[v]}|${base ? 'b' : 'i'}|${c.key}`
    let g = nodeGroups.get(key)
    if (!g) {
      g = { kind: nodeKind[v], base, arms: c.arms, mirrorKey: `${nodeKind[v]}|${base ? 'b' : 'i'}|${canonical(mirror(arms)).key}`, members: [] }
      nodeGroups.set(key, g)
    }
    g.members.push(v)
  })
  const sortedLabels = (arms: HubArm[]) => [...arms].sort((a, b) => a.type - b.type).map((a) => a.strut)
  const groupList = [...nodeGroups.entries()].sort(
    ([ka, a], [kb, b]) =>
      Number(a.kind === 'cut') - Number(b.kind === 'cut') ||
      Number(a.base) - Number(b.base) ||
      b.arms.length - a.arms.length ||
      sortedLabels(a.arms).join().localeCompare(sortedLabels(b.arms).join()) ||
      ka.localeCompare(kb),
  )
  const indexOfKey = new Map(groupList.map(([k], i) => [k, i]))
  const hubs: Hub[] = new Array(vertices.length)
  let hubN = 0
  let cutN = 0
  const hubTypes: HubType[] = groupList.map(([key, g], i) => {
    for (const v of g.members) hubs[v] = { type: i, kind: g.kind, valence: g.arms.length, base: g.base }
    const label = g.kind === 'hub' ? `H${++hubN}` : `X${++cutN}`
    const m = indexOfKey.get(g.mirrorKey)
    return {
      label,
      index: i,
      kind: g.kind,
      valence: g.arms.length,
      struts: sortedLabels(g.arms),
      arms: g.arms,
      mirrorOf: g.mirrorKey === key || m === undefined ? null : m,
      base: g.base,
      count: g.members.length,
    }
  })

  // ---- The drawing of one base face. Geodesic: the subdivided triangle,
  // corner hubs marked. Goldberg: the same triangle with its dual inside, one
  // point per small triangle, half-edges running out to the face's border.
  const V = sphere.frequency
  const schemaPoints: FaceSchema['points'] = []
  const schemaEdges: FaceSchema['edges'] = []
  const sphereValence = new Array<number>(sphere.vertices.length).fill(0)
  for (const f of sphere.faces) for (const [a] of ring(f)) sphereValence[a]++
  if (pattern === 'goldberg') {
    // Which two triangles share each sphere strut.
    const facesOf = new Map<string, number[]>()
    sphere.faces.forEach((f, fi) => ring(f).forEach(([a, b]) => facesOf.set(edgeKey(a, b), [...(facesOf.get(edgeKey(a, b)) ?? []), fi])))
    const pointOfFace = new Map<number, number>()
    for (const t of sphere.firstTriangles) {
      pointOfFace.set(t.face, schemaPoints.length)
      schemaPoints.push(t.up ? { i: t.i + 1 / 3, j: t.j + 1 / 3 } : { i: t.i + 2 / 3, j: t.j + 2 / 3 })
    }
    // The pentagon (or square) centres at the face's corners.
    for (const [i, j] of [[0, 0], [V, 0], [0, V]]) schemaPoints.push({ i, j, mark: sphereValence[sphere.firstFace.get(`${i},${j}`)!] })
    const done = new Set<string>()
    const ij = (v: number) => [...sphere.firstFace.entries()].find(([, x]) => x === v)![0].split(',').map(Number)
    for (const t of sphere.firstTriangles) {
      for (const [a, b] of ring(sphere.faces[t.face])) {
        const k = edgeKey(a, b)
        if (done.has(k)) continue
        done.add(k)
        const [f1, f2] = facesOf.get(k)!
        const other = f1 === t.face ? f2 : f1
        const type = typeOfEdge.get(edgeKey(t.face, other))!
        if (pointOfFace.has(other)) {
          schemaEdges.push({ from: pointOfFace.get(t.face)!, to: pointOfFace.get(other)!, type })
        } else {
          // The neighbour is on the next face: run to the border, halfway along the strut it crosses.
          const [ia, ja] = ij(a)
          const [ib, jb] = ij(b)
          schemaEdges.push({ from: pointOfFace.get(t.face)!, to: schemaPoints.push({ i: (ia + ib) / 2, j: (ja + jb) / 2 }) - 1, type })
        }
      }
    }
  } else {
    const pointAt = new Map<string, number>()
    for (let i = 0; i <= V; i++) {
      for (let j = 0; i + j <= V; j++) {
        pointAt.set(`${i},${j}`, schemaPoints.length)
        const valence = sphereValence[sphere.firstFace.get(`${i},${j}`)!]
        schemaPoints.push({ i, j, mark: valence < 6 ? valence : undefined })
      }
    }
    const link = (i1: number, j1: number, i2: number, j2: number) => {
      const a = sphere.firstFace.get(`${i1},${j1}`)!
      const b = sphere.firstFace.get(`${i2},${j2}`)!
      schemaEdges.push({ from: pointAt.get(`${i1},${j1}`)!, to: pointAt.get(`${i2},${j2}`)!, type: typeOfEdge.get(edgeKey(a, b))! })
    }
    for (let i = 0; i < V; i++) {
      for (let j = 0; i + j < V; j++) {
        link(i, j, i + 1, j)
        link(i, j, i, j + 1)
        link(i + 1, j, i, j + 1)
      }
    }
  }

  // ---- Measurements.
  const isClosed = baseNode.size === 0
  const baseZs = [...baseNode].map((v) => vertices[v][2])
  const lowest = vertices.length ? Math.min(...vertices.map((v) => v[2])) : 1
  const centre: Vec3 = isClosed ? [0, 0, 0] : [0, 0, baseZs.reduce((s, z) => s + z, 0) / baseZs.length]
  let volume = 0
  let surface = 0
  for (const { corners } of kept) {
    const p = corners.map((c) => c.pos)
    surface += polygonArea(p)
    for (let i = 1; i < p.length - 1; i++) {
      volume += dot(sub(p[0], centre), cross(sub(p[i], centre), sub(p[i + 1], centre))) / 6
    }
  }
  const baseRadius = isClosed ? 0 : Math.max(...[...baseNode].map((v) => Math.hypot(vertices[v][0], vertices[v][1])))
  const kindCount = (k: PieceKind) => raw.filter((s) => s.kind === k).length

  return {
    params: { ...params, frequency: V, cut, mode, pattern },
    vertices,
    struts,
    faces,
    hubs,
    strutTypes,
    faceTypes,
    hubTypes,
    cutZ: zc,
    flatCuts: flatCuts(src),
    schema: { frequency: V, pattern, points: schemaPoints, edges: schemaEdges },
    stats: {
      hubs: vertices.length,
      struts: struts.length,
      faces: faces.length,
      height: (1 - lowest) * R,
      baseDiameter: 2 * baseRadius * R,
      baseDeviation: isClosed ? 0 : (Math.max(...baseZs) - Math.min(...baseZs)) * R,
      floorArea: (Math.abs(shoelace) / 2) * R * R,
      surfaceArea: surface * R * R,
      volume: Math.abs(volume) * R * R * R,
      totalStrutLength: raw.reduce((s, x) => s + x.len, 0) * R,
      euler: vertices.length - struts.length + faces.length,
      cutStruts: kindCount('cut'),
      ringStruts: kindCount('ring'),
      cutFaces: faces.filter((f) => faceTypes[f.type].kind === 'cut').length,
      cutPoints: nodeKind.filter((k) => k === 'cut').length,
    },
  }
}
