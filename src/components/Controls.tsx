import type { CutMode } from '../geodesic'
import { MAX_FREQUENCY, type Settings } from '../lib/state'
import { len, UNITS, type Unit } from '../lib/units'
import { Field, NumberField, Segmented, Select } from './ui'

const MODES: { id: CutMode; title: string; text: string }[] = [
  { id: 'exclude', title: 'Exclude', text: 'Keep only what lies wholly above the plane.' },
  { id: 'include', title: 'Include', text: 'Keep everything that reaches above it, whole.' },
  { id: 'section', title: 'Section', text: 'Trim at the plane; trimmed pieces join the taxonomy.' },
]

export default function Controls({ settings, set }: { settings: Settings; set: (s: Partial<Settings>) => void }) {
  const R = settings.radius
  const D = 2 * R

  return (
    <div className="space-y-5">
      <Field
        label="Pattern"
        hint={
          settings.pattern === 'goldberg'
            ? 'Flat pentagons and hexagons, each touching the sphere at one geodesic hub; three struts at every node.'
            : 'Triangles; hubs on the sphere.'
        }
      >
        <Segmented
          label="Pattern"
          className="w-full"
          value={settings.pattern}
          onChange={(pattern) => set({ pattern })}
          options={[
            { value: 'geodesic', label: 'Geodesic' },
            { value: 'goldberg', label: 'Goldberg' },
          ]}
        />
      </Field>

      <Field label="Frequency" aside={`${settings.frequency}V`}>
        <input
          type="range"
          className="w-full"
          min={1}
          max={MAX_FREQUENCY}
          step={1}
          value={settings.frequency}
          aria-label="Frequency"
          onChange={(e) => set({ frequency: Number(e.target.value) })}
        />
        {/* Each number centred under its thumb stop: the thumb's centre runs from 7px to 100% − 7px. */}
        <div className="num relative h-3.5 text-[10px] text-muted-foreground">
          {Array.from({ length: MAX_FREQUENCY }, (_, i) => (
            <span
              key={i}
              className={`absolute -translate-x-1/2 ${i + 1 === settings.frequency ? 'font-medium text-foreground' : ''}`}
              style={{ left: `calc(7px + (100% - 14px) * ${i / (MAX_FREQUENCY - 1)})` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </Field>

      <Field label="Base solid">
        <Segmented
          label="Base solid"
          className="w-full"
          value={settings.solid}
          onChange={(solid) => set({ solid })}
          options={[
            { value: 'icosahedron', label: 'Icosahedron' },
            { value: 'octahedron', label: 'Octahedron' },
          ]}
        />
      </Field>

      <Field label="Radius" hint={`Diameter ${len(D, settings.unit)}`}>
        <div className="flex gap-2">
          <NumberField value={R} min={0.001} max={1e6} digits={6} label="Radius" onCommit={(r) => set({ radius: r })} />
          <Select value={settings.unit} aria-label="Unit" onChange={(e) => set({ unit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </div>
      </Field>

      <Field label="Cut" hint="Measured from the top of the sphere: 0.5 is the equator, 1 the whole sphere.">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Coefficient</span>
            <NumberField value={settings.cut} min={0.001} max={1} digits={4} label="Cut coefficient" onCommit={(c) => set({ cut: c })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Height ({settings.unit})</span>
            <NumberField value={settings.cut * D} min={0.001 * D} max={D} digits={4} label="Cut height from the top" onCommit={(h) => set({ cut: h / D })} />
          </label>
        </div>
        <input
          type="range"
          className="w-full"
          min={0.001}
          max={1}
          step={0.001}
          value={settings.cut}
          aria-label="Cut"
          onChange={(e) => set({ cut: Number(e.target.value) })}
        />
      </Field>

      <Field label="At the plane">
        <div role="radiogroup" aria-label="At the plane" className="space-y-1.5">
          {MODES.map((m) => {
            const on = settings.mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ mode: m.id })}
                className={`flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors duration-200 ${on ? 'border-foreground' : 'hover:bg-accent'}`}
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? 'border-foreground' : 'border-input'}`}>
                  {on && <span className="h-2 w-2 rounded-full bg-foreground" />}
                </span>
                <span>
                  <span className="block text-[13px] font-medium">{m.title}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{m.text}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )
}
