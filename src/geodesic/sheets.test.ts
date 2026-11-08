import { describe, expect, it } from 'vitest'
import { buildSheets, generateDome } from './index'

const polygons = (svg: string) =>
  [...svg.matchAll(/<polygon points="([^"]+)"[^>]*stroke="#ff0000"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number) as [number, number]))

describe('sheets', () => {
  const dome = generateDome({ frequency: 3, radius: 3, solid: 'icosahedron', cut: 0.625, mode: 'section' })
  const sheets = buildSheets(dome, 'm')

  it('one overview, then one sheet per panel, strut and hub type in use', () => {
    expect(sheets[0].kind).toBe('overview')
    expect(sheets.filter((s) => s.kind === 'panel').length).toBe(dome.faceTypes.filter((t) => t.count).length)
    expect(sheets.filter((s) => s.kind === 'strut').length).toBe(dome.strutTypes.filter((t) => t.count).length)
    expect(sheets.filter((s) => s.kind === 'hub').length).toBe(dome.hubTypes.length)
    expect(new Set(sheets.map((s) => s.id)).size).toBe(sheets.length)
  })

  it('draws panels at 1:1 in millimetres, seen from outside', () => {
    for (const sheet of sheets.filter((s) => s.kind === 'panel')) {
      expect(sheet.svg).toMatch(/width="[\d.]+mm"/)
      const t = dome.faceTypes[sheet.index]
      const [poly] = polygons(sheet.svg)
      expect(poly.length).toBe(t.outline.length)
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]
        const [a, b] = [t.outline[i], t.outline[(i + 1) % poly.length]]
        expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3000, 1)
      })
      // Screen coordinates run y down: a counter-clockwise outline (seen from outside) has negative shoelace area.
      const area = poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)
      expect(area).toBeLessThan(0)
    }
  })

  it('draws every strut, cut pieces too, as a square-ended bar of its true length', () => {
    const cut = buildSheets(generateDome({ frequency: 3, radius: 1, solid: 'icosahedron', cut: 0.6, mode: 'section' }), 'm')
    const struts = cut.filter((s) => s.kind === 'strut')
    expect(struts.some((s) => s.label.includes('′'))).toBe(true)
    for (const sheet of struts) {
      const [poly] = polygons(sheet.svg)
      expect(poly[1][0] - poly[0][0]).toBeCloseTo(poly[2][0] - poly[3][0], 6)
    }
    for (const sheet of sheets.filter((s) => s.kind === 'strut')) {
      const [poly] = polygons(sheet.svg)
      expect(poly[1][0] - poly[0][0]).toBeCloseTo(dome.strutTypes[sheet.index].length * 1000, 1)
    }
  })

  it('uses inches for imperial domes', () => {
    const ft = buildSheets(generateDome({ frequency: 2, radius: 10, solid: 'icosahedron', cut: 0.5, mode: 'exclude' }), 'ft')
    expect(ft[1].svg).toMatch(/width="[\d.]+in"/)
  })

  it('every 1:1 sheet carries a 100 mm scale bar', () => {
    for (const s of sheets.filter((x) => x.kind !== 'overview')) expect(s.svg).toContain('100 mm · 1:1 · check this bar')
  })

  it('pages are all the same size, with a scale', () => {
    for (const s of sheets) expect(s.page).toContain('width="297mm" height="210mm"')
    for (const s of sheets.filter((x) => x.kind === 'panel' || x.kind === 'strut')) expect(s.page).toMatch(/Scale 1:\d/)
    const imperial = buildSheets(generateDome({ frequency: 2, radius: 10, solid: 'icosahedron', cut: 0.5, mode: 'exclude' }), 'ft')
    expect(imperial[1].page).toContain('width="279.4mm" height="215.9mm"')
  })

  it('DXF: R12, millimetres, the outline as a closed polyline at true size', () => {
    const panel = sheets.find((x) => x.kind === 'panel')!
    expect(panel.dxf).toContain('AC1009')
    expect(panel.dxf).toMatch(/\$INSUNITS\n70\n4/)
    expect(panel.dxf.trim().endsWith('EOF')).toBe(true)
    // Vertices of the first OUTLINE polyline.
    const block = panel.dxf.split('POLYLINE\n8\nOUTLINE')[1].split('SEQEND')[0]
    const xs = [...block.matchAll(/VERTEX\n8\nOUTLINE\n10\n([-\d.]+)\n20\n([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
    const t = dome.faceTypes[panel.index]
    expect(xs.length).toBe(t.outline.length)
    const per = xs.reduce((sum, p, i) => sum + Math.hypot(xs[(i + 1) % xs.length][0] - p[0], xs[(i + 1) % xs.length][1] - p[1]), 0)
    const want = t.outline.reduce((sum, p, i) => sum + Math.hypot(t.outline[(i + 1) % t.outline.length][0] - p[0], t.outline[(i + 1) % t.outline.length][1] - p[1]), 0) * 3000
    expect(per).toBeCloseTo(want, 0)
    expect(panel.dxf).not.toMatch(/[^\x00-\x7f]/)
  })
})
