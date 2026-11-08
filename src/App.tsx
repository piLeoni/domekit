import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PartsList, TechniquePicker } from './components/Construction'
import Controls from './components/Controls'
import Export from './components/Export'
import Sheets from './components/Sheets'
import Stats from './components/Stats'
import { FaceSchema, HubTable, PanelTable, rowId, StrutSpectrum, StrutTable, type Pick } from './components/Taxonomy'
import { Button, GeodesicIcon, MonitorIcon, MoonIcon, SectionTitle, Segmented, SunIcon, Tabs, XIcon, FocusIcon } from './components/ui'
import Viewport from './components/Viewport'
import { buildConstruction, generateDome, type Build, type Dome } from './geodesic'
import { pieceColors } from './lib/palette'
import { DEFAULT_VIEW, readHash, useStored, writeHash, type Focus, type Settings, type ViewOptions } from './lib/state'
import { sceneColors, useTheme, type SceneColors } from './lib/theme'
import { area, deg, fmt, len, type Unit } from './lib/units'

type Tab = 'struts' | 'panels' | 'hubs' | 'schema' | 'parts' | 'sheets'
const TAB_OF: Record<NonNullable<Focus>['kind'], Tab> = { strut: 'struts', face: 'panels', hub: 'hubs' }

const sameFocus = (a: Focus, b: Focus) => a?.kind === b?.kind && a?.index === b?.index

export default function App() {
  const [settings, setSettings] = useState<Settings>(readHash)
  const [pref, setPref, scheme] = useTheme()
  const [view, setView] = useStored<ViewOptions>('geodesic.view.v4', DEFAULT_VIEW)
  const [selected, setSelected] = useState<Focus>(null)
  const [hover, setHoverState] = useState<Focus>(null)
  const [tab, setTab] = useState<Tab>('struts')
  const [resetSignal, setResetSignal] = useState(0)

  // The model reports every pointer move; only a change of family re-renders.
  const setHover = useCallback((f: Focus) => setHoverState((old) => (sameFocus(old, f) ? old : f)), [])
  // The tooltip follows the pointer over the model only; the tables say it all already.
  const [overModel, setOverModel] = useState(false)
  const hoverModel = useCallback(
    (f: Focus) => {
      setHover(f)
      setOverModel(f != null)
    },
    [setHover],
  )

  /** Picked in the model: open its tab and bring its row into view. */
  const selectFromModel = useCallback((f: Focus) => {
    setSelected(f)
    if (!f) return
    // On the Sheets tab, stay: the sheet scrolls into view by itself.
    setTab((t) => (t === 'sheets' || t === 'parts' ? t : TAB_OF[f.kind]))
    requestAnimationFrame(() => document.getElementById(rowId(f.kind, f.index))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [])

  const set = (s: Partial<Settings>) => setSettings((old) => ({ ...old, ...s }))
  useEffect(() => writeHash(settings), [settings])
  useEffect(() => {
    const onHash = () => setSettings(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const dome = useMemo(
    () =>
      generateDome({
        pattern: settings.pattern,
        frequency: settings.frequency,
        solid: settings.solid,
        radius: settings.radius,
        cut: settings.cut,
        mode: settings.mode,
        triangulate: settings.triangulate,
      }),
    [settings.pattern, settings.frequency, settings.solid, settings.radius, settings.cut, settings.mode, settings.triangulate],
  )

  // A selection survives a new dome only if its family still exists.
  useEffect(() => {
    setSelected((s) => {
      if (!s) return s
      const list = s.kind === 'strut' ? dome.strutTypes : s.kind === 'face' ? dome.faceTypes : dome.hubTypes
      return s.index < list.length ? s : null
    })
    setHoverState(null)
  }, [dome])

  const build = useMemo(
    () => buildConstruction(dome, settings.technique, settings.dims, settings.unit),
    [dome, settings.technique, settings.dims, settings.unit],
  )
  // A construction has its parts; the primitive has its families. Sheets belong to both.
  const shownTab: Tab = build ? (tab === 'sheets' ? 'sheets' : 'parts') : tab === 'parts' ? 'struts' : tab

  const [scene, setScene] = useState<SceneColors>(() => sceneColors(scheme))
  useLayoutEffect(() => setScene(sceneColors(scheme)), [scheme])

  const strutColors = useMemo(() => pieceColors(dome.strutTypes, scene.scheme, scene.muted), [dome, scene])
  const faceColors = useMemo(() => pieceColors(dome.faceTypes, scene.scheme, scene.muted), [dome, scene])

  const focus: Focus = hover ?? selected
  const pick: Pick = { focus, selected, onHover: setHover, onSelect: setSelected }
  const unit = settings.unit
  const summary = `${settings.pattern === 'goldberg' ? 'Goldberg' : 'Geodesic'} ${dome.params.frequency}V ${dome.params.solid} · r ${len(settings.radius, unit)} · cut ${fmt(settings.cut, 3)} (${settings.mode}${settings.mode === 'section' && settings.triangulate ? ', triangulated' : ''})`

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <GeodesicIcon className="h-5 w-5" />
        <span className="font-semibold">Geodesic</span>
        <span className="hidden truncate text-[13px] text-muted-foreground md:block">{summary}</span>
        <div className="ml-auto flex items-center gap-2">
          <Export dome={dome} unit={unit} build={build} />
          <Segmented
            label="Theme"
            value={pref}
            onChange={setPref}
            options={[
              { value: 'light', label: <SunIcon className="h-3.5 w-3.5" />, title: 'Light' },
              { value: 'system', label: <MonitorIcon className="h-3.5 w-3.5" />, title: 'System' },
              { value: 'dark', label: <MoonIcon className="h-3.5 w-3.5" />, title: 'Dark' },
            ]}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="scroll-thin shrink-0 space-y-7 border-b p-4 lg:w-[300px] lg:overflow-y-auto lg:border-r lg:border-b-0">
          <section className="space-y-4">
            <SectionTitle>Parameters</SectionTitle>
            <Controls settings={settings} set={set} />
          </section>
          <section className="space-y-3">
            <SectionTitle>Dimensions</SectionTitle>
            <Stats dome={dome} unit={unit} />
          </section>
        </aside>

        <main className="relative h-[60vh] shrink-0 bg-viewport lg:h-auto lg:min-w-0 lg:flex-1">
          <Viewport
            dome={dome}
            build={build}
            scene={scene}
            strutColors={strutColors}
            faceColors={faceColors}
            view={view}
            focus={focus}
            onHover={hoverModel}
            onSelect={selectFromModel}
            resetSignal={resetSignal}
          />
          <ViewToolbar view={view} setView={setView} parts={build != null} decking={!!build?.solids.some((s) => s.name.endsWith('-sheathing'))} onReset={() => setResetSignal((n) => n + 1)} />
          {selected && <Selection key={`${selected.kind}-${selected.index}`} dome={dome} build={build} selected={selected} unit={unit} onClear={() => setSelected(null)} />}
          {hover && overModel && <Tooltip key={`${hover.kind}-${hover.index}`} focus={hover} dome={dome} build={build} unit={unit} />}
        </main>

        <aside className="flex shrink-0 flex-col border-t lg:w-[420px] lg:border-t-0 lg:border-l">
          <TechniquePicker
            technique={settings.technique}
            dims={settings.dims}
            unit={unit}
            warnings={build?.warnings ?? []}
            onChange={(technique, dims) => set({ technique, dims })}
          />
          <Tabs
            value={shownTab}
            onChange={setTab}
            tabs={
              build
                ? [
                    { id: 'parts', label: 'Parts', count: build.parts.length },
                    { id: 'sheets', label: 'Sheets' },
                  ]
                : [
                    { id: 'struts', label: 'Struts', count: dome.strutTypes.filter((t) => t.count).length },
                    { id: 'panels', label: 'Panels', count: dome.faceTypes.filter((t) => t.count).length },
                    { id: 'hubs', label: 'Hubs', count: dome.hubTypes.length },
                    { id: 'schema', label: 'Schema' },
                    { id: 'sheets', label: 'Sheets' },
                  ]
            }
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3" onMouseLeave={() => setHover(null)}>
            {shownTab === 'parts' && build && <PartsList build={build} colors={{ strut: strutColors, face: faceColors, hub: scene.muted }} pick={pick} />}
            {shownTab === 'struts' && (
              <div className="space-y-3">
                <StrutSpectrum dome={dome} colors={strutColors} pick={pick} unit={unit} />
                <StrutTable dome={dome} colors={strutColors} pick={pick} unit={unit} />
              </div>
            )}
            {shownTab === 'panels' && <PanelTable dome={dome} strutColors={strutColors} faceColors={faceColors} pick={pick} unit={unit} />}
            {shownTab === 'hubs' && <HubTable dome={dome} strutColors={strutColors} pick={pick} />}
            {shownTab === 'schema' && <FaceSchema dome={dome} colors={strutColors} pick={pick} />}
            {shownTab === 'sheets' && <Sheets dome={dome} build={build} unit={unit} pick={pick} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

function ViewToolbar({ view, setView, parts, decking, onReset }: { view: ViewOptions; setView: (v: ViewOptions) => void; parts: boolean; decking: boolean; onReset: () => void }) {
  return (
    <div className="absolute top-3 left-3 flex items-center gap-1 rounded-lg border bg-card/90 p-1 shadow-[var(--shadow)] backdrop-blur">
      {parts ? (
        <Button
          variant="ghost"
          aria-pressed={view.look !== 'material'}
          className={view.look !== 'material' ? 'bg-accent' : ''}
          onClick={() => setView({ ...view, look: view.look === 'material' ? 'type' : 'material' })}
          title="Every element in its type colour; off, all plain (the type colour shows on hover)"
        >
          Colours
        </Button>
      ) : (
        <Segmented
          label="Colour by"
          value={view.colorBy}
          onChange={(colorBy) => setView({ ...view, colorBy })}
          options={[
            { value: 'struts', label: 'Struts' },
            { value: 'panels', label: 'Panels' },
          ]}
        />
      )}
      <Button
        variant="ghost"
        aria-pressed={view.labels}
        className={view.labels ? 'bg-accent' : ''}
        onClick={() => setView({ ...view, labels: !view.labels })}
        title={`Show ${view.colorBy === 'struts' ? 'strut' : 'panel'} labels on the model`}
      >
        Labels
      </Button>
      {decking && (
        <Button
          variant="ghost"
          aria-pressed={view.decking}
          className={view.decking ? 'bg-accent' : ''}
          onClick={() => setView({ ...view, decking: !view.decking })}
          title="Show the decking over the frames (always in the exports)"
        >
          Decking
        </Button>
      )}
      {parts && (
        <label className="flex items-center gap-2 px-2 text-[13px]" title="Pull the parts apart to see how they fit">
          Explode
          <input
            type="range"
            className="w-24"
            min={0}
            max={1}
            step={0.01}
            value={view.explode ?? 0}
            aria-label="Explode"
            onChange={(e) => setView({ ...view, explode: Number(e.target.value) })}
          />
        </label>
      )}
      <Button variant="ghost" size="icon" onClick={onReset} title="Reset view" aria-label="Reset view">
        <FocusIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** What a family is, in a few lines: the tooltip and the selection card share it. */
function describe(focus: NonNullable<Focus>, dome: Dome, unit: Unit, build: Build | null): { title: string; lines: string[] } {
  if (build) {
    const kind = focus.kind === 'face' ? 'panel' : focus.kind
    const part = build.parts.find((p) => p.kind === kind && p.index === focus.index)
    if (part) return { title: `${part.name} ${part.label}`, lines: [`${part.qty} pieces`, ...part.spec.split(' · ')] }
  }
  if (focus.kind === 'strut') {
    const t = dome.strutTypes[focus.index]
    const title =
      t.kind === 'cut' ? `Strut ${t.label} · cut from ${dome.strutTypes[t.parent!].label}` : t.kind === 'ring' ? `Strut ${t.label} · base ring` : `Strut ${t.label}`
    return {
      title,
      lines: [
        `${t.count} × ${len(t.length, unit)}`,
        [
          t.endAngle != null && `hub ${deg(t.endAngle)}${t.endAngle2 != null ? ` / ${deg(t.endAngle2)}` : ''}`,
          t.kind === 'cut' && t.cutAngle != null && `cut ${deg(t.cutAngle)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      ].filter(Boolean),
    }
  }
  if (focus.kind === 'face') {
    const t = dome.faceTypes[focus.index]
    return {
      title: `Panel ${t.label} · ${t.signature}${t.kind === 'cut' ? ` · cut from ${dome.faceTypes[t.parent!].label}` : ''}`,
      lines: [
        `${t.count} × ${area(t.area, unit)} · ${t.outline.length} sides`,
        t.angles.map(deg).join('  '),
        ...(t.mirrorOf != null ? [`mirror image of ${dome.faceTypes[t.mirrorOf].label}`] : []),
      ],
    }
  }
  const t = dome.hubTypes[focus.index]
  return {
    title: t.kind === 'cut' ? `Cut point ${t.label}` : `Hub ${t.label} · ${t.valence}-way${t.base ? ', base' : ''}`,
    lines: [
      `${t.count} in this dome · struts ${t.arms.map((a) => a.strut).join(' ')}`,
      `turns ${t.arms.map((a) => deg(a.turn)).join('  ')}`,
      ...(t.mirrorOf != null ? [`mirror image of ${dome.hubTypes[t.mirrorOf].label}`] : []),
    ],
  }
}

function Selection({ dome, build, selected, unit, onClear }: { dome: Dome; build: Build | null; selected: NonNullable<Focus>; unit: Unit; onClear: () => void }) {
  const { title, lines } = describe(selected, dome, unit, build)
  return (
    <div className="fade-in absolute top-3 right-3 flex max-w-72 items-start gap-2 rounded-lg border bg-card/95 py-2 pr-1.5 pl-3 shadow-[var(--shadow)] backdrop-blur">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">Selected</div>
        <div className="text-[13px] font-medium">{title}</div>
        {lines.map((l) => (
          <div key={l} className="num text-xs text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear} aria-label="Clear selection" title="Clear (Esc)">
        <XIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/** Follows the pointer on its own, so the page does not re-render as it moves. */
function Tooltip({ focus, dome, build, unit }: { focus: NonNullable<Focus>; dome: Dome; build: Build | null; unit: Unit }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      const x = e.clientX + 14 + el.offsetWidth > window.innerWidth ? e.clientX - 14 - el.offsetWidth : e.clientX + 14
      const y = e.clientY + 14 + el.offsetHeight > window.innerHeight ? e.clientY - 14 - el.offsetHeight : e.clientY + 14
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const { title, lines } = describe(focus, dome, unit, build)
  return (
    <div
      ref={ref}
      className="fade-in pointer-events-none fixed top-0 left-0 z-50 rounded-md border bg-card px-2.5 py-1.5 whitespace-nowrap shadow-[var(--shadow)]"
      style={{ transform: 'translate(-9999px, 0)' }}
    >
      <div className="text-[13px] font-medium">{title}</div>
      {lines.map((l) => (
        <div key={l} className="num text-xs text-muted-foreground">
          {l}
        </div>
      ))}
      <div className="mt-0.5 text-[11px] text-muted-foreground">Click to select</div>
    </div>
  )
}
