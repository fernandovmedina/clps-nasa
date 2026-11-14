import { describe, expect, it } from 'vitest';
import { readLandingParams } from './landing-param';

const range = { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2028-01-01T00:00:00Z') };
const read = (query: string) => readLandingParams(new URLSearchParams(query), range);

describe('readLandingParams', () => {
  it('accepts a landing with an explicit zone and a catalog site', () => {
    const r = read('landing=2027-01-31T00:00:00Z&site=malapert-a');
    expect(r?.landing.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(r?.site).toBe('malapert-a');
  });

  it('accepts a landing without a site and a numeric offset', () => {
    expect(read('landing=2027-01-31T00:00:00Z')).toEqual({ landing: new Date('2027-01-31T00:00:00Z'), site: null });
    expect(read('landing=2027-01-31T02:00:00%2B02:00')?.landing.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });

  it('accepts the two ends of the range', () => {
    expect(read('landing=2026-11-01T00:00:00Z')).not.toBeNull();
    expect(read('landing=2028-01-01T00:00:00Z')).not.toBeNull();
  });

  it.each([
    '2027-01-10T00:00:00',
    '2027-01-10',
    '2027-01-10T00:00:00 02:00',
    '2027-01-10 00:00:00Z',
    '1799539200000',
    'tomorrow',
    '',
  ])('rejects %j: no explicit ISO 8601 zone', (value) => {
    expect(read(`landing=${encodeURIComponent(value)}`)).toBeNull();
  });

  it.each(['2027-02-30T00:00:00Z', '2027-13-10T00:00:00Z', '2027-01-10T24:00:00Z', '2027-01-10T00:60:00Z', '2027-01-10T00:00:00+25:00'])(
    'rejects the impossible date %s',
    (value) => {
      expect(read(`landing=${value}`)).toBeNull();
    },
  );

  it('rejects a landing outside the ephemeris range', () => {
    expect(read('landing=2026-10-31T23:59:00Z')).toBeNull();
    expect(read('landing=2028-01-01T00:01:00Z')).toBeNull();
  });

  it('returns null when the parameters are absent', () => {
    expect(read('')).toBeNull();
    expect(read('site=malapert-a')).toBeNull();
    expect(read('phase=orbit&speed=4')).toBeNull();
  });

  it.each(['__proto__', 'Malapert-A', 'a b', 'a_b', '../x', 'x'.repeat(65), ''])(
    'rejects the hostile or malformed site %j',
    (site) => {
      expect(read(`landing=2027-01-31T00:00:00Z&site=${encodeURIComponent(site)}`)).toBeNull();
    },
  );

  it('keeps a prototype-like but well-formed site as plain data', () => {
    const r = read('landing=2027-01-31T00:00:00Z&site=constructor');
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
    expect(Object.keys(r ?? {}).sort()).toEqual(['landing', 'site']);
    expect(r?.site).toBe('constructor');
  });
});
