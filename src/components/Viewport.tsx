import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry, PolarGridHelper, ShapeUtils, Vector2, Vector3, type Material } from 'three'
import type { LineSegments2 } from 'three-stdlib'
import type { Build, Dome, Material as PartMaterial, Vec3 } from '../geodesic'
import { fade } from '../lib/palette'
import type { Focus, ViewOptions } from '../lib/state'
import type { SceneColors } from '../lib/theme'

type Kind = NonNullable<Focus>['kind']

interface Props {
  dome: Dome
  /** The parts of a construction technique; null shows the primitive. */
  build: Build | null
  scene: SceneColors
  strutColors: string[]
  faceColors: string[]
  view: ViewOptions
  /** What is lit: the hovered family, else the selected one. */
  focus: Focus
  onHover: (f: Focus) => void
  onSelect: (f: Focus) => void
  /** Bumped to put the camera back where it started. */
  resetSignal: number
}

/** The lowest point kept: below the cut plane when `include` lets panels hang. */
const lowest = (dome: Dome) => Math.min(dome.cutZ, ...dome.vertices.map((v) => v[2]))

/** Dome z-up → three.js y-up, centred on the dome's mid-height. */
function placer(dome: Dome) {
  const mid = (1 + lowest(dome)) / 2
  return ([x, y, z]: Vec3) => new Vector3(x, z - mid, -y)
}

/**
 * How far the families not in focus recede toward the background. Less on a
 * dark background, where a faded line all but disappears.
 */
const recede = (scene: SceneColors) => (scene.scheme === 'dark' ? 0.55 : 0.78)

const lit = (focus: Focus, kind: Kind, type: number) => !focus || focus.kind !== kind || focus.index === type

/** A click that ended a drag is an orbit, not a pick. */
const isClick = (e: ThreeEvent<MouseEvent>) => e.delta < 4

/** How fast lit levels ease toward their target, per second: ~200 ms to settle. */
const EASE = 14

/**
 * Per-type levels between 0 and 1 that ease toward `goal`, calling `paint`
 * with the current levels whenever they move. A new dome starts settled, so
 * only focus changes animate.
 */
function useLevels(count: number, goal: (type: number) => boolean, goalKey: unknown, paint: (levels: Float32Array) => void, deps: unknown[]) {
  const levels = useRef(new Float32Array(0))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const target = useMemo(() => Float32Array.from({ length: count }, (_, t) => (goal(t) ? 1 : 0)), [count, goalKey])
  const paintRef = useRef(paint)
  paintRef.current = paint
  useLayoutEffect(() => {
    if (levels.current.length !== count) levels.current = target.slice()
    paintRef.current(levels.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useFrame((_, dt) => {
    const l = levels.current
    if (l.length !== target.length) return
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * EASE)
    let moved = false
    for (let t = 0; t < l.length; t++) {
      const d = target[t] - l[t]
      if (d === 0) continue
      l[t] = Math.abs(d) < 0.004 ? target[t] : l[t] + d * k
      moved = true
    }
    if (moved) paintRef.current(l)
  })
}

/** A material that fades in when it mounts. */
function useFadeIn(ref: { current: { material: Material | Material[] } | null }, to = 1) {
  useFrame((_, dt) => {
    const m = ref.current?.material
    if (!m || Array.isArray(m) || m.opacity >= to) return
    m.opacity = Math.min(to, m.opacity + dt * EASE * 0.4)
  })
}

/**
 * The struts as flat lines, one colour per type. Whole struts are solid; cut
 * pieces dashed in their parent's colour; ring struts in the neutral ink.
 * The type in focus is drawn again, thicker, on top.
 */
function Struts({ dome, scene, strutColors, view, focus, onHover, onSelect }: Props) {
  const at = useMemo(() => placer(dome), [dome])
  const groups = useMemo(() => {
    const solid: number[] = []
    const dashed: number[] = []
    dome.struts.forEach((s, i) => (dome.strutTypes[s.type].kind === 'whole' ? solid : dashed).push(i))
    const points = (ids: number[]) => ids.flatMap((i) => [at(dome.vertices[dome.struts[i].a]), at(dome.vertices[dome.struts[i].b])])
    return { solid, dashed, solidPts: points(solid), dashedPts: points(dashed) }
  }, [dome, at])

  // Each type's colour lit and receded; the animation mixes between the two.
  const palette = useMemo(() => {
    const neutral = fade(scene.foreground, scene.background, 0.35)
    const on = dome.strutTypes.map((_, t) => new Color(view.colorBy === 'struts' ? strutColors[t] : neutral))
    const off = dome.strutTypes.map((_, t) => new Color(fade(view.colorBy === 'struts' ? strutColors[t] : neutral, scene.background, recede(scene))))
    return { on, off }
  }, [dome, strutColors, scene, view.colorBy])
  const initial = (ids: number[]) => ids.flatMap((i) => [palette.on[dome.struts[i].type], palette.on[dome.struts[i].type]])
  const solidColors = useMemo(() => initial(groups.solid), [groups, palette]) // eslint-disable-line react-hooks/exhaustive-deps
  const dashedColors = useMemo(() => initial(groups.dashed), [groups, palette]) // eslint-disable-line react-hooks/exhaustive-deps

  const solidRef = useRef<LineSegments2>(null)
  const dashedRef = useRef<LineSegments2>(null)
  const c = useMemo(() => new Color(), [])
  useLevels(
    dome.strutTypes.length,
    (t) => lit(focus, 'strut', t),
    focus,
    (levels) => {
      for (const [ref, ids] of [
        [solidRef, groups.solid],
        [dashedRef, groups.dashed],
      ] as const) {
        const line = ref.current
        if (!line || !ids.length) continue
        const arr = new Float32Array(ids.length * 6)
        ids.forEach((i, k) => {
          const t = dome.struts[i].type
          c.copy(palette.off[t]).lerp(palette.on[t], levels[t])
          arr.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6)
        })
        line.geometry.setColors(arr)
      }
    },
    [groups, palette],
  )

  const pick = (ids: number[]) => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (e.faceIndex != null && ids[e.faceIndex] != null) onHover({ kind: 'strut', index: dome.struts[ids[e.faceIndex]].type })
    },
    onPointerOut: () => onHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (isClick(e) && e.faceIndex != null && ids[e.faceIndex] != null) onSelect({ kind: 'strut', index: dome.struts[ids[e.faceIndex]].type })
    },
  })

  const width = Math.max(1.2, Math.min(2.2, 9 / dome.params.frequency))

  return (
    <>
      {groups.solidPts.length > 0 && (
        <Line ref={solidRef} key={`s${dome.struts.length}`} segments points={groups.solidPts} vertexColors={solidColors} lineWidth={width} {...pick(groups.solid)} />
      )}
      {groups.dashedPts.length > 0 && (
        <Line
          ref={dashedRef}
          key={`d${dome.struts.length}`}
          segments
          points={groups.dashedPts}
          vertexColors={dashedColors}
          lineWidth={width}
          dashed
          dashSize={0.025}
          gapSize={0.015}
          {...pick(groups.dashed)}
        />
      )}
      {focus?.kind === 'strut' && (
        <FocusLine
          key={`f${focus.index}-${dome.struts.length}`}
          points={dome.struts.flatMap((s) => (s.type === focus.index ? [at(dome.vertices[s.a]), at(dome.vertices[s.b])] : []))}
          color={view.colorBy === 'struts' ? strutColors[focus.index] : scene.foreground}
          width={width + 1.8}
        />
      )}
    </>
  )
}

/** The struts in focus, drawn again thicker; fades in. */
function FocusLine({ points, color, width }: { points: Vector3[]; color: string; width: number }) {
  const ref = useRef<LineSegments2>(null)
  useFadeIn(ref)
  if (!points.length) return null
  return <Line ref={ref} segments points={points} color={color} lineWidth={width} transparent opacity={0} renderOrder={2} raycast={() => null} />
}

/**
 * The panels as a flat fill. Neutral, they are the background colour, just
 * opaque enough to push the struts behind them back; coloured, each type
 * takes its colour, softened.
 */
function Panels({ dome, scene, faceColors, view, focus, onHover, onSelect }: Props) {
  const { geometry, faceOf } = useMemo(() => {
    const at = placer(dome)
    const faceOf: number[] = []
    const pos: number[] = []
    dome.faces.forEach((f, i) => {
      for (let k = 1; k < f.v.length - 1; k++) {
        faceOf.push(i)
        for (const v of [f.v[0], f.v[k], f.v[k + 1]]) {
          const p = at(dome.vertices[v])
          pos.push(p.x, p.y, p.z)
        }
      }
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.length), 3))
    return { geometry: g, faceOf }
  }, [dome])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const colored = view.colorBy === 'panels'
  // Lit and receded colour per panel type. Neutral panels are the background,
  // and only the one in focus takes its colour.
  const palette = useMemo(() => {
    const bg = new Color(scene.background)
    const on = dome.faceTypes.map((_, t) => new Color(colored ? fade(faceColors[t], scene.background, 0.25) : fade(faceColors[t], scene.background, 0.45)))
    const off = dome.faceTypes.map((_, t) => (colored ? new Color(fade(faceColors[t], scene.background, scene.scheme === 'dark' ? 0.72 : 0.85)) : bg))
    return { on, off, bg }
  }, [dome, faceColors, scene, colored])

  const c = useMemo(() => new Color(), [])
  useLevels(
    dome.faceTypes.length,
    // Coloured: every type lit unless another panel is in focus. Neutral: only the panel in focus takes colour.
    colored ? (t) => lit(focus, 'face', t) : (t) => focus?.kind === 'face' && focus.index === t,
    `${colored}|${focus?.kind}|${focus?.index}`,
    (levels) => {
      const attr = geometry.getAttribute('color') as BufferAttribute
      faceOf.forEach((fi, t) => {
        const type = dome.faces[fi].type
        if (colored) c.copy(palette.off[type]).lerp(palette.on[type], levels[type])
        else c.copy(palette.bg).lerp(palette.on[type], levels[type])
        for (let k = 0; k < 3; k++) attr.setXYZ(t * 3 + k, c.r, c.g, c.b)
      })
      attr.needsUpdate = true
    },
    [geometry, faceOf, palette],
  )

  return (
    <mesh
      geometry={geometry}
      renderOrder={1}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (e.faceIndex != null) onHover({ kind: 'face', index: dome.faces[faceOf[e.faceIndex]].type })
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation()
        if (isClick(e) && e.faceIndex != null) onSelect({ kind: 'face', index: dome.faces[faceOf[e.faceIndex]].type })
      }}
    >
      <meshBasicMaterial
        vertexColors
        side={DoubleSide}
        transparent
        opacity={colored ? 0.92 : 0.82}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={2}
        polygonOffsetUnits={2}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * The parts of a construction, as shaded solids: struts and panels in their
 * type's colour (for the family carrying colour), plates and hardware in
 * neutral tones, crisp edges where faces meet at an angle.
 */
function BuildModel({ dome, build, scene, strutColors, faceColors, view, focus, onHover, onSelect }: Props & { build: Build }) {
  const decking = view.decking ?? false
  const { geometry, edges, slotOf, slots, base, dirs, edgeBase, edgeDirs } = useMemo(() => {
    const at = placer(dome)
    const R = dome.params.radius
    const place = (p: Vec3) => at([p[0] / R, p[1] / R, p[2] / R])
    // One slot per family in the model (kind + type), plus one for hardware.
    const slots: { kind: Kind | null; index: number; material: PartMaterial; tint?: number }[] = []
    const slotKey = new Map<string, number>()
    const slotFor = (kind: Kind | null, index: number, material: PartMaterial, tint?: number) => {
      const key = `${kind}|${index}|${material}|${tint}`
      let s = slotKey.get(key)
      if (s == null) {
        s = slots.length
        slots.push({ kind, index, material, tint })
        slotKey.set(key, s)
      }
      return s
    }
    // Each group moves out along the direction from the sphere centre to its middle.
    const groupDir = new Map<string, Vector3>()
    for (const ps of build.solids) {
      const c = ps.solid.points.reduce((acc, p) => acc.add(new Vector3(p[0], p[2], -p[1])), new Vector3()).multiplyScalar(1 / ps.solid.points.length)
      groupDir.set(ps.group, (groupDir.get(ps.group) ?? new Vector3()).add(c))
    }
    for (const v of groupDir.values()) v.normalize()

    const KIND: Record<'strut' | 'panel' | 'hub', Kind> = { strut: 'strut', panel: 'face', hub: 'hub' }
    const pos: number[] = []
    const dir: number[] = []
    const slotOf: number[] = []
    const edgePos: number[] = []
    const edgeDir: number[] = []
    // Decking over a frame is drawn see-through, last, so the frame shows.
    const seeThrough = (ps: Build['solids'][number]) => ps.name.endsWith('-sheathing')
    // Decking is optional in the view; the exports always have it.
    const shown = build.solids.filter((x) => decking || !seeThrough(x))
    const ordered = [...shown.filter((x) => !seeThrough(x)), ...shown.filter(seeThrough)]
    let split = -1
    for (const ps of ordered) {
      if (split < 0 && seeThrough(ps)) split = pos.length / 3
      const slot = slotFor(ps.kind ? KIND[ps.kind] : null, ps.index, ps.material, ps.tint)
      const pts = ps.solid.points.map(place)
      const dv = groupDir.get(ps.group)!.clone().multiplyScalar(1 + (ps.lift ?? 0) * 0.25)
      const start = pos.length
      for (const face of ps.solid.faces) {
        let tris: number[][]
        if (face.length === 1 && face[0].length <= 4) {
          const l = face[0]
          tris = Array.from({ length: l.length - 2 }, (_, k) => [l[0], l[k + 1], l[k + 2]])
        } else {
          // A face with holes, or a notched one: triangulate in its own plane.
          const p0 = pts[face[0][0]]
          const n = new Vector3()
          const l = face[0]
          for (let i = 0; i < l.length; i++) {
            const a = pts[l[i]]
            const b = pts[l[(i + 1) % l.length]]
            n.x += (a.y - b.y) * (a.z + b.z)
            n.y += (a.z - b.z) * (a.x + b.x)
            n.z += (a.x - b.x) * (a.y + b.y)
          }
          n.normalize()
          const u = pts[l[1]].clone().sub(p0).normalize()
          const v = n.clone().cross(u)
          const flat = (i: number) => {
            const d = pts[i].clone().sub(p0)
            return new Vector2(d.dot(u), d.dot(v))
          }
          const all = face.flat()
          const idx = ShapeUtils.triangulateShape(face[0].map(flat), face.slice(1).map((h) => h.map(flat)))
          tris = idx.map((t) => t.map((k) => all[k]))
        }
        for (const t of tris) {
          slotOf.push(slot)
          for (const i of t) {
            pos.push(pts[i].x, pts[i].y, pts[i].z)
            dir.push(dv.x, dv.y, dv.z)
          }
        }
      }
      // Crisp edges where this solid's faces meet at an angle.
      const one = new BufferGeometry()
      one.setAttribute('position', new BufferAttribute(new Float32Array(pos.slice(start)), 3))
      const e = new EdgesGeometry(one, 25)
      const ep = e.getAttribute('position').array
      for (let i = 0; i < ep.length; i += 3) {
        edgePos.push(ep[i], ep[i + 1], ep[i + 2])
        edgeDir.push(dv.x, dv.y, dv.z)
      }
      one.dispose()
      e.dispose()
    }
    const base = new Float32Array(pos)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(base.slice(), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.length), 3))
    g.computeVertexNormals()
    if (split < 0) split = pos.length / 3
    g.addGroup(0, split, 0)
    g.addGroup(split, pos.length / 3 - split, 1)
    const edgeBase = new Float32Array(edgePos)
    const edges = new BufferGeometry()
    edges.setAttribute('position', new BufferAttribute(edgeBase.slice(), 3))
    return { geometry: g, edges, slotOf, slots, base, dirs: new Float32Array(dir), edgeBase, edgeDirs: new Float32Array(edgeDir) }
  }, [dome, build, decking])
  useLayoutEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges],
  )

  // Pull the parts apart: every group out along its own direction.
  useLayoutEffect(() => {
    const k = view.explode * 0.3
    for (const [g, b, d] of [
      [geometry, base, dirs],
      [edges, edgeBase, edgeDirs],
    ] as const) {
      const attr = g.getAttribute('position') as BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < arr.length; i++) arr[i] = b[i] + d[i] * k
      attr.needsUpdate = true
      g.computeBoundingSphere()
    }
  }, [geometry, edges, base, dirs, edgeBase, edgeDirs, view.explode])

  const palette = useMemo(() => {
    const dark = scene.scheme === 'dark'
    // Colours off: every part a plain off-white, hardware a little darker so it still reads.
    const material: Record<PartMaterial, string> = dark
      ? { wood: '#c9c7c2', sheet: '#d6d4cf', steel: '#c9c7c2', bolt: '#7d7b77' }
      : { wood: '#f1efea', sheet: '#f6f5f1', steel: '#f1efea', bolt: '#8a8781' }
    const typeColor = ({ kind, index, material: m, tint }: (typeof slots)[number]) =>
      tint != null ? strutColors[tint] : kind === 'strut' ? strutColors[index] : kind === 'face' ? fade(faceColors[index], scene.background, 0.15) : material[m]
    // Colours off: plain; the family in focus still takes its type colour.
    const base = slots.map((sl) =>
      view.look === 'type' || (focus && sl.kind === focus.kind && sl.index === focus.index) ? typeColor(sl) : material[sl.material],
    )
    return {
      on: base.map((c) => new Color(c)),
      off: base.map((c) => new Color(fade(c, scene.background, recede(scene)))),
    }
  }, [slots, scene, strutColors, faceColors, view.look, focus])

  const c = useMemo(() => new Color(), [])
  useLevels(
    slots.length,
    (s) => (slots[s].kind ? lit(focus, slots[s].kind!, slots[s].index) : !focus),
    focus,
    (levels) => {
      const attr = geometry.getAttribute('color') as BufferAttribute
      slotOf.forEach((s, t) => {
        c.copy(palette.off[s]).lerp(palette.on[s], levels[s])
        for (let k = 0; k < 3; k++) attr.setXYZ(t * 3 + k, c.r, c.g, c.b)
      })
      attr.needsUpdate = true
    },
    [geometry, slotOf, palette],
  )

  const focusOf = (faceIndex: number | undefined): Focus => {
    if (faceIndex == null) return null
    const s = slots[slotOf[faceIndex]]
    return s?.kind ? { kind: s.kind, index: s.index } : null
  }

  return (
    <>
      <hemisphereLight args={['#ffffff', '#888888', 1.6]} />
      <directionalLight position={[3, 5, 2]} intensity={1.4} />
      <mesh
        geometry={geometry}
        onPointerMove={(e) => {
          e.stopPropagation()
          onHover(focusOf(e.faceIndex ?? undefined))
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          if (isClick(e)) onSelect(focusOf(e.faceIndex ?? undefined))
        }}
      >
        <meshLambertMaterial attach="material-0" vertexColors flatShading side={DoubleSide} />
        <meshLambertMaterial attach="material-1" vertexColors flatShading side={DoubleSide} transparent opacity={0.38} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={fade(scene.foreground, scene.background, scene.scheme === 'dark' ? 0.5 : 0.55)} transparent opacity={0.85} />
      </lineSegments>
    </>
  )
}

/** A small ring texture for marking the hubs of the selected type: no other hubs are drawn. */
function ringTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 9
  g.beginPath()
  g.arc(32, 32, 24, 0, Math.PI * 2)
  g.stroke()
  return new CanvasTexture(c)
}

function HubMarks({ dome, scene, focus }: Pick<Props, 'dome' | 'scene' | 'focus'>) {
  const texture = useMemo(ringTexture, [])
  const ref = useRef<{ material: Material } | null>(null)
  useFadeIn(ref)
  const geometry = useMemo(() => {
    if (focus?.kind !== 'hub') return null
    const at = placer(dome)
    const pos: number[] = []
    dome.hubs.forEach((h, i) => {
      if (h.type !== focus.index) return
      const p = at(dome.vertices[i])
      pos.push(p.x, p.y, p.z)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    return g
  }, [dome, focus])
  useLayoutEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <points key={`${focus?.index}`} ref={ref as never} geometry={geometry} renderOrder={3}>
      <pointsMaterial map={texture} color={scene.foreground} size={14} sizeAttenuation={false} transparent opacity={0} alphaTest={0.05} depthTest={false} />
    </points>
  )
}

/**
 * Type labels on the model, drawn on a 2D canvas laid over it: one per strut
 * (at its middle) or per panel (at its centre), for whichever family carries
 * colour. Labels on the far side are skipped, and where two would overlap the
 * nearer one wins. Redrawn only when the camera or the content changes.
 */
function Labels({ dome, scene, view, focus, overlay }: Pick<Props, 'dome' | 'scene' | 'view' | 'focus'> & { overlay: React.RefObject<HTMLCanvasElement | null> }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const items = useMemo(() => {
    const at = placer(dome)
    const centre = new Vector3(0, -(1 + lowest(dome)) / 2, 0)
    const make = (p: Vector3, type: number, text: string) => ({ p, n: p.clone().sub(centre).normalize(), type, text })
    if (view.colorBy === 'struts') {
      return dome.struts.map((s) => make(at(dome.vertices[s.a]).add(at(dome.vertices[s.b])).multiplyScalar(0.5), s.type, dome.strutTypes[s.type].label))
    }
    return dome.faces.map((f) => {
      const c = f.v.reduce((acc, v) => acc.add(at(dome.vertices[v])), new Vector3()).multiplyScalar(1 / f.v.length)
      return make(c, f.type, dome.faceTypes[f.type].label)
    })
  }, [dome, view.colorBy])

  const dirty = useRef(true)
  useEffect(() => {
    dirty.current = true
  }, [items, focus, scene, view.labels, size])
  const lastCam = useRef('')

  useFrame(() => {
    const c = overlay.current
    if (!c) return
    const camKey = camera.matrixWorld.elements.map((x) => x.toFixed(5)).join()
    if (!dirty.current && camKey === lastCam.current) return
    dirty.current = false
    lastCam.current = camKey
    const dpr = window.devicePixelRatio || 1
    const { width: w, height: h } = size
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    if (!view.labels) return
    const kind = view.colorBy === 'struts' ? 'strut' : 'face'
    const camPos = camera.position
    const v = new Vector3()
    const shown = items
      .filter((it) => it.n.dot(v.copy(camPos).sub(it.p)) > 0)
      .map((it) => {
        v.copy(it.p).project(camera)
        return { it, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z }
      })
      .sort((a, b) => a.z - b.z)
    g.font = '600 11px ui-sans-serif, system-ui, -apple-system, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 3
    g.strokeStyle = scene.background
    // A coarse grid of taken cells keeps labels from piling up.
    const cell = 14
    const taken = new Set<string>()
    for (const { it, x, y } of shown) {
      const tw = g.measureText(it.text).width + 4
      const cx0 = Math.floor((x - tw / 2) / cell)
      const cx1 = Math.floor((x + tw / 2) / cell)
      const cy = Math.floor(y / cell)
      let free = true
      for (let cx = cx0; cx <= cx1 && free; cx++) if (taken.has(`${cx},${cy}`)) free = false
      if (!free) continue
      for (let cx = cx0; cx <= cx1; cx++) taken.add(`${cx},${cy}`)
      const on = !focus || focus.kind !== kind || focus.index === it.type
      g.globalAlpha = on ? 1 : scene.scheme === 'dark' ? 0.45 : 0.3
      g.strokeText(it.text, x, y)
      g.fillStyle = scene.foreground
      g.fillText(it.text, x, y)
    }
    g.globalAlpha = 1
  })
  return null
}

/** The cut plane's trace on the sphere, dashed. */
function CutRing({ dome, scene }: Pick<Props, 'dome' | 'scene'>) {
  const points = useMemo(() => {
    const at = placer(dome)
    const r = Math.sqrt(Math.max(0, 1 - dome.cutZ * dome.cutZ))
    return Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2
      return at([r * Math.cos(a), r * Math.sin(a), dome.cutZ])
    })
  }, [dome])
  if (dome.params.cut >= 1) return null
  return <Line points={points} color={scene.muted} lineWidth={1} dashed dashSize={0.03} gapSize={0.03} raycast={() => null} />
}

function Ground({ dome, scene }: Pick<Props, 'dome' | 'scene'>) {
  const floor = -(1 - lowest(dome)) / 2 - 0.002
  const grid = useMemo(() => new PolarGridHelper(1.6, 12, 6, 96, scene.border, scene.border), [scene])
  useLayoutEffect(() => () => grid.dispose(), [grid])
  return <primitive object={grid} position={[0, floor, 0]} raycast={() => null} />
}

const HOME = new Vector3(2.4, 1.2, 2.4)

/**
 * Keep the whole sphere in view on any window shape, and put the camera back
 * on request: the distance that fits radius 1.15 in the narrower field of view.
 */
function Camera({ resetSignal }: { resetSignal: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null
  const { width, height } = useThree((s) => s.size)
  const fitRef = useRef<() => number>(() => 3)
  fitRef.current = () => {
    if (!('fov' in camera)) return 3
    const v = ((camera.fov as number) * Math.PI) / 360
    const h = Math.atan(Math.tan(v) * (width / height))
    // Goldberg corners stand a little proud of the sphere.
    return 1.25 / Math.sin(Math.min(v, h))
  }
  useEffect(() => {
    camera.position.setLength(fitRef.current())
    camera.updateProjectionMatrix()
  }, [camera, width, height])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    camera.position.copy(HOME).setLength(fitRef.current())
    controls?.target.set(0, 0, 0)
    controls?.update()
  }, [resetSignal, camera, controls])
  return null
}

export default function Viewport(props: Props) {
  const { dome, scene, onSelect } = props
  const overlay = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onSelect(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onSelect])
  return (
    <div className="relative h-full w-full">
    <Canvas
      camera={{ position: HOME.toArray(), fov: 35, near: 0.01, far: 100 }}
      dpr={[1, 2]}
      onPointerMissed={(e) => e.type === 'click' && onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[scene.background]} />
      {props.build ? (
        <BuildModel {...props} build={props.build} />
      ) : (
        <>
          <Panels {...props} />
          <Struts {...props} />
        </>
      )}
      <HubMarks dome={dome} scene={scene} focus={props.focus} />
      <CutRing dome={dome} scene={scene} />
      <Ground dome={dome} scene={scene} />
      <OrbitControls makeDefault enableDamping minDistance={1.2} maxDistance={10} />
      <Camera resetSignal={props.resetSignal} />
      <Labels dome={dome} scene={scene} view={props.view} focus={props.focus} overlay={overlay} />
    </Canvas>
    <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
    </div>
  )
}
