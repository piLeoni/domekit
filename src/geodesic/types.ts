import type { BaseSolid } from './polyhedra'
import type { Vec3 } from './vec'

export type { BaseSolid, Vec3 }

/**
 * What the cut plane does to the struts and panels it crosses.
 * - `exclude`: drop them; keep only what lies wholly above the plane.
 * - `include`: keep them whole, hanging below the plane.
 * - `section`: trim them at the plane; the plane becomes the base.
 */
export type CutMode = 'exclude' | 'include' | 'section'

/**
 * Which polyhedron the dome is made of.
 * - `geodesic`: the subdivided sphere: triangles, hubs on the sphere.
 * - `goldberg`: its dual: flat pentagons and hexagons, each tangent to the
 *   sphere at one geodesic hub; three struts at every node.
 */
export type Pattern = 'geodesic' | 'goldberg'

/**
 * What the generator takes. Everything the UI can change about the primitive
 * is here, so the same object can later be handed to a Rust/WASM build.
 */
export interface DomeParams {
  /** Subdivision frequency (V): each base edge is split into this many struts. */
  frequency: number
  /** Sphere radius, in whatever unit the caller works in. */
  radius: number
  /** Polyhedron the sphere is subdivided from. */
  solid: BaseSolid
  /** Geodesic triangles, or the Goldberg pentagons and hexagons. Default `geodesic`. */
  pattern?: Pattern
  /**
   * Where the cut plane lies, as a height coefficient: distance from the top
   * of the sphere to the plane over the sphere's diameter. 0.5 cuts at the
   * equator, 1 keeps the whole sphere. Continuous: the plane need not pass
   * through hubs.
   */
  cut: number
  mode: CutMode
}

/**
 * Whether a piece is one of the sphere's own, or made by the cut:
 * `cut` is a strut or panel trimmed at the plane, `ring` a strut lying along
 * the plane between two cut points (section mode only).
 */
export type PieceKind = 'whole' | 'cut' | 'ring'

/** A family of identical struts: same length, same ends. */
export interface StrutType {
  /** `A`, `B`… by length; `B′` for B trimmed by the cut; `R1` for base ring struts. */
  label: string
  index: number
  kind: PieceKind
  /** For a cut piece: the strut type it was trimmed from. */
  parent: number | null
  /** Length on a sphere of radius 1 (the chord factor, for whole struts). */
  chordFactor: number
  /** Length at the requested radius. */
  length: number
  /** Angle subtended at the sphere centre, degrees (whole struts). */
  centralAngle: number | null
  /**
   * Angle between the strut and the tangent plane at its hub end, degrees.
   * When the two ends differ (Goldberg), the smaller; the other is `endAngle2`.
   */
  endAngle: number | null
  endAngle2: number | null
  /** Angle between a trimmed strut and the cut plane, degrees. */
  cutAngle: number | null
  /** How many the dome uses. Whole types are listed even at 0, so letters never shift. */
  count: number
}

/** A family of identical panels. */
export interface FaceType {
  /** `P1`, `P2`…; `P2′` for P2 clipped by the cut. */
  label: string
  index: number
  kind: 'whole' | 'cut'
  parent: number | null
  /** The panel type that is this one's mirror image (a left/right pair), if any. */
  mirrorOf: number | null
  /** Strut labels around the panel, sorted: `ABB`, or `B′ C R1` for a cut piece. */
  signature: string
  /** Strut labels around the panel, in order, side i running from corner i to i + 1. */
  struts: string[]
  /** The same sides as strut type indices. */
  edges: number[]
  /** Panel area at the requested radius. */
  area: number
  /** Corner angles in order, degrees. */
  angles: number[]
  /** The panel laid flat, on a sphere of radius 1: corner i at outline[i]. */
  outline: [number, number][]
  count: number
}

/**
 * One strut arriving at a node, as the connector sees it. Arms are listed
 * counter-clockwise seen from outside, starting from a canonical arm, so the
 * same connector always reads the same.
 */
export interface HubArm {
  /** Strut type label and index. */
  strut: string
  type: number
  /**
   * Angle between the strut and the node's reference plane, degrees: the
   * tangent plane for a hub (positive = the strut dips inward, below it), the
   * cut plane for a cut point (positive = the strut rises above it).
   */
  dip: number
  /** Angle around the node's axis, in the reference plane, from this arm to the next. */
  turn: number
  /** True 3D angle between this strut and the next. */
  between: number
}

/** A family of nodes: hubs where struts meet, or cut points on the plane. */
export interface HubType {
  /** `H1`… for hubs, `X1`… for cut points. */
  label: string
  index: number
  kind: 'hub' | 'cut'
  valence: number
  /** Strut labels meeting there, sorted. */
  struts: string[]
  /** The arms in order around the node: what the connector must hold. */
  arms: HubArm[]
  /**
   * The type that is this one's mirror image (a left/right pair), if any.
   * Null for a connector that is its own mirror image.
   */
  mirrorOf: number | null
  /** Whether these sit on the open edge of the dome. */
  base: boolean
  count: number
}

export interface Strut {
  a: number
  b: number
  type: number
}

export interface Face {
  /** Corners, outward-facing order: 3, or 4 for a panel clipped across two sides. */
  v: number[]
  type: number
}

export interface Hub {
  type: number
  kind: 'hub' | 'cut'
  valence: number
  base: boolean
}

/** A coefficient at which a whole ring of hubs gives an `exclude` dome a flat base. */
export interface FlatCut {
  cut: number
  faces: number
}

/**
 * One face of the base polyhedron, subdivided: the drawing builders read to
 * see which strut goes where. Points are barycentric (i, j) with i + j ≤ V.
 */
export interface FaceSchema {
  frequency: number
  pattern: Pattern
  /** Points in barycentric (i, j); `mark` draws an n-gon outline (a 5-way hub, a pentagon centre). */
  points: { i: number; j: number; mark?: number }[]
  edges: { from: number; to: number; type: number }[]
}

export interface DomeStats {
  hubs: number
  struts: number
  faces: number
  /** Top hub to the lowest point kept. */
  height: number
  /** Widest base point from the axis, doubled. */
  baseDiameter: number
  /** Height spread of the base points: 0 when the dome sits flat. */
  baseDeviation: number
  floorArea: number
  surfaceArea: number
  /** Volume under the panels, closed by the base polygon. */
  volume: number
  totalStrutLength: number
  /** Hubs − struts + panels: 2 for the sphere, 1 for a dome. */
  euler: number
  /** Pieces made by the cut. */
  cutStruts: number
  ringStruts: number
  cutFaces: number
  cutPoints: number
}

export interface Dome {
  params: DomeParams
  /** Node positions on the unit sphere's scale; multiply by `params.radius` for real size. */
  vertices: Vec3[]
  struts: Strut[]
  faces: Face[]
  hubs: Hub[]
  strutTypes: StrutType[]
  faceTypes: FaceType[]
  hubTypes: HubType[]
  /** Height of the cut plane on the unit sphere (z up, top hub at 1). */
  cutZ: number
  flatCuts: FlatCut[]
  schema: FaceSchema
  stats: DomeStats
}
