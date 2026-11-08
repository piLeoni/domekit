import { describe, expect, it } from 'vitest'
import { generateDome, letter, type CutMode, type Dome } from './index'
import { cross, dot, normalize, sub } from './vec'

type Solid = 'icosahedron' | 'octahedron'
const dome = (frequency: number, cut: number, mode: CutMode = 'exclude', solid: Solid = 'icosahedron', radius = 1) =>
  generateDome({ frequency, radius, solid, cut, mode })
const sphere = (v: number, solid: Solid = 'icosahedron') => dome(v, 1, 'exclude', solid)
const whole = (d: Dome) => d.strutTypes.filter((t) => t.kind === 'whole')
const counts = (d: Dome) => whole(d).map((t) => t.count)

describe('full sphere', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('icosahedron %iV has 10V²+2 hubs, 30V² struts, 20V² panels', (v) => {
    const d = sphere(v)
    expect(d.stats.hubs).toBe(10 * v * v + 2)
    expect(d.stats.struts).toBe(30 * v * v)
    expect(d.stats.faces).toBe(20 * v * v)
    expect(d.stats.euler).toBe(2)
  })

  it.each([1, 2, 3, 4, 5])('octahedron %iV has 4V²+2 hubs', (v) => {
    const d = sphere(v, 'octahedron')
    expect(d.stats.hubs).toBe(4 * v * v + 2)
    expect(d.stats.struts).toBe(12 * v * v)
    expect(d.stats.euler).toBe(2)
  })

  it.each(['exclude', 'include', 'section'] as const)('is the same in every mode (%s)', (mode) => {
    const d = dome(3, 1, mode)
    expect(d.stats.struts).toBe(270)
    expect(d.stats.cutStruts + d.stats.ringStruts + d.stats.cutFaces).toBe(0)
  })

  it('winds every panel outward', () => {
    const d = sphere(4)
    for (const f of d.faces) {
      const [a, b, c] = f.v.map((i) => d.vertices[i])
      expect(dot(cross(sub(b, a), sub(c, a)), a)).toBeGreaterThan(0)
    }
  })

  it('has twelve 5-way hubs and the rest 6-way', () => {
    const d = sphere(4)
    expect(d.hubs.filter((h) => h.valence === 5).length).toBe(12)
    expect(d.hubs.filter((h) => h.valence === 6).length).toBe(d.hubs.length - 12)
  })
})

describe('chord factors (Desert Domes tables)', () => {
  const cf = (v: number) => whole(sphere(v)).map((t) => t.chordFactor)
  it('2V', () => expect(cf(2)).toEqual([expect.closeTo(0.54653, 5), expect.closeTo(0.61803, 5)]))
  it('3V', () =>
    expect(cf(3)).toEqual([expect.closeTo(0.34862, 5), expect.closeTo(0.40355, 5), expect.closeTo(0.41241, 5)]))
  it('4V', () =>
    expect(cf(4)).toEqual([0.25318, 0.29453, 0.29524, 0.29859, 0.31287, 0.32492].map((x) => expect.closeTo(x, 5))))
})

describe('exclude', () => {
  it('2V hemisphere: 30 A + 35 B, 26 hubs, flat base', () => {
    const d = dome(2, 0.5)
    expect(counts(d)).toEqual([30, 35])
    expect(d.stats.hubs).toBe(26)
    expect(d.stats.faces).toBe(40)
    expect(d.stats.euler).toBe(1)
    expect(d.stats.baseDeviation).toBeCloseTo(0, 9)
  })

  it('3V 5/8: 30 A + 55 B + 80 C, stepped base', () => {
    const d = dome(3, 0.625)
    expect(counts(d)).toEqual([30, 55, 80])
    expect(d.stats.baseDeviation).toBeGreaterThan(0.01)
  })

  it('4V hemisphere has 250 struts and 91 hubs', () => {
    const d = dome(4, 0.5)
    expect(d.stats.struts).toBe(250)
    expect(d.stats.hubs).toBe(91)
  })

  it('keeps strut letters whatever the cut', () => {
    expect(whole(dome(4, 0.2)).map((t) => t.chordFactor)).toEqual(whole(sphere(4)).map((t) => t.chordFactor))
  })

  it('lists the flat-base cuts, and they are flat', () => {
    for (const { cut } of dome(4, 0.5).flatCuts) expect(dome(4, cut).stats.baseDeviation).toBeCloseTo(0, 6)
    for (let v = 1; v <= 6; v++) expect(dome(v, 0.5, 'exclude', 'octahedron').stats.baseDeviation).toBeCloseTo(0, 9)
  })
})

describe('include', () => {
  it('keeps every panel that reaches above the plane, whole', () => {
    const ex = dome(3, 0.625, 'exclude')
    const inc = dome(3, 0.625, 'include')
    expect(inc.stats.faces).toBeGreaterThan(ex.stats.faces)
    expect(inc.stats.cutStruts + inc.stats.cutFaces).toBe(0)
    const zc = inc.cutZ
    for (const f of inc.faces) expect(Math.max(...f.v.map((v) => inc.vertices[v][2]))).toBeGreaterThan(zc)
  })
})

describe('section', () => {
  const d = dome(3, 0.625, 'section', 'icosahedron', 3)

  it('lands exactly on the plane: flat base, height = cut × diameter', () => {
    expect(d.stats.baseDeviation).toBeCloseTo(0, 9)
    expect(d.stats.height).toBeCloseTo(0.625 * 6, 9)
    for (const v of d.vertices) expect(v[2]).toBeGreaterThanOrEqual(d.cutZ - 1e-9)
  })

  it('makes cut struts, a closed base ring, and clipped panels', () => {
    expect(d.stats.cutStruts).toBeGreaterThan(0)
    expect(d.stats.cutFaces).toBeGreaterThan(0)
    expect(d.stats.cutPoints).toBe(d.stats.cutStruts)
    // Every cut point closes the ring: one trimmed strut, two ring struts.
    for (const h of d.hubs.filter((h) => h.kind === 'cut')) expect(h.valence).toBe(3)
    expect(d.stats.euler).toBe(1)
  })

  it('names pieces after what they were cut from, and they are shorter', () => {
    for (const t of d.strutTypes.filter((t) => t.kind === 'cut')) {
      const p = d.strutTypes[t.parent!]
      expect(t.label.startsWith(`${p.label}′`)).toBe(true)
      expect(t.chordFactor).toBeLessThan(p.chordFactor)
    }
    for (const t of d.faceTypes.filter((t) => t.kind === 'cut')) {
      expect(t.label.startsWith(`${d.faceTypes[t.parent!].label}′`)).toBe(true)
      expect([3, 4]).toContain(t.outline.length)
    }
  })

  it('sits between exclude and include', () => {
    const ex = dome(3, 0.625, 'exclude', 'icosahedron', 3)
    const inc = dome(3, 0.625, 'include', 'icosahedron', 3)
    expect(d.stats.surfaceArea).toBeGreaterThan(ex.stats.surfaceArea)
    expect(d.stats.surfaceArea).toBeLessThan(inc.stats.surfaceArea)
  })

  it('equals exclude when the plane runs through a ring of hubs', () => {
    const s = dome(2, 0.5, 'section')
    expect(s.stats.cutStruts + s.stats.ringStruts + s.stats.cutFaces).toBe(0)
    expect(counts(s)).toEqual([30, 35])
  })

  it.each([2, 4, 5, 6])('%iV: counts every piece once, panels wound outward', (v) => {
    const s = dome(v, 0.37, 'section')
    expect(s.strutTypes.reduce((n, t) => n + t.count, 0)).toBe(s.stats.struts)
    expect(s.faceTypes.reduce((n, t) => n + t.count, 0)).toBe(s.stats.faces)
    expect(s.hubTypes.reduce((n, t) => n + t.count, 0)).toBe(s.stats.hubs)
    for (const f of s.faces) {
      const [a, b, c] = f.v.map((i) => s.vertices[i])
      expect(dot(cross(sub(b, a), sub(c, a)), a)).toBeGreaterThan(0)
    }
  })
})

describe('measurements', () => {
  it('scale with the radius', () => {
    const a = sphere(3)
    const b = dome(3, 1, 'exclude', 'icosahedron', 2)
    expect(whole(b)[0].length).toBeCloseTo(2 * whole(a)[0].length, 9)
    expect(b.stats.surfaceArea).toBeCloseTo(4 * a.stats.surfaceArea, 9)
    expect(b.stats.volume).toBeCloseTo(8 * a.stats.volume, 9)
    expect(a.stats.volume).toBeLessThan((4 / 3) * Math.PI)
    expect(a.stats.volume).toBeGreaterThan(0.9 * (4 / 3) * Math.PI)
  })
})

describe('letter', () => {
  it('runs A…Z, AA…', () => {
    expect([0, 1, 25, 26, 27].map(letter)).toEqual(['A', 'B', 'Z', 'AA', 'AB'])
  })
})

describe('hub angles', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  it('a 5-way hub of the full sphere: five A struts, 72° apart, all dipping the same', () => {
    const d = sphere(3)
    const five = d.hubTypes.find((t) => t.valence === 5)!
    expect(five.struts).toEqual(['A', 'A', 'A', 'A', 'A'])
    for (const a of five.arms) {
      expect(a.turn).toBeCloseTo(72, 6)
      expect(a.dip).toBeCloseTo(d.strutTypes[0].endAngle!, 6)
    }
  })

  it('arms of an inner hub go once around: turns add up to 360°', () => {
    const d = dome(5, 0.5)
    for (const t of d.hubTypes.filter((t) => !t.base)) expect(sum(t.arms.map((a) => a.turn))).toBeCloseTo(360, 6)
  })

  it('every whole strut dips by its end angle at a hub', () => {
    const d = dome(4, 0.5)
    for (const t of d.hubTypes) for (const a of t.arms) expect(a.dip).toBeCloseTo(d.strutTypes[a.type].endAngle!, 6)
  })

  it('splits hubs with the same struts in a different order', () => {
    const d = sphere(6)
    const byStruts = new Set(d.hubTypes.map((t) => t.struts.join()))
    expect(d.hubTypes.length).toBeGreaterThanOrEqual(byStruts.size)
  })

  it('pairs mirror images both ways', () => {
    for (const d of [sphere(5), dome(6, 0.37, 'section'), dome(7, 0.5)]) {
      for (const t of d.hubTypes) if (t.mirrorOf != null) expect(d.hubTypes[t.mirrorOf].mirrorOf).toBe(t.index)
    }
  })

  it('cut points: arms measured from the tangent plane, like every hub (axis = sphere radius)', () => {
    for (const d of [dome(3, 0.625, 'section'), dome(2, 0.6, 'section'), dome(4, 0.37, 'section')]) {
      for (const [v, h] of d.hubs.entries()) {
        if (h.kind !== 'cut') continue
        const p = d.vertices[v]
        const n = normalize(p)
        const expected = d.struts
          .filter((s) => s.a === v || s.b === v)
          .map((s) => Math.asin(-dot(normalize(sub(d.vertices[s.a === v ? s.b : s.a], p)), n)) * (180 / Math.PI))
          .sort((x, y) => x - y)
        const got = d.hubTypes[h.type].arms.map((a) => a.dip).sort((x, y) => x - y)
        got.forEach((g, i) => expect(g).toBeCloseTo(expected[i], 6))
      }
    }
  })
})

describe('goldberg', () => {
  const gb = (frequency: number, cut = 1, mode: CutMode = 'exclude', solid: Solid = 'icosahedron') =>
    generateDome({ frequency, radius: 1, solid, cut, mode, pattern: 'goldberg' })

  it.each([1, 2, 3, 4, 6])('%iV: 12 pentagons, the rest hexagons, three struts at every node', (v) => {
    const d = gb(v)
    expect(d.stats.faces).toBe(10 * v * v + 2)
    expect(d.stats.hubs).toBe(20 * v * v)
    expect(d.stats.struts).toBe(30 * v * v)
    expect(d.faces.filter((f) => f.v.length === 5).length).toBe(12)
    expect(d.faces.filter((f) => f.v.length === 6).length).toBe(10 * v * v - 10)
    expect(d.hubs.every((h) => h.valence === 3)).toBe(true)
    expect(d.stats.euler).toBe(2)
  })

  it('1V is the regular dodecahedron: one strut length, one panel', () => {
    const d = gb(1)
    expect(whole(d).length).toBe(1)
    expect(d.faceTypes.length).toBe(1)
    for (const a of d.faceTypes[0].angles) expect(a).toBeCloseTo(108, 9)
  })

  it.each([3, 5])('%iV: every panel is flat and tangent to the sphere', (v) => {
    const d = gb(v)
    for (const f of d.faces) {
      const p = f.v.map((i) => d.vertices[i])
      const n = cross(sub(p[1], p[0]), sub(p[2], p[0]))
      const len = Math.hypot(...n)
      const u = n.map((x) => x / len) as [number, number, number]
      // Flat: every corner on the plane of the first three.
      for (const q of p) expect(dot(u, sub(q, p[0]))).toBeCloseTo(0, 9)
      // Tangent: that plane is at distance 1 (the radius) from the centre.
      expect(dot(u, p[0])).toBeCloseTo(1, 9)
    }
  })

  it('panels wind outward', () => {
    const d = gb(4)
    for (const f of d.faces) {
      const [a, b, c] = f.v.map((i) => d.vertices[i])
      expect(dot(cross(sub(b, a), sub(c, a)), a)).toBeGreaterThan(0)
    }
  })

  it('struts can meet their two ends at different angles', () => {
    const d = gb(4)
    for (const t of whole(d)) if (t.endAngle2 != null) expect(t.endAngle2).toBeGreaterThan(t.endAngle!)
    for (const h of d.hubTypes) for (const a of h.arms) {
      const t = d.strutTypes[a.type]
      expect([t.endAngle, t.endAngle2 ?? t.endAngle].some((e) => Math.abs(e! - a.dip) < 1e-6)).toBe(true)
    }
  })

  it('cuts like the geodesic dome: section lands flat, at the exact height', () => {
    const d = gb(4, 0.6, 'section')
    expect(d.stats.baseDeviation).toBeCloseTo(0, 9)
    expect(d.stats.height).toBeCloseTo(1.2, 9)
    expect(d.stats.cutFaces).toBeGreaterThan(0)
    expect(d.stats.euler).toBe(1)
    expect(d.faceTypes.reduce((n, t) => n + t.count, 0)).toBe(d.stats.faces)
    expect(d.strutTypes.reduce((n, t) => n + t.count, 0)).toBe(d.stats.struts)
  })

  it('octahedral Goldberg has six squares', () => {
    const d = gb(3, 1, 'exclude', 'octahedron')
    expect(d.faces.filter((f) => f.v.length === 4).length).toBe(6)
  })
})

describe('panel mirror pairs', () => {
  it('pair both ways, and appear in scalene geodesic panels from 5V', () => {
    const d = sphere(6)
    const paired = d.faceTypes.filter((t) => t.mirrorOf != null)
    expect(paired.length).toBeGreaterThan(0)
    for (const t of paired) expect(d.faceTypes[t.mirrorOf!].mirrorOf).toBe(t.index)
  })
})
