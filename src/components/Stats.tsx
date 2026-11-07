import type { Dome } from '../geodesic'
import { area, fmt, len, vol, type Unit } from '../lib/units'

export default function Stats({ dome, unit }: { dome: Dome; unit: Unit }) {
  const s = dome.stats
  const R = dome.params.radius
  const closed = s.euler === 2
  const rows: [string, string, string?][] = [
    ['Height', len(s.height, unit), `coef ${fmt(s.height / (2 * R), 3)} as built`],
    ...(closed
      ? []
      : ([
          ['Base Ø', len(s.baseDiameter, unit)],
          ['Base', s.baseDeviation < 1e-6 * R ? 'flat' : `stepped ${len(s.baseDeviation, unit)}`],
          ['Floor', area(s.floorArea, unit)],
        ] as [string, string][])),
    ['Skin', area(s.surfaceArea, unit)],
    ['Volume', vol(s.volume, unit)],
    ['Strut run', len(s.totalStrutLength, unit), 'all struts end to end'],
  ]
  const counts: [string, number, number][] = [
    ['Struts', s.struts, s.cutStruts + s.ringStruts],
    ['Panels', s.faces, s.cutFaces],
    ['Hubs', s.hubs, s.cutPoints],
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {counts.map(([k, n, cut]) => (
          <div key={k} className="rounded-md border px-2.5 py-2">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="num text-lg leading-tight font-semibold">{fmt(n, 0)}</div>
            <div className="num text-[11px] text-muted-foreground">{cut ? `${cut} from the cut` : ' '}</div>
          </div>
        ))}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        {rows.map(([k, v, note]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="num m-0 text-right">
              {v}
              {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
