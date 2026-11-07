import { cross, dot, normalize, sub, type Vec3 } from './vec'

export type BaseSolid = 'icosahedron' | 'octahedron'

export interface Polyhedron {
  vertices: Vec3[]
  /** Triangles, wound counter-clockwise seen from outside. */
  faces: [number, number, number][]
}

/** Make every face wind outward, whatever order it was written in. */
function orientOutward(p: Polyhedron): Polyhedron {
  const faces = p.faces.map(([a, b, c]) => {
    const [va, vb, vc] = [p.vertices[a], p.vertices[b], p.vertices[c]]
    const n = cross(sub(vb, va), sub(vc, va))
    return dot(n, va) >= 0 ? ([a, b, c] as [number, number, number]) : ([a, c, b] as [number, number, number])
  })
  return { vertices: p.vertices, faces }
}

/**
 * Icosahedron with a vertex at the zenith (+z): the usual dome orientation, a
 * pentagon hub on top, five-fold symmetry about the vertical axis.
 */
function icosahedron(): Polyhedron {
  const v: Vec3[] = [[0, 0, 1]]
  const z = 1 / Math.sqrt(5)
  const r = 2 / Math.sqrt(5)
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5
    v.push([r * Math.cos(a), r * Math.sin(a), z])
  }
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) * 2 * Math.PI) / 5
    v.push([r * Math.cos(a), r * Math.sin(a), -z])
  }
  v.push([0, 0, -1])
  const f: [number, number, number][] = []
  for (let i = 0; i < 5; i++) {
    const u0 = 1 + i
    const u1 = 1 + ((i + 1) % 5)
    const l0 = 6 + i
    const l1 = 6 + ((i + 1) % 5)
    f.push([0, u0, u1]) // cap
    f.push([u0, l0, u1]) // upper band
    f.push([u1, l0, l1]) // lower band
    f.push([11, l1, l0]) // bottom cap
  }
  return orientOutward({ vertices: v.map(normalize), faces: f })
}

/** Octahedron with a vertex at the zenith: every frequency has a flat equator. */
function octahedron(): Polyhedron {
  const v: Vec3[] = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ]
  const f: [number, number, number][] = []
  for (let i = 0; i < 4; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % 4)
    f.push([0, a, b], [5, b, a])
  }
  return orientOutward({ vertices: v, faces: f })
}

export function basePolyhedron(solid: BaseSolid): Polyhedron {
  return solid === 'octahedron' ? octahedron() : icosahedron()
}
