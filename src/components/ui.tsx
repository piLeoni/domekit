/**
 * The handful of controls the app is built from, in the shadcn/ui manner:
 * plain elements, neutral tokens, no component library.
 */
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'default' | 'outline' | 'ghost' | 'secondary'
const VARIANTS: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-input bg-background hover:bg-accent',
  ghost: 'hover:bg-accent',
  secondary: 'bg-muted hover:bg-accent',
}

export function Button({
  variant = 'outline',
  size = 'sm',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'icon' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3' : 'h-8 w-8',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'num h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring',
        className,
      )}
      {...rest}
    />
  )
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx('h-8 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus:border-ring', className)}
      {...rest}
    />
  )
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  className?: string
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-md bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 flex-1 rounded-[5px] px-2.5 text-[13px] whitespace-nowrap transition-colors',
            o.value === value ? 'bg-background font-medium shadow-[var(--shadow)]' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, aside }: { label: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        {aside && <span className="num text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A section title inside a side column. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T
  onChange: (v: T) => void
  tabs: { id: T; label: string; count?: number }[]
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b px-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px flex h-10 items-center gap-1.5 border-b-2 px-2 text-[13px] transition-colors',
            t.id === value ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {t.count != null && <span className="num rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** A button that opens a short list of actions below it. */
export function Menu({ label, children, align = 'right' }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', off)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', off)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        {label}
      </Button>
      {open && (
        <div
          role="menu"
          className={cx('absolute top-full z-50 mt-1 min-w-48 rounded-md border bg-card p-1 shadow-[var(--shadow)]', align === 'right' ? 'right-0' : 'left-0')}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ children, hint, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { hint?: string }) {
  return (
    <button type="button" role="menuitem" className="flex w-full items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-accent" {...rest}>
      <span>{children}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </button>
  )
}

/* Icons: lucide paths, inline. */
const icon = (d: ReactNode) =>
  function Icon({ className = 'h-4 w-4' }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {d}
      </svg>
    )
  }

export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>,
)
export const MoonIcon = icon(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />)
export const MonitorIcon = icon(
  <>
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>,
)
export const DownloadIcon = icon(<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />)
export const RotateIcon = icon(
  <>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </>,
)
export const FocusIcon = icon(
  <>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </>,
)
export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />)
export const GeodesicIcon = icon(
  <>
    <path d="M12 3 3 9l3 10h12l3-10-9-6Z" />
    <path d="M12 3v6M3 9h18M6 19l6-10 6 10M9 9l3 10 3-10" />
  </>,
)
