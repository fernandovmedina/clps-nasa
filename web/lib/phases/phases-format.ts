import { getLang, t } from '@/lib/i18n';
import { phasesCommonDict } from '@/lib/i18n/dicts/phases-common';
import { fmtInt, fmtLanding, fmtPercent, groupThousands, type SiteStatus } from '../engine/hud';
import type { PhaseName } from '../engine/app';
import { rankingNote, type SiteInput } from '../mission/sites';

/**
 * Textos y números que varias fases comparten. En español delegan en los formateadores de siempre (espacio duro como
 * separador de miles, «58 %»), así la salida en español no cambia ni un carácter; el inglés usa en-US.
 */
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isEn = () => getLang() === 'en';

export const int = (n: number) => (isEn() ? Math.round(n).toLocaleString('en-US') : fmtInt(n));

export const percent = (n: number) => (isEn() ? `${Math.round(n)}%` : fmtPercent(n));

/** «384,400 km» → con espacio duro en español; el inglés conserva la coma. */
export const groupNums = (text: string) => (isEn() ? text : groupThousands(text));

export const statusLabel = (status: SiteStatus) => t(phasesCommonDict, `status.${status}` as const);

export const phaseLabel = (name: PhaseName) => t(phasesCommonDict, `phase.${name}` as const);

/** Fecha de alunizaje: «10 ene 2027 · 00:00 UTC» o «Jan 10, 2027 · 00:00 UTC». */
export function landingDate(date: Date): string {
  if (!isEn()) return fmtLanding(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${EN_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

const CONTRAST_KEYS = { equatorial: 'note.equatorial', 'mid-latitude': 'note.midLatitude', 'far-side': 'note.farSide' } as const;

/** La nota del ranking (demo o contraste) en el idioma actual; `rankingNote` sigue siendo la fuente de cuál aplica. */
export function rankNote(site: Pick<SiteInput, 'crash' | 'region'>): string | undefined {
  const es = rankingNote(site);
  if (es === undefined || !isEn()) return es;
  if (site.crash) return t(phasesCommonDict, 'note.demo');
  const key = site.region ? CONTRAST_KEYS[site.region as keyof typeof CONTRAST_KEYS] : undefined;
  return key ? t(phasesCommonDict, key) : es;
}
