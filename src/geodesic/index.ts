/**
 * The geodesic core: pure functions, no DOM, no three.js. The UI only talks to
 * `generateDome`, so this module can be swapped for a Rust/WASM build that
 * returns the same `Dome` shape.
 */
export { generateDome, flatCuts, subdivide, letter } from './generate'
export { toObj, toCutList, toHubList, toJson } from './export'
export { buildSheets, pageSize, type Sheet, type LengthUnit } from './sheets'
export * from './types'
