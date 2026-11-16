import { describe, expect, it } from 'vitest';
import { decodeState } from '../../control/lib/stateUrl';
import { controlHref, controlHrefFor } from './control-link';

const LANDING = new Date(Date.UTC(2027, 0, 10, 0, 0));
const read = (href: string) => decodeState(href.slice(href.indexOf('?')));
const ids = (href: string) => read(href).scenarios.map((s) => (s.site.kind === 'catalog' ? s.site.id : 'custom'));

describe('controlHref', () => {
  it('puts the chosen site as scenario A with the landing and the 14-day mission', () => {
    const href = controlHref({ site: 'shackleton', landing: LANDING });
    expect(href.startsWith('/mission-control/?')).toBe(true);
    const state = read(href);
    expect(state.scenarios).toEqual([{ site: { kind: 'catalog', id: 'shackleton' }, landing: '2027-01-10T00:00:00Z', durationDays: 14 }]);
    expect(state.selected).toBe(0);
  });

  it('adds the other site as scenario B with the same date and duration', () => {
    const state = read(controlHref({ site: 'shackleton', other: 'de-gerlache', landing: LANDING, durationDays: 10 }));
    expect(state.scenarios.map((s) => [s.site, s.landing, s.durationDays])).toEqual([
      [{ kind: 'catalog', id: 'shackleton' }, '2027-01-10T00:00:00Z', 10],
      [{ kind: 'catalog', id: 'de-gerlache' }, '2027-01-10T00:00:00Z', 10],
    ]);
  });

  it('ignores an other site equal to the chosen one', () => {
    expect(ids(controlHref({ site: 'shackleton', other: 'shackleton', landing: LANDING }))).toEqual(['shackleton']);
  });

  it('keeps the minute of the landing and drops the seconds', () => {
    const landing = new Date(Date.UTC(2027, 2, 5, 6, 30, 41));
    expect(read(controlHref({ site: 'shackleton', landing })).scenarios[0]?.landing).toBe('2027-03-05T06:31:00Z');
  });

  it('without a site, uses Mission Control default sites on the planned date', () => {
    const state = read(controlHref({ site: null, landing: LANDING }));
    expect(state.scenarios.map((s) => s.landing)).toEqual(['2027-01-10T00:00:00Z', '2027-01-10T00:00:00Z']);
    expect(ids(controlHref({ site: null, landing: LANDING }))).toEqual(['malapert-a', 'mons-mouton']);
  });

  it('never makes NO CAER a scenario: only the date survives', () => {
    const href = controlHref({ site: 'no-caer', other: 'shackleton', landing: LANDING });
    expect(href).not.toContain('no-caer');
    expect(ids(href)).toEqual(['malapert-a', 'mons-mouton']);
    expect(controlHref({ site: 'shackleton', other: 'no-caer', landing: LANDING })).not.toContain('no-caer');
  });

  it('rejects ids Mission Control would not read back as a catalog site', () => {
    expect(ids(controlHref({ site: 'Not Valid!', landing: LANDING }))).toEqual(['malapert-a', 'mons-mouton']);
  });
});

describe('controlHrefFor', () => {
  const site = (id: string, crash = false) => ({ site: { id, crash } });
  const data = { landingDate: LANDING };

  it('uses the selected site and the best other one of the ranking, skipping NO CAER', () => {
    const ranking = [site('shackleton'), site('no-caer', true), site('de-gerlache')];
    expect(ids(controlHrefFor({ data, selected: site('shackleton'), ranking }, ''))).toEqual(['shackleton', 'de-gerlache']);
    expect(ids(controlHrefFor({ data, selected: site('de-gerlache'), ranking }, ''))).toEqual(['de-gerlache', 'shackleton']);
  });

  it('with NO CAER selected falls back to the default sites on the landing date', () => {
    const ranking = [site('shackleton'), site('no-caer', true)];
    const href = controlHrefFor({ data, selected: site('no-caer', true), ranking }, '');
    expect(ids(href)).toEqual(['malapert-a', 'mons-mouton']);
    expect(read(href).scenarios[0]?.landing).toBe('2027-01-10T00:00:00Z');
  });

  it('with no site yet reads the landing from the data, else from the URL, else the default', () => {
    expect(ids(controlHrefFor({ data, selected: null, ranking: [] }, ''))).toEqual(['malapert-a', 'mons-mouton']);
    expect(read(controlHrefFor({ data: null, selected: null, ranking: [] }, '?landing=2027-02-01T00:00:00Z')).scenarios[0]?.landing).toBe('2027-02-01T00:00:00Z');
    expect(read(controlHrefFor({ data: null, selected: null, ranking: [] }, '')).scenarios[0]?.landing).toBe('2027-01-10T00:00:00Z');
  });

  it('only scenario A when the ranking has no other site', () => {
    expect(ids(controlHrefFor({ data, selected: site('shackleton'), ranking: [site('shackleton')] }, ''))).toEqual(['shackleton']);
  });
});
