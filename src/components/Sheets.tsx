import { useEffect, useMemo, useState } from 'react'
import { buildSheets, type Dome, type Sheet } from '../geodesic'
import { download, sheetPath, sheetsPdf, sheetsZip } from '../lib/drawings'
import type { Focus } from '../lib/state'
import type { Unit } from '../lib/units'
import type { Pick } from './Taxonomy'
import { Button, DownloadIcon } from './ui'

const FOCUS_KIND: Record<Sheet['kind'], NonNullable<Focus>['kind'] | null> = { overview: null, panel: 'face', strut: 'strut', hub: 'hub' }

export const sheetDomId = (kind: NonNullable<Focus>['kind'], index: number) => `sheet-${kind}-${index}`

export function fileStem(dome: Dome, unit: Unit) {
  const p = dome.params
  return `dome-${p.pattern === 'goldberg' ? 'goldberg' : 'geodesic'}-${p.frequency}v-${String(p.radius).replace('.', '_')}${unit}-${p.mode}`
}

export type DrawingFormat = 'svg' | 'dxf' | 'pdf'

/** Build the drawings and save them: a zip of 1:1 SVGs or DXFs, or a PDF of pages. */
export async function saveSheets(dome: Dome, unit: Unit, as: DrawingFormat, sheets = buildSheets(dome, unit)) {
  if (as === 'pdf') download(`${fileStem(dome, unit)}-drawings.pdf`, await sheetsPdf(sheets, unit))
  else download(`${fileStem(dome, unit)}-${as}.zip`, sheetsZip(dome, sheets, unit, as))
}

/**
 * One card per sheet: the drawing itself, at a size that fits, with a fixed
 * on-screen line weight (the files keep their hairlines for cutters).
 */
export default function Sheets({ dome, unit, pick }: { dome: Dome; unit: Unit; pick: Pick }) {
  const sheets = useMemo(() => buildSheets(dome, unit), [dome, unit])
  const [busy, setBusy] = useState<DrawingFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A part picked elsewhere brings its sheet into view.
  useEffect(() => {
    if (!pick.selected) return
    document.getElementById(sheetDomId(pick.selected.kind, pick.selected.index))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pick.selected])

  const save = async (as: DrawingFormat) => {
    setBusy(as)
    setError(null)
    try {
      await saveSheets(dome, unit, as, sheets)
    } catch (e) {
      setError(`Could not build the ${as.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const units = sheets.find((s) => s.kind !== 'overview')?.units ?? 'mm'
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-[13px] leading-snug">
          One drawing per part type. The PDF has a page per part, all {unit === 'ft' || unit === 'in' ? 'US Letter' : 'A4'}, each with a scale bar. The SVG and DXF files are the
          parts at full size (1 unit = 1 {units}), for cutting or CAD.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['pdf', 'svg', 'dxf'] as const).map((f) => (
            <Button key={f} onClick={() => save(f)} disabled={busy != null}>
              <DownloadIcon className="h-3.5 w-3.5" /> {busy === f ? 'Building…' : f === 'pdf' ? 'PDF' : `${f.toUpperCase()} (.zip)`}
            </Button>
          ))}
          <span className="self-center text-xs text-muted-foreground">{sheets.length} drawings</span>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {sheets.map((s) => {
        const kind = FOCUS_KIND[s.kind]
        const selected = kind != null && pick.selected?.kind === kind && pick.selected.index === s.index
        const lit = kind != null && pick.focus?.kind === kind && pick.focus.index === s.index
        return (
          <figure
            key={s.id}
            id={kind ? sheetDomId(kind, s.index) : undefined}
            className={`ease m-0 cursor-pointer overflow-hidden rounded-md border [content-visibility:auto] ${
              selected ? 'border-foreground shadow-[var(--shadow)]' : lit ? 'border-ring' : 'hover:border-ring'
            }`}
            onMouseEnter={() => kind && pick.onHover({ kind, index: s.index })}
            onMouseLeave={() => pick.onHover(null)}
            onClick={() => kind && pick.onSelect(selected ? null : { kind, index: s.index })}
          >
            <figcaption className="flex items-center gap-2 border-b px-2.5 py-1.5 text-[13px]">
              <span className="font-medium">{s.label}</span>
              {s.kind !== 'overview' && <span className="text-muted-foreground">× {s.qty}</span>}
              <span className="text-xs text-muted-foreground capitalize">{s.kind}</span>
              {s.kind !== 'overview' && (
                <span className="num ml-auto text-xs text-muted-foreground" title="Full-size drawing">
                  {Math.round(s.width)} × {Math.round(s.height)} {s.units}
                </span>
              )}
              <span className={`flex gap-0.5 ${s.kind === 'overview' ? 'ml-auto' : ''}`}>
                {(['svg', 'dxf'] as const)
                  .filter((ext) => ext === 'svg' || s.dxf)
                  .map((ext) => (
                    <button
                      key={ext}
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground uppercase hover:bg-accent hover:text-foreground"
                      title={`Download ${sheetPath(s, ext)} at full size`}
                      onClick={(e) => {
                        e.stopPropagation()
                        const body = ext === 'svg' ? (s.kind === 'overview' ? s.page : s.svg) : s.dxf
                        download(`${fileStem(dome, unit)}-${s.id}.${ext}`, new Blob([body], { type: ext === 'svg' ? 'image/svg+xml' : 'application/dxf' }))
                      }}
                    >
                      {ext}
                    </button>
                  ))}
              </span>
            </figcaption>
            {/* The sheets are our own markup, built from numbers; nothing user-typed reaches them unescaped. */}
            <div className="sheet-preview bg-white" dangerouslySetInnerHTML={{ __html: s.page }} />
          </figure>
        )
      })}
    </div>
  )
}
