import { describe, expect, it } from 'vitest'
import { buildConstruction, buildStep, defaultDims, type Build, type Technique } from './build'
import { generateDome } from './generate'
import { buildSheets } from './sheets'
import { loopNormal, volume, type Solid } from './solid'
import type { DomeParams } from './types'
import { cross, dot, normalize, sub } from './vec'

const DOMES: DomeParams[] = [
  { frequency: 3, radius: 3, solid: 'icosahedron', cut: 0.625, mode: 'exclude' },
  { frequency: 4, radius: 3, solid: 'icosahedron', cut: 0.55, mode: 'section' },
  { frequency: 3, radius: 3, solid: 'icosahedron', pattern: 'goldberg', cut: 0.5, mode: 'include' },
  { frequency: 2, radius: 2, solid: 'octahedron', cut: 1, mode: 'exclude' },
]
const TECHS: Technique[] = ['panels', 'folded', 'lapped', 'mitre1', 'mitre2', 'frames', 'pipe', 'plates', 'timber']

/** Each directed edge once, and its reverse once: a closed, consistently oriented surface. */
function closed(s: Solid) {
  const seen = new Map<string, number>()
  for (const face of s.faces)
    for (const loop of face)
      loop.forEach((a, i) => {
        const k = `${a}>${loop[(i + 1) % loop.length]}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      })
  for (const [k, c] of seen) {
    if (c !== 1) return false
    const [a, b] = k.split('>')
    if (seen.get(`${b}>${a}`) !== 1) return false
  }
  return true
}

function planar(s: Solid) {
  return s.faces.every((face) => {
    const n = normalize(loopNormal(s.points, face[0]))
    const p0 = s.points[face[0][0]]
    return face.every((loop) => loop.every((i) => Math.abs(dot(sub(s.points[i], p0), n)) < 1e-9))
  })
}

describe('constructions', () => {
  for (const params of DOMES)
    for (const t of TECHS) {
      const dome = generateDome(params)
      const build = buildConstruction(dome, t, {}, 'm') as Build
      it(`${t} on ${params.pattern ?? 'geodesic'} ${params.frequency}V ${params.mode}: closed, outward, planar solids`, () => {
        expect(build.solids.length).toBeGreaterThan(0)
        for (const s of build.solids) {
          expect(closed(s.solid)).toBe(true)
          expect(volume(s.solid)).toBeGreaterThan(0)
          expect(planar(s.solid)).toBe(true)
        }
      })
      it(`${t} on ${params.pattern ?? 'geodesic'} ${params.frequency}V ${params.mode}: every part placed, counts match`, () => {
        for (const s of build.solids) if (s.kind) expect(s.part).not.toBeNull()
        for (const p of build.parts) {
          const placed = build.solids.filter((s) => s.part === build.parts.indexOf(p))
          // Pipe and plate struts: two tabs and a tube. Frames: a beam per side. Star hubs: a tube and a fin per arm.
          if ((t === 'frames' || t.startsWith('mitre')) && p.name === 'Frame') expect(placed.length).toBe(p.qty * dome.faceTypes[p.index].outline.length)
          else if (t === 'timber' && p.kind === 'hub') expect(placed.length).toBe(p.qty * (1 + dome.hubTypes[p.index].valence))
          // Sheet metal: the skin, plus a flange on every side or a lap on some.
          else if (t === 'folded') expect(placed.length).toBe(p.qty * (1 + dome.faceTypes[p.index].outline.length))
          else if (t === 'lapped') expect(placed.length % p.qty).toBe(0)
          else expect(placed.length).toBe(p.qty * ((t === 'pipe' || t === 'plates') && p.kind === 'strut' ? 3 : 1))
        }
      })
    }

  it('panel inner faces lie one sheet thickness inside the outer faces', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'panels', { thickness: 25 }, 'm')!
    for (const s of build.solids) {
      const pts = s.solid.points
      const m = pts.length / 2
      const n = normalize(loopNormal(pts, s.solid.faces[0][0]))
      for (let i = 0; i < m; i++) expect(dot(sub(pts[i], pts[m + i]), n)).toBeCloseTo(0.025, 9)
    }
  })

  it('panel corners move toward the centre, so neighbouring panels meet flush', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'panels', {}, 'm')!
    for (const s of build.solids.filter((x) => x.kind === 'panel')) {
      const pts = s.solid.points
      const m = pts.length / 2
      for (let i = 0; i < m; i++) {
        const cos = dot(normalize(pts[i]), normalize(pts[m + i]))
        expect(cos).toBeCloseTo(1, 9)
      }
    }
  })

  it('flattened pipe: hole to hole is the node-to-node length, give or take the bends', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'pipe', {}, 'm')!
    for (const p of build.parts) {
      const hole = Number(p.facts.rows.find((r) => r[0] === 'Hole to hole')![1]!.split(' ')[0])
      const node = dome.strutTypes[p.index].length * 1000
      expect(Math.abs(hole - node)).toBeLessThan(5)
    }
  })

  it('plate hubs: tubes are shorter than node to node by about two hole distances', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'plates', { circle: 60 }, 'm')!
    for (const p of build.parts.filter((x) => x.kind === 'strut')) {
      const hole = Number(p.facts.rows.find((r) => r[0] === 'Hole to hole')![1]!.split(' ')[0])
      const node = dome.strutTypes[p.index].length * 1000
      expect(node - hole).toBeGreaterThan(110)
      expect(node - hole).toBeLessThan(125)
    }
  })

  it('warns when the sheet is too thick for the panels', () => {
    const dome = generateDome({ frequency: 6, radius: 0.5, solid: 'icosahedron', cut: 0.5, mode: 'exclude' })
    expect(buildConstruction(dome, 'panels', { thickness: 600 }, 'm')!.warnings.length).toBeGreaterThan(0)
    expect(buildConstruction(dome, 'panels', { thickness: 3 }, 'm')!.warnings.length).toBe(0)
  })

  it('frame beams sit face to face with their neighbours: each outer side on the shared cut plane', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'frames', {}, 'm')!
    // Every beam's outer side lies on a plane through the dome centre (no base in exclude mode).
    for (const s of build.solids.filter((x) => x.name.includes('-beam'))) {
      const [t0, t1, , , b0] = s.solid.points
      const n = normalize(cross(t0, t1))
      expect(Math.abs(dot(n, b0))).toBeLessThan(1e-9)
    }
  })

  it('star hubs: square-cut beams shorter than node to node by about a tube diameter plus two gaps', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'timber', { tube: 60, gap: 5 }, 'm')!
    for (const p of build.parts.filter((x) => x.kind === 'strut')) {
      const cut = Number(p.facts.rows.find((r) => r[0] === 'Cut length')![1]!.split(' ')[0])
      const node = dome.strutTypes[p.index].length * 1000
      expect(node - cut).toBeGreaterThan(70)
      expect(node - cut).toBeLessThan(72)
    }
  })

  it('folded flanges: the two flanges on a shared edge meet back to back in the plane through the edge and the centre', () => {
    const dome = generateDome(DOMES[0])
    const b = buildConstruction(dome, 'folded', {}, 'm') as Build
    const R = dome.params.radius
    let checked = 0
    for (const s of dome.struts) {
      const n = normalize(cross(dome.vertices[s.a], dome.vertices[s.b]))
      const owners = dome.faces.map((f, fi) => [f, fi] as const).filter(([f]) => f.v.includes(s.a) && f.v.includes(s.b))
      if (owners.length < 2) continue
      const sides = owners.map(([f, fi]) => {
        const i = f.v.findIndex((v, k) => [v, f.v[(k + 1) % f.v.length]].sort().join() === [s.a, s.b].sort().join())
        const fl = b.solids.find((x) => x.group === `f${fi}` && x.name.endsWith(`-flange${i + 1}`))!
        const d = fl.solid.points.map((p) => dot(p, n))
        // One face of each flange on the plane; the rest on one side of it.
        expect(Math.min(...d.map(Math.abs))).toBeLessThan(1e-9 * R)
        return Math.sign(d.reduce((x, y) => (Math.abs(y) > Math.abs(x) ? y : x), 0))
      })
      expect(sides[0]).toBe(-sides[1])
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('lapped flanges: exactly one lap on every shared edge, none on the open edge', () => {
    for (const params of DOMES) {
      const dome = generateDome(params)
      const b = buildConstruction(dome, 'lapped', {}, 'm') as Build
      const shared = dome.struts.filter((s) => dome.faces.filter((f) => f.v.includes(s.a) && f.v.includes(s.b)).length === 2).length
      expect(b.solids.filter((x) => /-lap\d+$/.test(x.name)).length).toBe(shared)
    }
  })

  it('lapped both ways: two laps on every shared edge, each folded onto its neighbour, closed solids', () => {
    for (const params of DOMES) {
      const dome = generateDome(params)
      const b = buildConstruction(dome, 'lapped', { both: 1 }, 'm') as Build
      const shared = dome.struts.filter((s) => dome.faces.filter((f) => f.v.includes(s.a) && f.v.includes(s.b)).length === 2).length
      const laps = b.solids.filter((x) => /-lap\d+(-ramp)?$/.test(x.name))
      const mains = laps.filter((x) => /-lap\d+$/.test(x.name))
      expect(mains.length).toBe(2 * shared)
      for (const x of b.solids) {
        expect(closed(x.solid)).toBe(true)
        expect(volume(x.solid)).toBeGreaterThan(0)
      }
      const R = dome.params.radius
      const plane = (fi: number) => {
        const P = dome.faces[fi].v.map((v) => dome.vertices[v].map((c) => c * R) as [number, number, number])
        return { p: P[0], n: normalize(cross(sub(P[1], P[0]), sub(P[2], P[0]))) }
      }
      for (const lap of laps) {
        const fi = Number(lap.group.slice(1))
        const f = dome.faces[fi]
        const i = Number(lap.name.match(/-lap(\d+)(-ramp)?$/)![1]) - 1
        const [a, c] = [f.v[i], f.v[(i + 1) % f.v.length]]
        const other = dome.faces.findIndex((g, gi) => gi !== fi && g.v.includes(a) && g.v.includes(c))
        const { p, n } = plane(other)
        // Over the neighbour's outer face, lofted off it by at most a sheet per layer.
        const sides = dome.faces[other].v.length
        for (const q of lap.solid.points) {
          const d = dot(sub(q, p), n)
          expect(d).toBeGreaterThan(-1e-9)
          expect(d).toBeLessThan(((sides + 1) * b.dims.thickness) / 1000 + 1e-9)
        }
      }
      expect(b.dimRows.find((r) => r[0] === 'Double overlap')?.[1]).toBe('on')
    }
  })

  it('primitive builds nothing', () => {
    expect(buildConstruction(generateDome(DOMES[0]), 'primitive', {}, 'm')).toBeNull()
  })

  it('defaults fill in missing dimensions', () => {
    const b = buildConstruction(generateDome(DOMES[0]), 'plates', { plate: 8 }, 'm')!
    expect(b.dims).toEqual({ ...defaultDims('plates'), plate: 8 })
  })

  it('writes a STEP file with one solid per part, in millimetres', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'panels', {}, 'm')!
    const step = buildStep(build, 'dome')
    expect(step.startsWith('ISO-10303-21;')).toBe(true)
    expect(step.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)
    expect(step.match(/MANIFOLD_SOLID_BREP\(/g)!.length).toBe(build.solids.length)
    expect(step).toContain('SI_UNIT(.MILLI.,.METRE.)')
    // A 3 m dome: points out to about 3000 mm.
    const xs = [...step.matchAll(/CARTESIAN_POINT\('',\(([-\d.E]+),/g)].map((m) => Math.abs(Number(m[1])))
    expect(Math.max(...xs)).toBeGreaterThan(2900)
    expect(Math.max(...xs)).toBeLessThan(3100)
  })

  it('draws a sheet per part type, plus an overview', () => {
    for (const t of TECHS) {
      const dome = generateDome(DOMES[1])
      const build = buildConstruction(dome, t, {}, 'm')!
      const sheets = buildSheets(dome, 'm', build)
      expect(sheets.length).toBe(1 + build.parts.length)
      for (const s of sheets.slice(1)) {
        expect(s.svg).toMatch(/<svg/)
        expect(s.dxf).toMatch(/EOF\n$/)
        expect(s.page).toMatch(/Scale 1:\d/)
      }
    }
  })

  it('frame sheets detail every different beam: section with its bevel, both mitres', () => {
    const dome = generateDome(DOMES[0])
    const build = buildConstruction(dome, 'frames', {}, 'm')!
    const sheets = buildSheets(dome, 'm', build)
    for (const p of build.parts.filter((x) => x.name === 'Frame')) {
      const page = sheets.find((s) => s.id === p.id)!.page
      expect(page).toContain('Beams, enlarged')
      expect(sheets.find((s) => s.id === p.id)!.svg).toContain('Beams, full size')
      // Each table row's bevel appears on a section; mirrored beams share one.
      const drawn = [...page.matchAll(/>bevel ([\d.]+)°</g)].map((m) => Number(m[1]).toFixed(1))
      for (const row of p.facts.table!.rows) expect(drawn).toContain(row[3].replace('°', ''))
      expect((page.match(/>mitre /g) ?? []).length).toBeGreaterThanOrEqual(4)
    }
  })

  const beamsOf = (b: Build, fi: number, m: number) => Array.from({ length: m }, (_, i) => b.solids.find((x) => x.name.endsWith(`-${fi + 1}-beam${i + 1}`))!.solid.points)
  const onPlane = (p: number[], a: number[], b: number[], c: number[]) => {
    const n = normalize(cross(sub(b as never, a as never), sub(c as never, a as never)))
    return Math.abs(dot(n, sub(p as never, a as never)))
  }

  it('double mitre: frame beams meet on a shared mitre, outside flush at every corner', () => {
    const dome = generateDome(DOMES[0])
    const b = buildConstruction(dome, 'mitre2', {}, 'm')!
    dome.faces.forEach((f, fi) => {
      const bs = beamsOf(b, fi, f.v.length)
      bs.forEach((pts, i) => {
        const prev = bs[(i + f.v.length - 1) % f.v.length]
        // Same corner points: outer top, inner top, outer bottom. (Square inner sides cannot also meet at the bottom.)
        for (const [a, c] of [[0, 1], [3, 2], [4, 5]]) expect(Math.hypot(...sub(pts[a], prev[c]))).toBeLessThan(1e-9)
      })
    })
  })

  it('Good Karma: butt corners, each beam running through its start corner, the next butting into its inner side', () => {
    const dome = generateDome(DOMES[0])
    const b = buildConstruction(dome, 'frames', {}, 'm')!
    dome.faces.forEach((f, fi) => {
      const m = f.v.length
      const bs = beamsOf(b, fi, m)
      bs.forEach((pts, i) => {
        const prev = bs[(i + m - 1) % m]
        const next = bs[(i + 1) % m]
        // Start face flush with the previous beam's outer side; end face on the next beam's inner side.
        for (const k of [0, 3, 4, 7]) expect(onPlane(pts[k], prev[0], prev[1], prev[4])).toBeLessThan(1e-9)
        for (const k of [1, 2, 5, 6]) expect(onPlane(pts[k], next[2], next[3], next[6])).toBeLessThan(1e-9)
      })
    })
  })

  it('single mitre: one strut per edge, every end pointed onto its node axis', () => {
    const dome = generateDome(DOMES[0])
    const b = buildConstruction(dome, 'mitre1', {}, 'm')!
    const struts = b.solids.filter((s) => s.kind === 'strut')
    expect(struts.length).toBe(dome.struts.length)
    const R = dome.params.radius
    dome.struts.forEach((st, si) => {
      const pts = struts.find((s) => s.group === `s${si}`)!.solid.points
      for (const v of [st.a, st.b]) {
        // Full nodes only: on the rim an open side is cut square.
        if (dome.hubs[v].kind === 'cut' || dome.struts.filter((x) => x.a === v || x.b === v).length < 5) continue
        const axis = normalize(dome.vertices[v] as never)
        const p0 = (dome.vertices[v] as number[]).map((c) => c * R)
        const off = (p: number[]) => {
          const d = sub(p as never, p0 as never)
          return Math.hypot(...sub(d, axis.map((c) => c * dot(d, axis)) as never))
        }
        expect(Math.min(...pts.map(off))).toBeLessThan(1e-7)
      }
    })
  })

  it('Good Karma: 2×6 by default, screws at the corners, nailed decking', () => {
    const dome = generateDome(DOMES[0])
    const b = buildConstruction(dome, 'frames', {}, 'm')!
    expect(b.dims.depth).toBe(140)
    expect(b.hardware.find((h) => h.label === 'Screw')!.qty).toBe(dome.faces.length * 12)
    expect(b.hardware.find((h) => h.label === 'Nail')!.qty).toBeGreaterThan(dome.faces.length * 30)
    expect(buildConstruction(dome, 'mitre2', {}, 'm')!.hardware.find((h) => h.label === 'Nail')).toBeUndefined()
  })

  it('a bolt per node for pipe, one per arm for plates', () => {
    const dome = generateDome(DOMES[0])
    const pipe = buildConstruction(dome, 'pipe', {}, 'm')!
    expect(pipe.hardware.reduce((s, h) => s + h.qty, 0)).toBe(dome.vertices.length)
    const plates = buildConstruction(dome, 'plates', {}, 'm')!
    expect(plates.hardware.reduce((s, h) => s + h.qty, 0)).toBe(dome.struts.length * 2)
  })
})
