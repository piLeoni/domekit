import { useAtom, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { defaultDims } from '../geodesic'
import { shareUrl, toShareDoc } from '../lib/share'
import type { Settings, ViewOptions } from '../lib/state'
import { settingsAtom, shareNoticeAtom, viewAtom } from '../lib/store'
import { Button, CheckIcon, ShareIcon, XIcon } from './ui'

/** Copies a link that opens this exact dome, construction and view anywhere. */
export function ShareButton({ settings, view }: { settings: Settings; view: ViewOptions }) {
  const [state, setState] = useState<'idle' | 'copied' | { manual: string }>('idle')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof state !== 'object') return
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setState('idle')
    window.addEventListener('pointerdown', off)
    return () => window.removeEventListener('pointerdown', off)
  }, [state])
  const share = async () => {
    const url = shareUrl(toShareDoc(settings, view, defaultDims))
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), 1600)
    } catch {
      setState({ manual: url })
    }
  }
  return (
    <div ref={ref} className="relative">
      <Button onClick={share} title="Copy a link to this dome, its construction and every dimension">
        {state === 'copied' ? <CheckIcon /> : <ShareIcon />} {state === 'copied' ? 'Link copied' : 'Share'}
      </Button>
      {typeof state === 'object' && (
        <div className="absolute top-full right-0 z-50 mt-1 w-80 space-y-1.5 rounded-md border bg-card p-2.5 shadow-[var(--shadow)]">
          <p className="text-xs text-muted-foreground">Copy this link:</p>
          <input
            readOnly
            autoFocus
            value={state.manual}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border bg-background px-2 py-1 font-mono text-[11px]"
          />
        </div>
      )}
    </div>
  )
}

/** After opening a shared link: say so, with an undo; or say why it could not be opened. */
export function ShareNoticeBar() {
  const [notice, setNotice] = useAtom(shareNoticeAtom)
  const setSettings = useSetAtom(settingsAtom)
  const setView = useSetAtom(viewAtom)
  useEffect(() => {
    if (notice?.kind !== 'opened') return
    const id = setTimeout(() => setNotice(null), 12000)
    return () => clearTimeout(id)
  }, [notice, setNotice])
  if (!notice) return null
  const error = notice.kind === 'error'
  return (
    <div role={error ? 'alert' : 'status'} className={`fade-in flex shrink-0 items-center gap-3 border-b px-4 py-2 text-[13px] ${error ? 'bg-amber-500/10' : 'bg-muted/50'}`}>
      <span className="min-w-0 flex-1">{error ? notice.message : 'Opened a shared dome: its settings replaced yours.'}</span>
      {!error && (
        <button
          type="button"
          className="text-xs font-medium underline-offset-2 hover:underline"
          onClick={() => {
            setSettings(notice.previous.settings)
            setView(notice.previous.view)
            setNotice(null)
          }}
        >
          Undo
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}>
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
