import { buildStep, partsCsv, toCutList, toHubList, toJson, toObj, type Build, type Dome } from '../geodesic'
import type { Unit } from '../lib/units'
import { fileStem, saveSheets } from './Sheets'
import { DownloadIcon, Menu, MenuItem } from './ui'

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Downloads, in one menu. */
export default function Export({ dome, unit, build }: { dome: Dome; unit: Unit; build: Build | null }) {
  const p = dome.params
  const stem = `dome-${p.frequency}v-${p.solid === 'octahedron' ? 'octa' : 'icosa'}-${String(p.radius).replace('.', '_')}${unit}-${p.mode}`
  return (
    <Menu
      label={
        <>
          <DownloadIcon /> Export
        </>
      }
    >
      {(close) => (
        <>
          <MenuItem hint=".pdf" onClick={() => (void saveSheets(dome, build, unit, 'pdf'), close())}>
            Drawings, printable
          </MenuItem>
          <MenuItem hint=".zip" onClick={() => (void saveSheets(dome, build, unit, 'svg'), close())}>
            Drawings, SVG full size
          </MenuItem>
          <MenuItem hint=".zip" onClick={() => (void saveSheets(dome, build, unit, 'dxf'), close())}>
            Drawings, DXF full size
          </MenuItem>
          <div className="my-1 border-t" />
          {build && (
            <>
              <MenuItem hint=".step" onClick={() => (save(`${fileStem(dome, unit, build)}.step`, buildStep(build, fileStem(dome, unit, build)), 'model/step'), close())}>
                Parts, 3D (STEP)
              </MenuItem>
              <MenuItem hint=".csv" onClick={() => (save(`${fileStem(dome, unit, build)}-parts.csv`, partsCsv(build), 'text/csv'), close())}>
                Parts list
              </MenuItem>
              <div className="my-1 border-t" />
            </>
          )}
          <MenuItem hint=".csv" onClick={() => (save(`${stem}-cutlist.csv`, toCutList(dome, unit), 'text/csv'), close())}>
            Cut list
          </MenuItem>
          <MenuItem hint=".csv" onClick={() => (save(`${stem}-hubs.csv`, toHubList(dome), 'text/csv'), close())}>
            Hub list
          </MenuItem>
          <MenuItem hint=".obj" onClick={() => (save(`${stem}.obj`, toObj(dome), 'model/obj'), close())}>
            3D model
          </MenuItem>
          <MenuItem hint=".json" onClick={() => (save(`${stem}.json`, toJson(dome), 'application/json'), close())}>
            All data
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
