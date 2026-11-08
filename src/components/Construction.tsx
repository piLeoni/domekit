import { useState } from 'react'
import type { Build, Technique } from '../geodesic'
import { defaultDims, techniqueSpec } from '../geodesic'
import type { Focus } from '../lib/state'
import type { Unit } from '../lib/units'
import { rowId, Swatch, type Pick } from './Taxonomy'
import { NumberField, Select } from './ui'

/** The techniques by family, as the dropdown lists them. */
const GROUPS: { label: string; ids: Technique[] }[] = [
  { label: 'Geometry', ids: ['primitive'] },
  { label: 'Hubless timber', ids: ['mitre1', 'mitre2', 'frames'] },
  { label: 'Hubless sheet', ids: ['panels', 'folded', 'lapped'] },
  { label: 'Hub and strut', ids: ['timber', 'pipe', 'plates'] },
]

const plural = (name: string) => (name.endsWith('ing') ? name : `${name}s`)

const imperial = (u: Unit) => u === 'ft' || u === 'in'

/** The technique picker and its material dimensions, in mm (or inches for imperial domes). */
export function TechniquePicker({
  technique,
  dims,
  unit,
  warnings,
  onChange,
}: {
  technique: Technique
  dims: Record<string, number>
  unit: Unit
  warnings: string[]
  onChange: (technique: Technique, dims: Record<string, number>) => void
}) {
  const spec = techniqueSpec(technique)
  const values = { ...defaultDims(technique), ...dims }
  const inch = imperial(unit)
  const changed = Object.keys(dims).some((k) => dims[k] !== defaultDims(technique)[k])
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-3 border-b p-3">
      <label className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-medium">Construction</span>
        <Select className="w-full" value={technique} aria-label="Construction technique" onChange={(e) => onChange(e.target.value as Technique, {})}>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.ids.map((id) => (
                <option key={id} value={id}>
                  {techniqueSpec(id).name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      <p className="text-[13px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">{spec.name}.</span> {spec.text}
      </p>
      {spec.dims.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open}
              className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
              onClick={() => setOpen(!open)}
            >
              <span className={`ease inline-block text-muted-foreground ${open ? 'rotate-90' : ''}`}>›</span>
              Dimensions
              <span className="font-normal text-muted-foreground">
                {spec.dims.filter((d) => !d.toggle).length} · {inch ? 'in' : 'mm'}
              </span>
            </button>
            {changed && (
              <button type="button" className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => onChange(technique, {})}>
                Reset to defaults
              </button>
            )}
          </div>
          {open && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {spec.dims.map((d) =>
              d.toggle ? (
                <div key={d.key} className="col-span-2 flex items-center gap-2.5 pt-1">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">{d.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={values[d.key] >= 0.5}
                    aria-label={d.label}
                    onClick={() => onChange(technique, { ...dims, [d.key]: values[d.key] >= 0.5 ? 0 : 1 })}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${values[d.key] >= 0.5 ? 'bg-foreground' : 'bg-input'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-200 ${values[d.key] >= 0.5 ? 'translate-x-4' : ''}`}
                    />
                  </button>
                </div>
              ) : (
              <label key={d.key} className="space-y-1">
                <span className="block truncate text-xs text-muted-foreground" title={d.label}>
                  {d.label}
                </span>
                <NumberField
                  value={inch ? values[d.key] / 25.4 : values[d.key]}
                  min={inch ? d.min / 25.4 : d.min}
                  max={inch ? d.max / 25.4 : d.max}
                  digits={inch ? 3 : 1}
                  label={d.label}
                  onCommit={(v) => onChange(technique, { ...dims, [d.key]: inch ? v * 25.4 : v })}
                />
              </label>
              ),
            )}
          </div>
          )}
        </div>
      )}
      {warnings.map((w) => (
        <p key={w} role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-snug">
          {w}
        </p>
      ))}
    </div>
  )
}

const same = (f: Focus, kind: NonNullable<Focus>['kind'], index: number) => f?.kind === kind && f.index === index
const FOCUS: Record<'strut' | 'panel' | 'hub', NonNullable<Focus>['kind']> = { strut: 'strut', panel: 'face', hub: 'hub' }

/** Every part type of the construction, by kind, then the hardware. */
export function PartsList({ build, colors, pick }: { build: Build; colors: { strut: string[]; face: string[]; hub: string }; pick: Pick }) {
  const groups = [...new Set(build.parts.map((p) => p.name))]
  return (
    <div className="space-y-5">
      {groups.map((name) => {
        const parts = build.parts.filter((p) => p.name === name)
        return (
          <section key={name}>
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="text-[13px] font-medium">{plural(name)}</h3>
              <span className="text-xs text-muted-foreground">
                {parts.length} types · {parts.reduce((s, p) => s + p.qty, 0)} pieces
              </span>
            </div>
            <table className="w-full text-[13px]">
              <tbody>
                {parts.map((p) => {
                  const kind = FOCUS[p.kind]
                  const selected = same(pick.selected, kind, p.index)
                  const lit = same(pick.focus, kind, p.index)
                  const color = kind === 'strut' ? colors.strut[p.index] : kind === 'face' ? colors.face[p.index] : colors.hub
                  return (
                    <tr
                      key={p.id}
                      id={rowId(kind, p.index)}
                      aria-selected={selected}
                      className={`ease cursor-pointer border-b last:border-0 ${selected ? 'bg-accent shadow-[inset_2px_0_0_var(--foreground)]' : lit ? 'bg-muted' : 'hover:bg-muted'}`}
                      onMouseEnter={() => pick.onHover({ kind, index: p.index })}
                      onMouseLeave={() => pick.onHover(null)}
                      onClick={() => pick.onSelect(selected ? null : { kind, index: p.index })}
                    >
                      <td className="w-5 py-1.5 pl-1">
                        <Swatch color={color} />
                      </td>
                      <td className="w-10 py-1.5 font-medium">{p.label}</td>
                      <td className="num w-12 py-1.5 text-muted-foreground">× {p.qty}</td>
                      <td className="num py-1.5 pr-1 text-xs text-muted-foreground">{p.spec}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
      {build.hardware.length > 0 && (
        <section>
          <h3 className="mb-1.5 px-1 text-[13px] font-medium">Hardware</h3>
          <table className="w-full text-[13px]">
            <tbody>
              {build.hardware.map((h) => (
                <tr key={h.spec} className="border-b last:border-0">
                  <td className="py-1.5 pl-1 font-medium">{h.label}</td>
                  <td className="num w-14 py-1.5 text-muted-foreground">× {h.qty}</td>
                  <td className="num py-1.5 pr-1 text-xs text-muted-foreground">{h.spec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="px-1 text-xs leading-snug text-muted-foreground">
        Sizes are for the parts as modelled: sharp bends, no bend allowance. Check one of each against the drawing before cutting the batch.
      </p>
    </div>
  )
}
