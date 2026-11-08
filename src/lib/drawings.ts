/**
 * Packaging the drawings: a zip of 1:1 SVGs or DXFs (one file per part type,
 * in folders), or one PDF of same-size printable pages.
 */
import { strToU8, zipSync } from 'fflate'
import { pageSize, partsCsv, toCutList, toHubList, type Build, type Dome, type LengthUnit, type Sheet } from '../geodesic'

const FOLDER: Record<Sheet['kind'], string> = { overview: '', panel: 'panels/', strut: 'struts/', hub: 'hubs/' }

export const sheetPath = (s: Sheet, ext: 'svg' | 'dxf') => `${FOLDER[s.kind]}${s.id.replace(/^(panel|strut|hub)-/, '')}.${ext}`

const README = (units: string, ext: string) => `Geodesic dome: fabrication drawings

One ${ext.toUpperCase()} per part type, at true scale: 1 unit = 1 ${units}.
Each drawing carries the part, its label and quantity, the dimensions and
angles needed to make it, and a scale bar to check a print.

Layers: ${ext === 'dxf' ? 'OUTLINE (red, cut), MARKS (blue: angles, dimensions), TEXT' : 'outline (red, cut), marks (blue: angles, dimensions), text (black)'}

Panels are drawn as seen from outside the dome. Bevel = half the angle
between neighbouring panels (the blade tilt for a flush seam).
Struts: length hub centre to hub centre. Hub arms: nominal length, true angles.

cutlist.csv and hubs.csv hold the same numbers as tables.
`

const BUILD_README = (units: string, ext: string) => `Geodesic dome: construction drawings

One ${ext.toUpperCase()} per part type, at true scale: 1 unit = 1 ${units}.
Layers: ${ext === 'dxf' ? 'OUTLINE (red, cut), MARKS (blue: bends, bevels, dimensions), TEXT' : 'outline (red, cut), marks (blue: bends, bevels, dimensions), text (black)'}

struts/  tubes, laid flat: cut length, flattened ends, holes, bend lines.
panels/  panels seen from outside: outer face solid, inner face dashed.
hubs/    plates seen from outside, with their holes.

Sizes are for the parts as modelled (sharp bends, no bend allowance).
Make one of each and check it before cutting the batch.

parts.csv lists every part and the hardware.
`

export function sheetsZip(dome: Dome, sheets: Sheet[], unit: LengthUnit, ext: 'svg' | 'dxf', build?: Build | null): Blob {
  const units = sheets.find((s) => s.kind !== 'overview')?.units ?? 'mm'
  const files: Record<string, Uint8Array> = build
    ? { 'README.txt': strToU8(BUILD_README(units, ext)), 'parts.csv': strToU8(partsCsv(build)) }
    : {
        'README.txt': strToU8(README(units, ext)),
        'cutlist.csv': strToU8(toCutList(dome, unit)),
        'hubs.csv': strToU8(toHubList(dome)),
      }
  for (const s of sheets) {
    if (ext === 'dxf' && !s.dxf) continue
    files[sheetPath(s, ext)] = strToU8(ext === 'svg' ? s.svg : s.dxf)
  }
  if (ext === 'svg') files['overview.svg'] = strToU8(sheets[0].page)
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}

/** The PDF's built-in fonts lack a few characters the drawings use. */
const pdfSafe = (svg: string) => svg.replace(/′/g, "'").replace(/↔/g, '<->')

/** One page per sheet, all the same size (A4, or Letter for imperial domes), landscape. */
export async function sheetsPdf(sheets: Sheet[], unit: LengthUnit): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const { w, h, name } = pageSize(unit)
  const doc = new jsPDF({ unit: 'mm', format: name === 'A4' ? 'a4' : 'letter', orientation: 'landscape' })
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(host)
  try {
    for (const [i, s] of sheets.entries()) {
      if (i > 0) doc.addPage(name === 'A4' ? 'a4' : 'letter', 'landscape')
      host.innerHTML = pdfSafe(s.page)
      await doc.svg(host.querySelector('svg')!, { x: 0, y: 0, width: w, height: h })
    }
  } finally {
    host.remove()
  }
  return doc.output('blob')
}

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
