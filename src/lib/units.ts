export type Unit = 'm' | 'cm' | 'mm' | 'ft' | 'in'

export const UNITS: Unit[] = ['m', 'cm', 'mm', 'ft', 'in']

const DECIMALS: Record<Unit, number> = { m: 3, cm: 1, mm: 0, ft: 3, in: 2 }

export function fmt(n: number, digits: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export const len = (n: number, u: Unit) => `${fmt(n, DECIMALS[u])} ${u}`
export const area = (n: number, u: Unit) => `${fmt(n, Math.max(0, DECIMALS[u] - 1))} ${u}²`
export const vol = (n: number, u: Unit) => `${fmt(n, Math.max(0, DECIMALS[u] - 1))} ${u}³`
export const deg = (n: number) => `${fmt(n, 2)}°`
