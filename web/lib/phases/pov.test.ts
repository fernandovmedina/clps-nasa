import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import type { EphemerisFile, HorizonFile, SitesFile } from '@touchdown/core';
import { trackFromFile } from '@touchdown/core';
import { describe, expect, it } from 'vitest';
import { evaluateSites, type SiteMetrics, type SkyPos } from '../mission/scoring';
import type { SiteInput } from '../mission/sites';
import { initialLook, lookAtBody, nearReliefNote, scoreText, skyElevationText } from './pov';

const sky = (azimuth: number, elevation: number, aboveHorizon: number): SkyPos => {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  return { azimuth, elevation, aboveHorizon, local: new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)) };
};
const metrics = (sun: SkyPos, earth: SkyPos) => ({ sun, earth }) as SiteMetrics;

describe('etiquetas del HUD', () => {
  it('la elevación dice las dos referencias: el plano local y el horizonte LOLA', () => {
    expect(skyElevationText(sky(93, 1.06, 3.83)).full).toBe('1.06° de elevación · 3.83° sobre el horizonte LOLA (−2.77°)');
    expect(skyElevationText(sky(296, 1.3, -5.69)).full).toBe('1.30° de elevación · 5.69° bajo el horizonte LOLA (6.99°)');
  });

  it('el puntaje va como «94/100», no como porcentaje', () => {
    expect(scoreText(93.6)).toBe('94/100');
    expect(scoreText(58.2)).toBe('58/100');
  });

  it('solo los sitios sin heightmap RAW avisan que el relieve cercano es ilustrativo', () => {
    const base = { hasTerrain: false, horizonSource: 'lola' } as SiteInput;
    expect(nearReliefNote(base)).toBe('Relieve cercano ilustrativo · horizonte real LOLA');
    expect(nearReliefNote({ ...base, horizonSource: 'spherical' })).toBe('Relieve cercano ilustrativo · horizonte esférico (aproximado)');
    expect(nearReliefNote({ ...base, hasTerrain: true })).toBeNull();
  });
});

describe('mirada inicial', () => {
  it('si el arco Sol-Tierra cabe en el cuadro, abre en su punto medio', () => {
    const look = initialLook(metrics(sky(100, 3, 2), sky(160, 5, 4)));
    expect(look.az).toBeCloseTo(130, 0);
    expect(look.el).toBeGreaterThanOrEqual(2);
    expect(look.el).toBeLessThanOrEqual(5);
  });

  it('el punto medio cruza el norte cuando ese es el arco corto', () => {
    const look = initialLook(metrics(sky(350, 3, 2), sky(30, 3, 2)));
    expect(look.az).toBeCloseTo(10, 0);
  });

  it('con el Sol y la Tierra muy separados y la Tierra tapada, mira al cerro que la tapa', () => {
    const look = initialLook(metrics(sky(93, 0.6, 1.4), sky(296, 1.3, -5.7)));
    expect(look.az).toBeCloseTo(296, 5);
    expect(look.el).toBeCloseTo((1.3 + 7.0) / 2, 5);
  });

  it('si solo un cuerpo está sobre el horizonte geométrico, mira a ese', () => {
    expect(initialLook(metrics(sky(93, 0.6, 1.4), sky(296, -1.6, -3))).az).toBeCloseTo(93, 5);
    expect(initialLook(metrics(sky(93, -2, -3), sky(296, 3, 1))).az).toBeCloseTo(296, 5);
  });

  it('nunca apunta bajo 2° ni sobre 12°, para que el suelo llene la mitad de abajo', () => {
    expect(initialLook(metrics(sky(93, 0.1, 1), sky(296, -5, -9))).el).toBe(2);
    expect(initialLook(metrics(sky(93, 40, 40), sky(296, -5, -9))).el).toBe(12);
  });

  it('«Mirar a la Tierra» y «Mirar al Sol» apuntan a cada cuerpo', () => {
    const m = metrics(sky(93, 0.6, 1.4), sky(296, 1.3, -5.7));
    expect(lookAtBody(m, 'sun').az).toBe(93);
    expect(lookAtBody(m, 'earth').az).toBe(296);
    expect(lookAtBody(metrics(sky(93, 5, 5), sky(200, 8, 3)), 'earth')).toEqual({ az: 200, el: 8 });
  });
});

describe('Nobile Rim 2 con datos reales', () => {
  const PUBLIC = join(process.cwd(), 'public') + '/';
  const json = <T,>(path: string) => JSON.parse(readFileSync(PUBLIC + path, 'utf8')) as T;
  const s = json<SitesFile>('data/sites.json').sites.find((x) => x.id === 'nobile-rim-2')!;
  const site: SiteInput = {
    id: s.id, name: s.name, lat: s.lat, lon: s.lon, elevationKm: s.elevation_m / 1000, slopeDeg: 6.5,
    track: trackFromFile(json<EphemerisFile>('data/ephemeris/nobile-rim-2.json')), horizon: json<HorizonFile>('data/horizons/nobile-rim-2.json'),
    hasTerrain: true, horizonSource: s.horizon_source, ephemerisSource: s.ephemeris_source,
  };
  const m = evaluateSites([site], new Date('2027-01-10T00:00:00Z'))[0]!;

  it('abre mirando al cerro que tapa la Tierra, con el Sol fuera de cuadro', () => {
    const look = initialLook(m);
    expect(Math.abs(look.az - m.earth.azimuth)).toBeLessThan(1e-6);
    expect(look.el).toBeGreaterThan(m.earth.elevation);
    expect(look.el).toBeLessThan(m.earth.elevation - m.earth.aboveHorizon);
  });

  it('el texto de la Tierra usa las cifras del escenario', () => {
    const text = skyElevationText(m.earth);
    expect(text.value).toBe('1.30°');
    expect(text.detail).toMatch(/^de elevación · 5\.69° bajo el horizonte LOLA \(6\.9[89]°\)$/);
  });
});
