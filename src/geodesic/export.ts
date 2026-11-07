import type { Dome } from './types'

/** Wavefront OBJ of the panels, at real size, z up. Clipped panels may have four corners. */
export function toObj(dome: Dome): string {
  const R = dome.params.radius
  const lines = [
    `# geodesic ${dome.params.frequency}V ${dome.params.solid}, r = ${R}, cut ${dome.params.cut} (${dome.params.mode})`,
    'o dome',
  ]
  for (const [x, y, z] of dome.vertices) lines.push(`v ${(x * R).toFixed(6)} ${(y * R).toFixed(6)} ${(z * R).toFixed(6)}`)
  for (const f of dome.faces) lines.push(`f ${f.v.map((v) => v + 1).join(' ')}`)
  return lines.join('\n') + '\n'
}

const num = (x: number | null, d: number) => (x == null ? '' : x.toFixed(d))

/** One row per strut type: what to cut, and how many. */
export function toCutList(dome: Dome, unit: string): string {
  const rows = [['strut', 'kind', 'from', 'count', `length_${unit}`, 'length_per_radius', 'hub_end_angle_deg', 'cut_angle_deg']]
  for (const t of dome.strutTypes) {
    if (!t.count) continue
    rows.push([
      t.label,
      t.kind,
      t.parent == null ? '' : dome.strutTypes[t.parent].label,
      String(t.count),
      t.length.toFixed(4),
      t.chordFactor.toFixed(6),
      num(t.endAngle, 3),
      t.kind === 'cut' ? num(t.cutAngle, 3) : '',
    ])
  }
  return rows.map((r) => r.join(',')).join('\n') + '\n'
}

/** One row per arm of each hub type: the connector schedule. */
export function toHubList(dome: Dome): string {
  const rows = [['hub', 'kind', 'count', 'mirror_of', 'arm', 'strut', 'dip_deg', 'turn_deg', 'between_deg']]
  for (const t of dome.hubTypes) {
    t.arms.forEach((a, i) => {
      rows.push([
        t.label,
        t.kind === 'cut' ? 'cut point' : `${t.valence}-way${t.base ? ' base' : ''}`,
        String(t.count),
        t.mirrorOf == null ? '' : dome.hubTypes[t.mirrorOf].label,
        String(i + 1),
        a.strut,
        a.dip.toFixed(3),
        a.turn.toFixed(3),
        a.between.toFixed(3),
      ])
    })
  }
  return rows.map((r) => r.join(',')).join('\n') + '\n'
}

/** The whole dome as data, for other tools. */
export function toJson(dome: Dome): string {
  return JSON.stringify(dome, (_, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v), 2)
}
