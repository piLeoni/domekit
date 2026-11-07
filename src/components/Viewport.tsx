import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, PolarGridHelper, Vector3, type Material } from 'three'
import type { LineSegments2 } from 'three-stdlib'
import type { Dome, Vec3 } from '../geodesic'
import { fade } from '../lib/palette'
import type { Focus, ViewOptions } from '../lib/state'
import type { SceneColors } from '../lib/theme'

type Kind = NonNullable<Focus>['kind']

interface Props {
  dome: Dome
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
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onSelect(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onSelect])
  return (
    <Canvas
      camera={{ position: HOME.toArray(), fov: 35, near: 0.01, far: 100 }}
      dpr={[1, 2]}
      onPointerMissed={(e) => e.type === 'click' && onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[scene.background]} />
      <Panels {...props} />
      <Struts {...props} />
      <HubMarks dome={dome} scene={scene} focus={props.focus} />
      <CutRing dome={dome} scene={scene} />
      <Ground dome={dome} scene={scene} />
      <OrbitControls makeDefault enableDamping minDistance={1.2} maxDistance={10} />
      <Camera resetSignal={props.resetSignal} />
    </Canvas>
  )
}
