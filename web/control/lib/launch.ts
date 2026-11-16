import { isoFromMs } from './time'
import type { SiteRef } from './types'

const SHORT_NAME_MAX = 24

/** Nombre corto para un botón: sin la misión entre paréntesis y, si aun así es largo, cortado en una palabra. */
export function shortSiteName(name: string, max = SHORT_NAME_MAX): string {
  const bare = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || name.trim()
  if (bare.length <= max) return bare
  const cut = bare.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export function launchHref(site: SiteRef, landingMs: number): string | null {
  if (!Number.isFinite(landingMs)) return null
  const landing = isoFromMs(landingMs)
  return site.kind === 'catalog' ? `/?landing=${landing}&site=${encodeURIComponent(site.id)}` : `/?landing=${landing}`
}
