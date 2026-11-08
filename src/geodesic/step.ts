/**
 * STEP (ISO 10303-21, AP214) for polyhedral solids: each part a closed
 * B-rep of planar faces with straight edges, in millimetres. Opens as solid
 * bodies in FreeCAD, Fusion, SolidWorks, Onshape, Rhino.
 */
import type { Solid } from './solid'
import { loopNormal } from './solid'
import { length, normalize, sub, type Vec3 } from './vec'

/** A STEP real: always with a decimal point. */
function real(x: number): string {
  if (Math.abs(x) < 1e-12) return '0.'
  return x.toFixed(6).replace(/0+$/, '')
}

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_')}'`

export interface StepBody {
  name: string
  solid: Solid
}

/**
 * `toMm` scales the solids' coordinates to millimetres. `name` names the
 * product; each body keeps its own name.
 */
export function toStep(bodies: StepBody[], opts: { name: string; toMm: number; date?: Date }): string {
  const lines: string[] = []
  let id = 0
  const add = (e: string) => {
    lines.push(`#${++id}=${e};`)
    return `#${id}`
  }
  const point = (p: Vec3) => add(`CARTESIAN_POINT('',(${real(p[0])},${real(p[1])},${real(p[2])}))`)
  const dir = (d: Vec3) => add(`DIRECTION('',(${real(d[0])},${real(d[1])},${real(d[2])}))`)

  const appCtx = add(`APPLICATION_CONTEXT('automotive design')`)
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`)
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`)
  const product = add(`PRODUCT(${str(opts.name)},${str(opts.name)},'',(${prodCtx}))`)
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${product}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const defCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`)
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${defCtx})`)
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)
  const mm = add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`)
  const rad = add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`)
  const sr = add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`)
  const tol = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-04),${mm},'distance_accuracy_value','confusion accuracy')`)
  const geoCtx = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${tol}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr}))REPRESENTATION_CONTEXT('',''))`,
  )
  const origin = add(`AXIS2_PLACEMENT_3D('',${point([0, 0, 0])},${dir([0, 0, 1])},${dir([1, 0, 0])})`)

  const breps: string[] = []
  for (const body of bodies) {
    const pts = body.solid.points.map((p) => [p[0] * opts.toMm, p[1] * opts.toMm, p[2] * opts.toMm] as Vec3)
    const vertex = pts.map((p) => add(`VERTEX_POINT('',${point(p)})`))
    const edges = new Map<string, { id: string; a: number }>()
    const edge = (a: number, b: number) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      let e = edges.get(key)
      if (!e) {
        const d = sub(pts[b], pts[a])
        const line = add(`LINE('',${point(pts[a])},${add(`VECTOR('',${dir(normalize(d))},${real(length(d))})`)})`)
        e = { id: add(`EDGE_CURVE('',${vertex[a]},${vertex[b]},${line},.T.)`), a }
        edges.set(key, e)
      }
      return add(`ORIENTED_EDGE('',*,*,${e.id},${e.a === a ? '.T.' : '.F.'})`)
    }
    const faces = body.solid.faces.map((loops) => {
      const bounds = loops.map((loop, k) => {
        const oriented = loop.map((a, i) => edge(a, loop[(i + 1) % loop.length]))
        const el = add(`EDGE_LOOP('',(${oriented.join(',')}))`)
        return add(`${k === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${el},.T.)`)
      })
      const outer = loops[0]
      const n = normalize(loopNormal(pts, outer))
      const ref = normalize(sub(pts[outer[1]], pts[outer[0]]))
      const plane = add(`PLANE('',${add(`AXIS2_PLACEMENT_3D('',${point(pts[outer[0]])},${dir(n)},${dir(ref)})`)})`)
      return add(`ADVANCED_FACE('',(${bounds.join(',')}),${plane},.T.)`)
    })
    const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`)
    breps.push(add(`MANIFOLD_SOLID_BREP(${str(body.name)},${shell})`))
  }
  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(opts.name)},(${[origin, ...breps].join(',')}),${geoCtx})`)
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${rep})`)

  const date = (opts.date ?? new Date()).toISOString().slice(0, 19)
  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Geodesic dome construction'),'2;1');`,
    `FILE_NAME(${str(opts.name + '.step')},'${date}',(''),(''),'geodesic','geodesic','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`,
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
