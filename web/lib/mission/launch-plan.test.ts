import { describe, expect, it } from 'vitest';
import { setLang } from '@/lib/i18n';
import {
  DEFAULT_LANDING,
  TRANSIT_DAYS,
  checkLaunch,
  currentLanding,
  formatPlanDate,
  isLandingInRange,
  landingFromLaunch,
  landingParam,
  launchFromLanding,
  launchInputs,
  launchRange,
  opensPlanner,
  parseLaunchInputs,
  topSites,
  transitHint,
  transitValue,
  SOUTH_POLE_MAX_LAT,
  withLandingParam,
} from './launch-plan';
import { evaluateSites } from './scoring';
import { realMissionData } from './test-data';

const iso = (s: string) => new Date(s);
const RANGE = { start: iso('2026-11-01T00:00:00Z'), end: iso('2028-01-01T00:00:00Z') };

describe('transit', () => {
  it('assumes a direct transit of 4.5 days', () => {
    expect(TRANSIT_DAYS).toBe(4.5);
  });

  it('turns the default landing into a launch on 5 Jan at 12:00 UTC and back', () => {
    const launch = launchFromLanding(DEFAULT_LANDING);
    expect(launch.toISOString()).toBe('2027-01-05T12:00:00.000Z');
    expect(landingFromLaunch(launch).toISOString()).toBe(DEFAULT_LANDING.toISOString());
  });

  it('crosses a month boundary', () => {
    expect(landingFromLaunch(iso('2027-01-29T18:00:00Z')).toISOString()).toBe('2027-02-03T06:00:00.000Z');
    expect(launchFromLanding(iso('2027-03-02T00:00:00Z')).toISOString()).toBe('2027-02-25T12:00:00.000Z');
  });

  it('crosses a year boundary, in both directions', () => {
    expect(landingFromLaunch(iso('2026-12-28T00:00:00Z')).toISOString()).toBe('2027-01-01T12:00:00.000Z');
    expect(launchFromLanding(iso('2027-01-02T06:00:00Z')).toISOString()).toBe('2026-12-28T18:00:00.000Z');
  });

  it('handles the leap day of 2028', () => {
    expect(landingFromLaunch(iso('2028-02-26T12:00:00Z')).toISOString()).toBe('2028-03-02T00:00:00.000Z');
  });
});

describe('formatPlanDate', () => {
  it('writes day, Spanish month, year and UTC time', () => {
    expect(formatPlanDate(iso('2027-01-10T00:00:00Z'))).toBe('10 ene 2027 · 00:00 UTC');
    expect(formatPlanDate(iso('2027-01-05T12:00:00Z'))).toBe('5 ene 2027 · 12:00 UTC');
    expect(formatPlanDate(iso('2027-09-03T07:05:00Z'))).toBe('3 sep 2027 · 07:05 UTC');
    expect(formatPlanDate(iso('2027-12-31T23:59:00Z'))).toBe('31 dic 2027 · 23:59 UTC');
  });
});

describe('range rule', () => {
  it('accepts both ends and rejects one minute outside, like the landing parameter', () => {
    expect(isLandingInRange(RANGE.start, RANGE)).toBe(true);
    expect(isLandingInRange(RANGE.end, RANGE)).toBe(true);
    expect(isLandingInRange(iso('2026-10-31T23:59:00Z'), RANGE)).toBe(false);
    expect(isLandingInRange(iso('2028-01-01T00:01:00Z'), RANGE)).toBe(false);
  });

  it('derives the allowed launches from the allowed landings', () => {
    const launches = launchRange(RANGE);
    expect(launches.start.toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(launches.end.toISOString()).toBe('2027-12-27T12:00:00.000Z');
  });

  it('checks a launch through its arrival', () => {
    const ok = checkLaunch(iso('2027-01-05T12:00:00Z'), RANGE);
    expect(ok).toEqual({ ok: true, landing: DEFAULT_LANDING });
    expect(checkLaunch(iso('2026-10-27T12:00:00Z'), RANGE).ok).toBe(true);
    expect(checkLaunch(iso('2027-12-27T12:00:00Z'), RANGE).ok).toBe(true);
  });

  it('rejects an arrival before the data and one after it, naming the allowed range', () => {
    const early = checkLaunch(iso('2026-10-27T11:59:00Z'), RANGE);
    expect(early).toMatchObject({ ok: false, reason: 'out-of-range' });
    const late = checkLaunch(iso('2027-12-27T12:01:00Z'), RANGE);
    expect(late).toMatchObject({ ok: false, reason: 'out-of-range' });
    if (late.ok) throw new Error('unreachable');
    expect(late.message).toContain('1 ene 2028 · 00:01 UTC');
    expect(late.message).toContain('1 nov 2026 · 00:00 UTC y 1 ene 2028 · 00:00 UTC');
    expect(late.message).toContain('27 oct 2026 · 12:00 UTC y 27 dic 2027 · 12:00 UTC');
  });

  it('rejects an empty or impossible launch', () => {
    expect(checkLaunch(null, RANGE)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(checkLaunch(new Date(NaN), RANGE)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('form fields', () => {
  it('writes and reads back the UTC date and time of a launch', () => {
    const launch = iso('2027-01-05T12:00:00Z');
    expect(launchInputs(launch)).toEqual({ date: '2027-01-05', time: '12:00' });
    expect(parseLaunchInputs('2027-01-05', '12:00')?.toISOString()).toBe(launch.toISOString());
  });

  it('pads single digits and keeps midnight', () => {
    expect(launchInputs(iso('2027-03-04T00:07:00Z'))).toEqual({ date: '2027-03-04', time: '00:07' });
  });

  it('refuses empty, malformed or non-existent values', () => {
    expect(parseLaunchInputs('', '12:00')).toBeNull();
    expect(parseLaunchInputs('2027-01-05', '')).toBeNull();
    expect(parseLaunchInputs('2027-02-30', '12:00')).toBeNull();
    expect(parseLaunchInputs('2027-01-05', '24:00')).toBeNull();
    expect(parseLaunchInputs('2027-01-05', '12:60')).toBeNull();
    expect(parseLaunchInputs('05/01/2027', '12:00')).toBeNull();
  });
});

describe('landing parameter', () => {
  it('writes ISO 8601 UTC without a fraction, the way Mission Control links do', () => {
    expect(landingParam(DEFAULT_LANDING)).toBe('2027-01-10T00:00:00Z');
    expect(landingParam(iso('2027-01-31T13:45:00Z'))).toBe('2027-01-31T13:45:00Z');
  });

  it('replaces the landing and keeps the other parameters and the hash', () => {
    const next = withLandingParam('https://x.test/?room=ABCD&landing=2027-01-10T00:00:00Z&site=apollo-11#top', iso('2027-02-01T06:00:00Z'));
    const url = new URL(next);
    expect(url.searchParams.get('landing')).toBe('2027-02-01T06:00:00Z');
    expect(url.searchParams.get('room')).toBe('ABCD');
    expect(url.searchParams.get('site')).toBe('apollo-11');
    expect(url.hash).toBe('#top');
  });

  it('adds the landing when the URL had none', () => {
    expect(new URL(withLandingParam('https://x.test/', DEFAULT_LANDING)).search).toBe('?landing=2027-01-10T00%3A00%3A00Z');
  });
});

describe('currentLanding', () => {
  it('prefers the loaded data, then a valid URL parameter, then the default', () => {
    const loaded = { landingDate: iso('2027-02-01T00:00:00Z') };
    expect(currentLanding(loaded, '?landing=2027-03-01T00:00:00Z').toISOString()).toBe('2027-02-01T00:00:00.000Z');
    expect(currentLanding(null, '?landing=2027-03-01T00:00:00Z').toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(currentLanding(null, '?landing=mañana')).toBe(DEFAULT_LANDING);
    expect(currentLanding(null, '')).toBe(DEFAULT_LANDING);
  });
});

describe('topSites', () => {
  const sites = realMissionData().sites;

  it('returns three south-polar sites in exactly the order the orbit ranking has', () => {
    for (const day of ['2027-01-10T00:00:00Z', '2027-02-01T12:00:00Z', '2026-11-20T00:00:00Z', '2027-06-15T18:00:00Z']) {
      const landing = iso(day);
      const orbit = evaluateSites(sites, landing).filter((m) => m.site.lat <= SOUTH_POLE_MAX_LAT);
      expect(topSites(sites, landing).every((m) => m.site.lat <= SOUTH_POLE_MAX_LAT)).toBe(true);
      const top = topSites(sites, landing);
      expect(top).toHaveLength(3);
      expect(top.map((m) => m.site.id)).toEqual(orbit.slice(0, 3).map((m) => m.site.id));
      expect(top.map((m) => m.rank)).toEqual([1, 2, 3]);
      expect(top.map((m) => m.score)).toEqual(orbit.slice(0, 3).map((m) => m.score));
      expect(top[0]!.score).toBeGreaterThanOrEqual(top[1]!.score);
      expect(top[1]!.score).toBeGreaterThanOrEqual(top[2]!.score);
    }
  });

  it('changes with the date', () => {
    const a = topSites(sites, iso('2027-01-10T00:00:00Z')).map((m) => `${m.site.id}:${m.score}`);
    const b = topSites(sites, iso('2027-04-20T00:00:00Z')).map((m) => `${m.site.id}:${m.score}`);
    expect(a).not.toEqual(b);
  });

  it('honours the count and has no more sites than the catalog', () => {
    expect(topSites(sites, DEFAULT_LANDING, 1)).toHaveLength(1);
    expect(topSites(sites.slice(0, 2), DEFAULT_LANDING)).toHaveLength(2);
  });

  it('throws outside the ephemeris, which is why callers check the range first', () => {
    expect(() => topSites(sites, iso('2030-01-01T00:00:00Z'))).toThrow(RangeError);
  });
});

describe('opensPlanner', () => {
  it('opens for the crew on a plain visit, with a room or a landing in the URL', () => {
    expect(opensPlanner('', true)).toBe(true);
    expect(opensPlanner('?room=ABCD&landing=2027-01-24T12:00:00Z', true)).toBe(true);
    expect(opensPlanner('?vr=other', true)).toBe(true);
  });

  it('does not open with the ?phase= shortcut, whatever the phase', () => {
    expect(opensPlanner('?phase=orbit', true)).toBe(false);
    expect(opensPlanner('?room=ABCD&phase=launch', true)).toBe(false);
    expect(opensPlanner('?phase=', true)).toBe(false);
  });

  it('does not open in the VR preview', () => {
    expect(opensPlanner('?vr=preview', true)).toBe(false);
  });

  it('does not open for Mission Control', () => {
    expect(opensPlanner('', false)).toBe(false);
    expect(opensPlanner('?room=ZZZZ', false)).toBe(false);
  });
});

describe('English text', () => {
  it('writes the plan date with an English month and the same UTC time', () => {
    setLang('en', { persist: false });
    expect(formatPlanDate(iso('2027-01-10T00:00:00Z'))).toBe('Jan 10, 2027 · 00:00 UTC');
    expect(formatPlanDate(iso('2027-09-03T07:05:00Z'))).toBe('Sep 3, 2027 · 07:05 UTC');
    expect(formatPlanDate(iso('2027-12-31T23:59:00Z'))).toBe('Dec 31, 2027 · 23:59 UTC');
  });

  it('explains an empty launch and an arrival outside the data in English, with English dates', () => {
    setLang('en', { persist: false });
    expect(checkLaunch(null, RANGE)).toEqual({ ok: false, reason: 'invalid', message: 'Pick a valid launch date and time.' });
    const late = checkLaunch(iso('2027-12-27T12:01:00Z'), RANGE);
    if (late.ok) throw new Error('unreachable');
    expect(late.reason).toBe('out-of-range');
    expect(late.message).toBe(
      'The arrival (Jan 1, 2028 · 00:01 UTC) falls outside the mission data: it must land between Nov 1, 2026 · 00:00 UTC and Jan 1, 2028 · 00:00 UTC. '
      + 'Launch between Oct 27, 2026 · 12:00 UTC and Dec 27, 2027 · 12:00 UTC.',
    );
  });

  it('states the transit as an assumption in both languages', () => {
    expect(transitHint()).toBe('Tránsito directo de 4.5 días (supuesto)');
    expect(transitValue()).toBe('4.5 días (supuesto)');
    setLang('en', { persist: false });
    expect(transitHint()).toBe('Direct transit of 4.5 days (assumed)');
    expect(transitValue()).toBe('4.5 days (assumed)');
  });
});
