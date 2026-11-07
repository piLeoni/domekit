import { useState } from 'react'
import { toCutList, toHubList, toJson, toObj, type Dome } from '../geodesic'
import type { Unit } from '../lib/units'
import { DownloadIcon, Menu, MenuItem } from './ui'

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Downloads and the share link, in one menu. */
export default function Export({ dome, unit }: { dome: Dome; unit: Unit }) {
  const [copied, setCopied] = useState(false)
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
          <div className="my-1 border-t" />
          <MenuItem
            hint={copied ? 'copied' : undefined}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href)
                setCopied(true)
                setTimeout(() => {
                  setCopied(false)
                  close()
                }, 900)
              } catch {
                close()
              }
            }}
          >
            Copy link
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
