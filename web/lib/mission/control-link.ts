import { encodeState, parseSite } from '../../control/lib/stateUrl';
import { INITIAL_DURATION_DAYS, defaultState, type AppState, type Scenario } from '../../control/lib/types';
import { currentLanding } from './launch-plan';
import { NO_CAER_SITE_ID } from './sites';

const CONTROL_PATH = '/mission-control/';

/** The mission window the experience scores (evaluateSites) is Mission Control's default duration. */
export const MISSION_DURATION_DAYS = INITIAL_DURATION_DAYS;

export interface ControlLinkInput {
  /** Catalog id of the site the user chose; null when none yet. */
  site: string | null;
  landing: Date;
  durationDays?: number;
  /** Catalog id of a second site to compare against. */
  other?: string | null;
}

function catalogId(id: string | null | undefined): string | null {
  if (!id || id === NO_CAER_SITE_ID) return null;
  return parseSite(id)?.kind === 'catalog' ? id : null;
}

/**
 * Link to Mission Control with the user's mission as scenario A (and optionally
 * a second site as B). The demo case NO CAER is never a scenario; without a
 * usable site Mission Control's default sites are kept and only the date is set.
 * A delay is already part of `landing` (the orbit phase moves the landing date),
 * so the delay parameter is not set.
 */
export function controlHref({ site, landing, durationDays = MISSION_DURATION_DAYS, other }: ControlLinkInput): string {
  const ms = Math.round(landing.getTime() / 60_000) * 60_000;
  const iso = new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const first = catalogId(site);
  const second = catalogId(other);
  let state: AppState;
  if (first) {
    const scenario = (id: string): Scenario => ({ site: { kind: 'catalog', id }, landing: iso, durationDays });
    state = { ...defaultState(), scenarios: [scenario(first), ...(second && second !== first ? [scenario(second)] : [])] };
  } else {
    state = { ...defaultState(), scenarios: defaultState().scenarios.map((s) => ({ ...s, landing: iso, durationDays })) };
  }
  return `${CONTROL_PATH}?${encodeState(state)}`;
}

interface SiteLike { site: { id: string; crash?: boolean } }

export interface ControlLinkSource {
  data: { landingDate: Date } | null;
  selected: SiteLike | null;
  /** In ranking order, best first. */
  ranking: SiteLike[];
}

/** The link for the running mission: the selected site, the best other site of the ranking, the current landing. */
export function controlHrefFor(src: ControlLinkSource, search: string): string {
  const landing = currentLanding(src.data, search);
  const chosen = src.selected && !src.selected.site.crash ? src.selected.site.id : null;
  const other = chosen ? src.ranking.find((m) => !m.site.crash && m.site.id !== chosen)?.site.id : null;
  return controlHref({ site: chosen, landing, other });
}
