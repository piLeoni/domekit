/**
 * The geodesic core: pure functions, no DOM, no three.js. The UI only talks to
 * `generateDome`, so this module can be swapped for a Rust/WASM build that
 * returns the same `Dome` shape.
 */
export { generateDome, flatCuts, subdivide, letter } from './generate'
export { toObj, toCutList, toHubList, toJson } from './export'
export { buildSheets, pageSize, type Sheet, type LengthUnit } from './sheets'
export {
  buildConstruction,
  buildStep,
  defaultDims,
  partsCsv,
  techniqueSpec,
  TECHNIQUES,
  type Build,
  type DimSpec,
  type Hardware,
  type Material,
  type PartType,
  type PlacedSolid,
  type Technique,
} from './build'
export type { Solid } from './solid'
export * from './types'
