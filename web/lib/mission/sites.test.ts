import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMissionData } from './sites';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data');
const read = (relative: string): unknown => JSON.parse(readFileSync(resolve(dataDir, relative), 'utf8'));

function stubFetch() {
  const catalog = read('sites.json') as { sites: { id: string }[] };
  const served = { ...catalog, sites: catalog.sites.filter((s) => s.id === 'apollo-11' || s.id === 'change-4') };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/data/sites.json') return Response.json(served);
      if (url === '/data/terrains.json') return Response.json({});
      return Response.json(read(url.replace('/data/', '')));
    }),
  );
}

const open = (query: string) => window.history.replaceState(null, '', `/${query}`);
const load = () => loadMissionData(() => undefined);

beforeEach(stubFetch);
afterEach(() => {
  vi.unstubAllGlobals();
  open('');
});

describe('loadMissionData landing parameters', () => {
  it('keeps the default landing when the URL carries no parameters', async () => {
    open('');
    const data = await load();
    expect(data.landingDate.toISOString()).toBe('2027-01-10T00:00:00.000Z');
    expect(data.requestedSiteId).toBeUndefined();
  });

  it('uses a valid landing and exposes the requested catalog site', async () => {
    open('?landing=2027-01-31T00:00:00Z&site=apollo-11');
    const data = await load();
    expect(data.landingDate.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(data.requestedSiteId).toBe('apollo-11');
  });

  it('uses the landing alone for custom coordinates', async () => {
    open('?landing=2027-03-05T13:45:00Z');
    const data = await load();
    expect(data.landingDate.toISOString()).toBe('2027-03-05T13:45:00.000Z');
    expect(data.requestedSiteId).toBeUndefined();
  });

  it.each([
    '?landing=2027-01-31T00:00:00',
    '?landing=2031-01-31T00:00:00Z',
    '?landing=2027-01-31T00:00:00Z&site=__proto__',
    '?site=apollo-11',
  ])('falls back to the default landing for %s', async (query) => {
    open(query);
    const data = await load();
    expect(data.landingDate.toISOString()).toBe('2027-01-10T00:00:00.000Z');
    expect(data.requestedSiteId).toBeUndefined();
  });

  it.each(['constructor', 'not-in-the-catalog'])('ignores the site %s but keeps the landing', async (site) => {
    open(`?landing=2027-01-31T00:00:00Z&site=${site}`);
    const data = await load();
    expect(data.landingDate.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(data.requestedSiteId).toBeUndefined();
  });
});
