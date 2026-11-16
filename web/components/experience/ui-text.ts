import type { PhaseName } from '@/lib/engine/app';
import type { SiteStatus } from '@/lib/engine/hud';
import { fmtInt, fmtLanding } from '@/lib/engine/hud';
import { locale, t } from '@/lib/i18n';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';

/** Texto compartido de la capa DOM. Todo se resuelve al llamar, nunca a nivel de módulo, para no congelar el idioma. */

export const phaseLabel = (phase: PhaseName): string => t(missionDict, `phase.${phase}`);

export const statusLabel = (status: SiteStatus): string => t(missionDict, `status.${status}`);

export const demoLabel = (): string => t(missionDict, 'demo');

const pad = (n: number) => String(n).padStart(2, '0');

/** «10 ene 2027 · 00:00 UTC» en español; «Jan 10, 2027 · 00:00 UTC» en inglés (hora UTC, 24 h). */
export function fmtPlanDate(date: Date): string {
  if (!locale().startsWith('en')) return fmtLanding(date);
  const day = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  return `${day} · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** A whole number for the screen: Spanish keeps the narrow-space grouping of hud.ts, English groups with commas by its locale. */
export const fmtCount = (n: number): string => (locale().startsWith('en') ? Math.round(n).toLocaleString(locale()) : fmtInt(n));
