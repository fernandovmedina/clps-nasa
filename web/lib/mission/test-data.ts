import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackFromFile, type EphemerisFile, type GlobalFile, type HorizonFile, type SitesFile } from '@touchdown/core';
import { DEFAULT_LANDING } from './launch-plan';
import type { MissionData, SiteInput } from './sites';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data');
const read = <T>(relative: string): T => JSON.parse(readFileSync(resolve(dataDir, relative), 'utf8')) as T;

/** The real catalog, ephemeris and horizons of web/public/data, as the loader would build them (no terrain). Tests only. */
export function realMissionData(landingDate: Date = DEFAULT_LANDING): MissionData {
  const catalog = read<SitesFile>('sites.json');
  const sites: SiteInput[] = catalog.sites.map((s) => ({
    id: s.id, name: s.name, lat: s.lat, lon: s.lon, elevationKm: s.elevation_m / 1000, slopeDeg: 6.5, note: s.notes,
    track: trackFromFile(read<EphemerisFile>(`ephemeris/${s.id}.json`)),
    horizon: read<HorizonFile>(`horizons/${s.id}.json`),
    hasTerrain: s.has_terrain, horizonSource: s.horizon_source, ephemerisSource: s.ephemeris_source,
  }));
  return {
    landingDate,
    sites,
    global: read<GlobalFile>('global.json'),
    ephemerisRange: { start: new Date(catalog.ephemeris_range.start), end: new Date(catalog.ephemeris_range.end) },
  };
}
