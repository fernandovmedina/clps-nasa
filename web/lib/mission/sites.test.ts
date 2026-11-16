import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/lib/i18n';
import { DEMO_CRASH_NOTE, NO_CAER_SITE_ID, demoCrashNote, devFallbackMission, loadMissionData, rankingNote } from './sites';

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

describe('ranking notes', () => {
  it('carries the catalog region of every loaded site and tags NO CAER as the only crash', async () => {
    const data = await load();
    const byId = new Map(data.sites.map((s) => [s.id, s]));
    expect(byId.get('apollo-11')?.region).toBe('equatorial');
    expect(byId.get('change-4')?.region).toBe('far-side');
    expect(byId.get(NO_CAER_SITE_ID)?.crash).toBe(true);
    expect(data.sites.filter((s) => s.crash)).toHaveLength(1);
  });

  it('labels contrast sites by region, the demo case apart and leaves south-pole and unknown sites bare', () => {
    expect(rankingNote({ region: 'equatorial' })).toBe('Contraste · ecuatorial');
    expect(rankingNote({ region: 'mid-latitude' })).toBe('Contraste · latitud media');
    expect(rankingNote({ region: 'far-side' })).toBe('Contraste · lado oculto');
    expect(rankingNote({ region: 'south-pole' })).toBeUndefined();
    expect(rankingNote({})).toBeUndefined();
    expect(rankingNote({ crash: true, region: 'south-pole' })).toBe(DEMO_CRASH_NOTE);
    expect(DEMO_CRASH_NOTE).toBe('Caso de demostración · falla simulada del motor');
  });
});

describe('English text', () => {
  it('labels contrast sites and the demo case in English, leaving the rest bare', () => {
    setLang('en', { persist: false });
    expect(rankingNote({ region: 'equatorial' })).toBe('Contrast · equatorial');
    expect(rankingNote({ region: 'mid-latitude' })).toBe('Contrast · mid-latitude');
    expect(rankingNote({ region: 'far-side' })).toBe('Contrast · far side');
    expect(rankingNote({ region: 'south-pole' })).toBeUndefined();
    expect(rankingNote({})).toBeUndefined();
    expect(rankingNote({ crash: true, region: 'south-pole' })).toBe('Demo case · simulated engine failure');
    expect(demoCrashNote()).toBe('Demo case · simulated engine failure');
  });

  it('keeps the Spanish constant fixed and follows the language on every call', () => {
    setLang('en', { persist: false });
    expect(DEMO_CRASH_NOTE).toBe('Caso de demostración · falla simulada del motor');
    expect(rankingNote({ region: 'far-side' })).toBe('Contrast · far side');
    setLang('es', { persist: false });
    expect(rankingNote({ region: 'far-side' })).toBe('Contraste · lado oculto');
  });

  it('reports the loading steps in English, keeping site names as they are', async () => {
    setLang('en', { persist: false });
    const messages: string[] = [];
    await loadMissionData((_p, msg) => messages.push(msg));
    expect(messages[0]).toBe('Loading site catalog · NASA LOLA + JPL Horizons');
    expect(messages.some((m) => /^Ephemeris and horizon · .+/.test(m))).toBe(true);
    expect(messages.at(-1)).toBe('Data ready');
  });

  it('reports the loading steps in Spanish with the same site names', async () => {
    const messages: string[] = [];
    await loadMissionData((_p, msg) => messages.push(msg));
    expect(messages[0]).toBe('Cargando catálogo de sitios · NASA LOLA + JPL Horizons');
    expect(messages.some((m) => m.startsWith('Efemérides y horizonte · '))).toBe(true);
    expect(messages.at(-1)).toBe('Datos listos');
  });

  it('gives NO CAER a note that follows the language when read, and keeps its name', async () => {
    const data = await load();
    const demo = data.sites.find((s) => s.id === NO_CAER_SITE_ID)!;
    expect(demo.name).toBe('NO CAER');
    expect(demo.note).toBe('Caso de demostración, no es un sitio real: el descenso termina en impacto.');
    setLang('en', { persist: false });
    expect(demo.note).toBe('Demo case, not a real site: the descent ends in an impact.');
    expect(demo.name).toBe('NO CAER');
  });

  it('names the development fallback site in English', () => {
    setLang('en', { persist: false });
    const site = devFallbackMission().sites[0]!;
    expect(site.name).toBe('Development site (no real data)');
    expect(site.note).toContain('Development fallback: not a real site');
  });
});

