export interface LandingRange {
  start: Date;
  end: Date;
}

export interface LandingParams {
  landing: Date;
  site: string | null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/;
const SITE = /^[a-z0-9-]{1,64}$/;

function isCalendarDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function parseIsoWithZone(value: string): number | null {
  const m = ISO.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s, , oh, om] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  if (!isCalendarDate(y!, mo!, d!) || h! > 23 || mi! > 59 || s! > 59 || oh! > 23 || om! > 59) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Reads `landing` (ISO 8601 with an explicit zone, inside `range`) and the
 * optional `site` (catalog id) from a query string. Anything else is rejected.
 */
export function readLandingParams(params: URLSearchParams, range: LandingRange): LandingParams | null {
  const raw = params.get('landing');
  if (raw === null) return null;
  const ms = parseIsoWithZone(raw);
  if (ms === null || ms < range.start.getTime() || ms > range.end.getTime()) return null;
  const site = params.get('site');
  if (site !== null && !SITE.test(site)) return null;
  return { landing: new Date(ms), site };
}
