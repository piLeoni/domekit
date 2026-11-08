/**
 * App state that outlives the page: Jotai atoms kept in local storage, so
 * leaving and coming back finds every option as it was. Values read from
 * storage are cleaned, so an old or hand-edited entry can never break the app.
 */
import { atom, getDefaultStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { readSharedHash } from './share'
import { cleanSettings, cleanTab, cleanView, DEFAULT_SETTINGS, DEFAULT_VIEW, type Settings, type Tab, type ViewOptions } from './state'

function storage<T>(clean: (raw: unknown) => T) {
  return {
    getItem(key: string, initial: T): T {
      try {
        const raw = localStorage.getItem(key)
        return raw == null ? initial : clean(JSON.parse(raw))
      } catch {
        return initial
      }
    },
    setItem(key: string, value: T) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* private mode or full: keep it for this visit */
      }
    },
    removeItem(key: string) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* nothing to remove */
      }
    },
  }
}

export const settingsAtom = atomWithStorage<Settings>('geodesic.settings.v1', DEFAULT_SETTINGS, storage(cleanSettings), { getOnInit: true })
export const viewAtom = atomWithStorage<ViewOptions>('geodesic.view.v4', DEFAULT_VIEW, storage(cleanView), { getOnInit: true })
export const tabAtom = atomWithStorage<Tab>('geodesic.tab', 'struts', storage(cleanTab), { getOnInit: true })

/** What opening a shared link did: replaced the dome (with what was there before, to undo), or failed and why. */
export type ShareNotice = { kind: 'opened'; previous: { settings: Settings; view: ViewOptions } } | { kind: 'error'; message: string } | null
export const shareNoticeAtom = atom<ShareNotice>(null)

/**
 * If the URL carries a shared dome, apply it, then clean the URL so it does
 * not stick around (a reload keeps the dome from storage, not from the link).
 */
export function absorbSharedLink(store = getDefaultStore()) {
  const shared = readSharedHash(location.hash)
  if (!shared) return
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  if (!shared.ok) {
    store.set(shareNoticeAtom, { kind: 'error', message: shared.reason })
    return
  }
  const previous = { settings: store.get(settingsAtom), view: store.get(viewAtom) }
  store.set(settingsAtom, { ...shared.settings, dimsBy: { ...previous.settings.dimsBy, ...shared.settings.dimsBy } })
  if (shared.view) store.set(viewAtom, shared.view)
  store.set(shareNoticeAtom, { kind: 'opened', previous })
}
