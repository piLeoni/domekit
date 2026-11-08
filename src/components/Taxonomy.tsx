import type { ReactNode } from 'react'
import type { Dome, FaceType, HubType, PieceKind } from '../geodesic'
import { hatched } from '../lib/palette'
import type { Focus } from '../lib/state'
import { area, deg, fmt, len, type Unit } from '../lib/units'

type Kind = NonNullable<Focus>['kind']

/** How a taxonomy view talks to the rest of the page. */
export interface Pick {
  /** Lit: the hovered family, else the selected one. */
  focus: Focus
  selected: Focus
  onHover: (f: Focus) => void
  onSelect: (f: Focus) => void
}

const same = (f: Focus, kind: Kind, index: number) => f?.kind === kind && f.index === index

export const rowId = (kind: Kind, index: number) => `row-${kind}-${index}`

/** A colour chip; cut pieces hatched in their parent's colour. Identity is always also written beside it. */
export function Swatch({ color, kind = 'whole', size = 12 }: { color: string; kind?: PieceKind; size?: number }) {
  const style =
    kind === 'cut'
      ? { width: size, height: size, background: hatched(color), boxShadow: `inset 0 0 0 1.5px ${color}` }
      : { width: size, height: size, background: color }
  return <span aria-hidden className="inline-block shrink-0 rounded-[3px]" style={style} />
}

/** A table row that lights its family on hover and selects it on click. */
function PickRow({ kind, index, muted, pick, children }: { kind: Kind; index: number; muted?: boolean; pick: Pick; children: ReactNode }) {
  const selected = same(pick.selected, kind, index)
  const lit = same(pick.focus, kind, index)
  return (
    <tr
      id={rowId(kind, index)}
      aria-selected={selected}
      className={`ease cursor-pointer border-b last:border-0 ${
        selected ? 'bg-accent shadow-[inset_2px_0_0_var(--foreground)]' : lit ? 'bg-muted' : 'hover:bg-muted'
      } ${muted ? 'text-muted-foreground' : ''}`}
      onMouseEnter={() => pick.onHover({ kind, index })}
      onMouseLeave={() => pick.onHover(null)}
      onClick={() => pick.onSelect(selected ? null : { kind, index })}
    >
      {children}
    </tr>
  )
}

function GroupHeader({ cols, title, note }: { cols: number; title: string; note: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-2 pt-4 pb-1.5">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </td>
    </tr>
  )
}

const th = 'h-8 px-2 text-left text-xs font-medium text-muted-foreground'
const td = 'num px-2 py-1.5'

/* ---------------------------------------------------------------- */
/*  Struts                                                           */
/* ---------------------------------------------------------------- */

/**
 * Every whole strut type on one length axis: where the lengths cluster (and so
 * where two struts are easy to mix up on site), and how many of each are needed.
 */
export function StrutSpectrum({ dome, colors, pick, unit }: { dome: Dome; colors: string[]; pick: Pick; unit: Unit }) {
  // Whole struts only: the point is which full lengths sit close together; cut pieces are listed below.
  const types = dome.strutTypes.filter((t) => t.count > 0 && t.kind === 'whole')
  if (!types.length) return null
  const W = 400
  const padX = 12
  const base = 56
  const lens = types.map((t) => t.chordFactor)
  const lo = Math.min(...lens)
  const hi = Math.max(...lens)
  const x = (cf: number) => (hi === lo ? W / 2 : padX + ((cf - lo) / (hi - lo)) * (W - 2 * padX))
  const maxCount = Math.max(...types.map((t) => t.count))
  // Labels go on the first row where they do not touch the one before.
  const rowEnd: number[] = []
  const rowOf = new Map<number, number>()
  for (const t of [...types].sort((a, b) => a.chordFactor - b.chordFactor)) {
    const cx = x(t.chordFactor)
    const w = t.label.length * 6.5 + 4
    let r = rowEnd.findIndex((e) => e < cx - w / 2)
    if (r < 0) r = rowEnd.push(-Infinity) - 1
    rowEnd[r] = cx + w / 2
    rowOf.set(t.index, r)
  }
  const H = base + 14 + rowEnd.length * 12 + 6
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Strut lengths and counts">
        <line x1={padX} x2={W - padX} y1={base} y2={base} stroke="var(--border)" />
        {types.map((t) => {
          const cx = x(t.chordFactor)
          const h = 6 + (t.count / maxCount) * (base - 12)
          const lit = !pick.focus || pick.focus.kind !== 'strut' || pick.focus.index === t.index
          const on = same(pick.focus, 'strut', t.index)
          const w = on ? 7 : 5
          return (
            <g
              key={t.label}
              className="ease cursor-pointer"
              style={{ opacity: lit ? 1 : 'var(--dim)' }}
              onMouseEnter={() => pick.onHover({ kind: 'strut', index: t.index })}
              onMouseLeave={() => pick.onHover(null)}
              onClick={() => pick.onSelect(same(pick.selected, 'strut', t.index) ? null : { kind: 'strut', index: t.index })}
            >
              <rect x={cx - 6} y={0} width={12} height={H} fill="transparent" />
              <rect className="ease" x={cx - w / 2} y={base - h} width={w} height={h} rx={1.5} fill={colors[t.index]} style={{ transition: 'x 200ms, width 200ms' }} />
              <text x={cx} y={base + 13 + (rowOf.get(t.index) ?? 0) * 12} textAnchor="middle" fontSize={11} fontWeight={on ? 600 : 400} fill="var(--foreground)">
                {t.label}
              </text>
            </g>
          )
        })}
        <text x={padX} y={H - 2} fontSize={10} fill="var(--muted-foreground)">
          {len(lo * dome.params.radius, unit)}
        </text>
        <text x={W - padX} y={H - 2} fontSize={10} textAnchor="end" fill="var(--muted-foreground)">
          {len(hi * dome.params.radius, unit)}
        </text>
      </svg>
    </figure>
  )
}

export function StrutTable({ dome, colors, pick, unit }: { dome: Dome; colors: string[]; pick: Pick; unit: Unit }) {
  const hasCut = dome.strutTypes.some((t) => t.kind === 'cut')
  const cols = hasCut ? 6 : 5
  const groups: { kind: PieceKind; title?: string; note?: string }[] = [
    { kind: 'whole' },
    { kind: 'cut', title: 'Cut pieces', note: 'Struts trimmed at the plane, named after their parent.' },
    { kind: 'ring', title: 'Base ring', note: 'Struts along the plane, between cut points.' },
  ]
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b">
          <th className={th}>Type</th>
          <th className={`${th} text-right`}>Qty</th>
          <th className={`${th} text-right`}>Length</th>
          <th className={`${th} text-right`} title="Length on a sphere of radius 1 (the chord factor, for whole struts)">
            ÷ r
          </th>
          <th className={`${th} text-right`} title="Angle between the strut and the tangent plane at its hub">
            Hub
          </th>
          {hasCut && (
            <th className={`${th} text-right`} title="Angle between a trimmed strut and the cut plane">
              Cut
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const rows = dome.strutTypes.filter((t) => t.kind === g.kind)
          if (!rows.length) return null
          return [
            g.title && <GroupHeader key={`g-${g.kind}`} cols={cols} title={g.title} note={g.note!} />,
            ...rows.map((t) => (
              <PickRow key={t.label} kind="strut" index={t.index} muted={!t.count} pick={pick}>
                <td className={td}>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Swatch color={colors[t.index]} kind={t.kind} />
                    {t.label}
                  </span>
                </td>
                <td className={`${td} text-right`}>{t.count}</td>
                <td className={`${td} text-right whitespace-nowrap`}>{len(t.length, unit)}</td>
                <td className={`${td} text-right text-muted-foreground`}>{fmt(t.chordFactor, 5)}</td>
                <td className={`${td} text-right whitespace-nowrap`} title={t.endAngle2 != null ? 'The two ends meet their hubs at different angles' : undefined}>
                  {t.endAngle == null ? '—' : t.endAngle2 != null ? `${deg(t.endAngle)} / ${deg(t.endAngle2)}` : deg(t.endAngle)}
                </td>
                {hasCut && <td className={`${td} text-right`}>{t.kind === 'cut' && t.cutAngle != null ? deg(t.cutAngle) : '—'}</td>}
              </PickRow>
            )),
          ]
        })}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- */
/*  Panels                                                           */
/* ---------------------------------------------------------------- */

/** The panel drawn to its true shape, each side in the colour of its strut. */
function PanelGlyph({ t, colors, size = 36 }: { t: FaceType; colors: string[]; size?: number }) {
  const xs = t.outline.map((p) => p[0])
  const ys = t.outline.map((p) => p[1])
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  const k = (size - 6) / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0)
  const pts = t.outline.map(([x, y]) => [3 + (x - x0) * k, size - 3 - (y - y0) * k])
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="var(--muted)" />
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length]
        return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={colors[t.edges[i]]} strokeWidth={2.5} strokeLinecap="round" />
      })}
    </svg>
  )
}

export function PanelTable({ dome, strutColors, faceColors, pick, unit }: { dome: Dome; strutColors: string[]; faceColors: string[]; pick: Pick; unit: Unit }) {
  const row = (t: FaceType) => (
    <PickRow key={t.label} kind="face" index={t.index} muted={!t.count} pick={pick}>
      <td className="py-1.5 pr-1 pl-2">
        <PanelGlyph t={t} colors={strutColors} />
      </td>
      <td className={td}>
        <div className="flex items-center gap-2">
          <Swatch color={faceColors[t.index]} kind={t.kind} />
          <span className="font-medium">{t.label}</span>
          <span className="truncate text-muted-foreground">{t.signature}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {{ 3: '', 4: 'Quad · ', 5: 'Pentagon · ', 6: 'Hexagon · ' }[t.outline.length] ?? `${t.outline.length}-gon · `}
          {t.mirrorOf != null && `↔ ${dome.faceTypes[t.mirrorOf].label} · `}
          {t.angles.map((a) => deg(a)).join('  ')}
        </div>
      </td>
      <td className={`${td} text-right align-top`}>{t.count}</td>
      <td className={`${td} text-right align-top whitespace-nowrap`}>{area(t.area, unit)}</td>
    </PickRow>
  )
  const cut = dome.faceTypes.filter((t) => t.kind === 'cut')
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b">
          <th className={th} colSpan={2}>
            Panel
          </th>
          <th className={`${th} text-right`}>Qty</th>
          <th className={`${th} text-right`}>Area</th>
        </tr>
      </thead>
      <tbody>
        {dome.faceTypes.filter((t) => t.kind === 'whole').map(row)}
        {cut.length > 0 && <GroupHeader cols={4} title="Cut pieces" note="Panels clipped at the plane, named after their parent." />}
        {cut.map(row)}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- */
/*  Hubs                                                             */
/* ---------------------------------------------------------------- */

/** The struts meeting at a hub, in order around it, as small letters underlined in their colour. */
function StrutTicks({ arms, colors }: { arms: HubType['arms']; colors: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {arms.map((a, k) => (
        <span key={k} className="min-w-5 px-0.5 text-center text-[11px] leading-[18px]" style={{ boxShadow: `inset 0 -3px 0 ${colors[a.type]}` }}>
          {a.strut}
        </span>
      ))}
    </span>
  )
}

/**
 * A hub seen from outside, down its axis: one spoke per arm at its true turn
 * around the hub, first arm up, counter-clockwise, in the strut's colour.
 * Spokes are foreshortened by their dip; with `labels`, each is named.
 */
function HubGlyph({ t, colors, size = 40, labels = false }: { t: HubType; colors: string[]; size?: number; labels?: boolean }) {
  const c = size / 2
  const r = labels ? c - 14 : c - 3
  let theta = 0
  const spokes = t.arms.map((a) => {
    const rad = (theta * Math.PI) / 180
    const len = r * Math.cos((a.dip * Math.PI) / 180)
    const tip = [c - len * Math.sin(rad), c - len * Math.cos(rad)]
    const lab = [c - (r + 8) * Math.sin(rad), c - (r + 8) * Math.cos(rad)]
    theta += a.turn
    return { a, tip, lab }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeDasharray={labels ? '2 3' : undefined} />
      {spokes.map(({ a, tip }, k) => (
        <line key={k} x1={c} y1={c} x2={tip[0]} y2={tip[1]} stroke={colors[a.type]} strokeWidth={labels ? 3 : 2.25} strokeLinecap="round" />
      ))}
      <circle cx={c} cy={c} r={labels ? 3.5 : 2.25} fill="var(--foreground)" />
      {labels &&
        spokes.map(({ a, lab }, k) => (
          <text key={k} x={lab[0]} y={lab[1]} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
            {a.strut}
          </text>
        ))}
    </svg>
  )
}

/** The selected hub, arm by arm: what a connector maker needs. */
function HubDetail({ t, colors, dome }: { t: HubType; colors: string[]; dome: Dome }) {
  const cell = 'num px-2 py-1 text-right'
  return (
    <div className="fade-in flex gap-3 border-b bg-muted/40 px-2 py-3">
      <HubGlyph t={t} colors={colors} size={112} labels />
      <div className="min-w-0 flex-1">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Arm</th>
              <th className="px-2 py-1 text-right font-medium" title="Angle the strut dips below the tangent plane">
                Dip
              </th>
              <th className="px-2 py-1 text-right font-medium" title="Angle around the hub axis to the next arm">
                Turn
              </th>
              <th className="px-2 py-1 text-right font-medium" title="True 3D angle between this strut and the next">
                Between
              </th>
            </tr>
          </thead>
          <tbody>
            {t.arms.map((a, k) => (
              <tr key={k} className="border-t">
                <td className="px-2 py-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="num w-3 text-muted-foreground">{k + 1}</span>
                    <Swatch color={colors[a.type]} kind={dome.strutTypes[a.type].kind} size={10} />
                    <span className="font-medium">{a.strut}</span>
                  </span>
                </td>
                <td className={cell}>{deg(a.dip)}</td>
                <td className={cell}>{deg(a.turn)}</td>
                <td className={cell}>{t.valence > 1 ? deg(a.between) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Seen from outside down the hub axis (the sphere radius), arms counter-clockwise from arm 1. Dip is measured from the tangent plane; turn is the angle in that plane to the next arm.
          {t.mirrorOf != null && ` Mirror image of ${dome.hubTypes[t.mirrorOf].label}: same struts and angles, opposite hand.`}
        </p>
      </div>
    </div>
  )
}

export function HubTable({ dome, strutColors, pick }: { dome: Dome; strutColors: string[]; pick: Pick }) {
  const row = (t: HubType) => [
    <PickRow key={t.label} kind="hub" index={t.index} pick={pick}>
      <td className="py-1.5 pr-1 pl-2">
        <HubGlyph t={t} colors={strutColors} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <div className="font-medium">{t.label}</div>
        <div className="text-xs text-muted-foreground">
          {t.kind === 'cut' ? 'cut point' : `${t.valence}-way${t.base ? ', base' : ''}`}
          {t.mirrorOf != null && ` · ↔ ${dome.hubTypes[t.mirrorOf].label}`}
        </div>
      </td>
      <td className={td}>
        <StrutTicks arms={t.arms} colors={strutColors} />
      </td>
      <td className={`${td} text-right`}>{t.count}</td>
    </PickRow>,
    same(pick.selected, 'hub', t.index) && (
      <tr key={`${t.label}-detail`}>
        <td colSpan={4} className="p-0">
          <HubDetail t={t} colors={strutColors} dome={dome} />
        </td>
      </tr>
    ),
  ]
  const cut = dome.hubTypes.filter((t) => t.kind === 'cut')
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b">
          <th className={th} colSpan={2}>
            Hub
          </th>
          <th className={th} title="In order around the hub, counter-clockwise seen from outside">
            Struts, in order
          </th>
          <th className={`${th} text-right`}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {dome.hubTypes.filter((t) => t.kind === 'hub').flatMap(row)}
        {cut.length > 0 && <GroupHeader cols={4} title="Cut points" note="Where a trimmed strut meets the plane." />}
        {cut.flatMap(row)}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- */
/*  Face schema                                                      */
/* ---------------------------------------------------------------- */

/** Marks only the hubs that are not 6-way: the corners of the base solid. */
function CornerMark({ x, y, valence, r }: { x: number; y: number; valence?: number; r: number }) {
  if (!valence || valence >= 6) return null
  const pts = Array.from({ length: valence }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / valence
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`
  }).join(' ')
  return <polygon points={pts} fill="var(--background)" stroke="var(--foreground)" strokeWidth={1.25} />
}

/**
 * One face of the base solid, subdivided: every Class I dome is this triangle,
 * repeated. Shows which strut goes where.
 */
export function FaceSchema({ dome, colors, pick }: { dome: Dome; colors: string[]; pick: Pick }) {
  const { frequency: V, points, edges } = dome.schema
  const W = 400
  const side = 360
  const h = (side * Math.sqrt(3)) / 2
  const top = 14
  const A = [W / 2, top]
  const B = [W / 2 - side / 2, top + h]
  const C = [W / 2 + side / 2, top + h]
  const at = (i: number, j: number): [number, number] => [
    A[0] + (i / V) * (B[0] - A[0]) + (j / V) * (C[0] - A[0]),
    A[1] + (i / V) * (B[1] - A[1]) + (j / V) * (C[1] - A[1]),
  ]
  const xy = points.map((p) => at(p.i, p.j))
  const labels = V <= 8
  const stroke = Math.max(1.5, Math.min(3.5, 14 / V))
  const focus = pick.focus?.kind === 'strut' ? pick.focus.index : null
  const corner = points.find((p) => p.mark)?.mark
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${top + h + 14}`} className="block w-full" role="img" aria-label={`One ${dome.params.solid} face at ${V}V`}>
        {dome.schema.pattern === 'goldberg' && (
          <polygon points={[A, B, C].map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--border)" strokeDasharray="4 4" />
        )}
        {edges.map((e, k) => {
          const [x1, y1] = xy[e.from]
          const [x2, y2] = xy[e.to]
          return (
            <g
              key={k}
              className="cursor-pointer"
              onMouseEnter={() => pick.onHover({ kind: 'strut', index: e.type })}
              onMouseLeave={() => pick.onHover(null)}
              onClick={() => pick.onSelect(same(pick.selected, 'strut', e.type) ? null : { kind: 'strut', index: e.type })}
            >
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
              <line
                className="ease"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors[e.type]}
                strokeLinecap="round"
                style={{ strokeWidth: focus === e.type ? stroke * 1.8 : stroke, opacity: focus != null && focus !== e.type ? 'var(--dim)' : 1 }}
              />
            </g>
          )
        })}
        {labels &&
          edges.map((e, k) => {
            const [x1, y1] = xy[e.from]
            const [x2, y2] = xy[e.to]
            return (
              <text
                key={k}
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2}
                dy="0.35em"
                textAnchor="middle"
                fontSize={V <= 4 ? 12 : V <= 6 ? 10 : 8}
                fontWeight={600}
                fill="var(--foreground)"
                stroke="var(--background)"
                strokeWidth={3}
                paintOrder="stroke"
                className="ease"
                style={{ opacity: focus != null && focus !== e.type ? 'var(--dim)' : 1 }}
                pointerEvents="none"
              >
                {dome.strutTypes[e.type].label}
              </text>
            )
          })}
        {points.map((p, k) => (
          <CornerMark key={k} x={xy[k][0]} y={xy[k][1]} valence={p.mark} r={6} />
        ))}
      </svg>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        One of the {dome.params.solid === 'octahedron' ? 8 : 20} {dome.params.solid} faces; the sphere is this triangle repeated.
        {dome.schema.pattern === 'goldberg'
          ? ` Each point is a node where three struts meet; ${corner === 5 ? 'pentagons' : 'squares'} sit on the outlined corners, hexagons everywhere else.`
          : corner
            ? ` Outlined corners are the ${corner}-way hubs.`
            : ''}
      </figcaption>
    </figure>
  )
}
