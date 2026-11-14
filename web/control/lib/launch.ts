import { isoFromMs } from './time'
import type { SiteRef } from './types'

export function launchHref(site: SiteRef, landingMs: number): string | null {
  if (!Number.isFinite(landingMs)) return null
  const landing = isoFromMs(landingMs)
  return site.kind === 'catalog' ? `/?landing=${landing}&site=${encodeURIComponent(site.id)}` : `/?landing=${landing}`
}
