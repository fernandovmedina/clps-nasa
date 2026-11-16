import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import type { EphemerisFile, HorizonFile, Marker, SitesFile, TerrainInfo } from '@touchdown/core';
import { trackFromFile } from '@touchdown/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/lib/i18n';
import type { Dict } from '@/lib/i18n/dict';
import { phasesCommonDict } from '@/lib/i18n/dicts/phases-common';
import { phasesLandingDict } from '@/lib/i18n/dicts/phases-landing';
import { phasesLaunchDict } from '@/lib/i18n/dicts/phases-launch';
import { phasesOrbitDict } from '@/lib/i18n/dicts/phases-orbit';
import { phasesPovDict } from '@/lib/i18n/dicts/phases-pov';
import { phasesTransmitDict } from '@/lib/i18n/dicts/phases-transmit';
import { phasesWorldDict } from '@/lib/i18n/dicts/phases-world';
import type { LunarApp } from '../engine/app';
import { countdownFigure, type PhaseHud, type RunMode } from '../engine/hud';
import { Panel } from '../engine/panel';
import { evaluateSites, type SiteMetrics } from '../mission/scoring';
import { NO_CAER_SITE_ID, type MissionData, type SiteInput } from '../mission/sites';
import { realMissionData } from '../mission/test-data';
import { decodeTerrainPatch, type TerrainPatch } from '../mission/terrain';
import { CabinConsole, type ConsoleHost } from './landing-console';
import { LandingPhase } from './landing';
import { LaunchPhase, countFigure, loadMessage } from './launch';
import { MarkerField, markerLabel } from './markers';
import { OrbitPhase } from './orbit';
import { int, landingDate, percent, rankNote, statusLabel } from './phases-format';
import { PovPhase, earthLinkText, nearReliefNote, skyElevationText, skyHorizonLabel, temperatureLabel } from './pov';
import { SpyView } from './spy-view';
import { SurfaceWorld, earthOcclusionLabel, horizonName } from './surface-world';
import { TransmitPhase, buildRelayLabel, earthElevationText, packetsText } from './transmit';

vi.mock('./lander-model', () => ({ loadLanderModel: async () => null }));
vi.mock('./astronaut', async (original) => ({ ...(await original<typeof import('./astronaut')>()), loadAstronaut: async () => null }));
vi.mock('../mission/control-link', () => ({ controlHrefFor: () => '/mission-control/' }));

const en = () => setLang('en', { persist: false });
const es = () => setLang('es', { persist: false });

/* ---------- lienzo de mentira que recuerda el texto pintado en cada canvas ---------- */
const painted = new Map<HTMLCanvasElement, string[]>();

function recordingContext(list: string[]) {
  const data = new Uint8ClampedArray(512 * 512 * 4);
  const fn: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === 'data' ? data : fn),
    set: () => true,
    apply: () => fn,
  });
  const base = fn as Record<string | symbol, unknown>;
  return new Proxy(base, {
    get: (t, key) => (key === 'measureText' ? (s: string) => ({ width: s.length * 12 })
      : key === 'fillText' ? (text: string) => { list.push(text); }
      : key === 'clearRect' ? () => { list.length = 0; }
      : t[key]),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  painted.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!painted.has(this)) painted.set(this, []);
    return recordingContext(painted.get(this)!) as never;
  });
});
afterEach(() => vi.restoreAllMocks());

const textsOf = (canvas: HTMLCanvasElement) => [...(painted.get(canvas) ?? [])];
const spriteTexts = (s: THREE.Sprite) => textsOf((s.material.map as THREE.CanvasTexture).image as HTMLCanvasElement);

/** Repinta un panel que se invalidó y devuelve lo que escribió. */
function redraw(panel: Panel) {
  panel.mesh.visible = true;
  panel.update();
  return textsOf(panel.canvas);
}

function paint(draw: (p: Panel, g: CanvasRenderingContext2D) => void, px: [number, number], widthM: number) {
  const panel = new Panel(px[0], px[1], widthM, () => undefined);
  panel.ctx.clearRect(0, 0, 1, 1);
  draw(panel, panel.ctx);
  return textsOf(panel.canvas);
}

type Internals = Record<string, (...a: never[]) => unknown>;
const method = <T>(cls: { prototype: object }, name: string) => (cls.prototype as unknown as Record<string, T>)[name]!;

/* ---------- diccionarios ---------- */
describe('diccionarios de las fases', () => {
  const dicts: Record<string, Dict<Record<string, string>>> = {
    common: phasesCommonDict, launch: phasesLaunchDict, orbit: phasesOrbitDict, pov: phasesPovDict,
    landing: phasesLandingDict, transmit: phasesTransmitDict, world: phasesWorldDict,
  };
  const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

  it.each(Object.entries(dicts))('«%s»: cada clave lleva en inglés los mismos {marcadores} que en español', (_name, dict) => {
    for (const key of Object.keys(dict.es)) expect(vars(dict.en[key]!), key).toEqual(vars(dict.es[key]!));
  });

  it('en español la cifra de la cuenta regresiva es la de siempre (engine/hud)', () => {
    for (const label of ['T-3', 'T-2', 'T-1', 'IGNICIÓN', 'DESPEGUE', '']) expect(countFigure(label), label).toEqual(countdownFigure(label));
  });

  it('en inglés la cuenta regresiva habla de ignición y despegue', () => {
    en();
    expect(countFigure('T-3')).toEqual({ value: 'T − 3', caption: 'seconds to ignition' });
    expect(countFigure('IGNICIÓN')).toEqual({ value: 'Ignition', caption: 'engine start' });
    expect(countFigure('DESPEGUE')).toEqual({ value: 'Liftoff', caption: 'bound for the Moon' });
  });

  it('el mensaje del cargador (siempre en español) se traduce en inglés y en español pasa tal cual', () => {
    expect(loadMessage('Datos listos')).toBe('Datos listos');
    en();
    expect(loadMessage('Cargando catálogo de sitios · NASA LOLA + JPL Horizons')).toBe('Loading site catalog · NASA LOLA + JPL Horizons');
    expect(loadMessage('Efemérides y horizonte · Malapert A (IM-1 Odysseus)')).toBe('Ephemeris and horizon · Malapert A (IM-1 Odysseus)');
    expect(loadMessage('Terreno LOLA (heightmap) · Nobile Rim 2')).toBe('LOLA terrain (heightmap) · Nobile Rim 2');
    expect(loadMessage('Datos listos')).toBe('Data ready');
    expect(loadMessage('otra cosa')).toBe('otra cosa');
  });

  it('números y fechas: en inglés coma de miles y mes en inglés; en español, como siempre', () => {
    expect(int(384400)).toBe(`384${String.fromCharCode(160)}400`);
    expect(percent(58.2)).toBe(`58${String.fromCharCode(160)}%`);
    expect(landingDate(new Date('2027-01-10T00:00:00Z'))).toBe('10 ene 2027 · 00:00 UTC');
    en();
    expect(int(384400)).toBe('384,400');
    expect(percent(58.2)).toBe('58%');
    expect(landingDate(new Date('2027-01-10T00:00:00Z'))).toBe('Jan 10, 2027 · 00:00 UTC');
  });

  it('estado, notas de contraste y del caso demo en los dos idiomas', () => {
    expect(statusLabel('not_viable')).toBe('No viable');
    expect(rankNote({ region: 'far-side' })).toBe('Contraste · lado oculto');
    en();
    expect(statusLabel('viable')).toBe('Viable');
    expect(statusLabel('marginal')).toBe('Marginal');
    expect(statusLabel('not_viable')).toBe('Not viable');
    expect(rankNote({ region: 'equatorial' })).toBe('Contrast · equatorial');
    expect(rankNote({ region: 'mid-latitude' })).toBe('Contrast · mid-latitude');
    expect(rankNote({ region: 'far-side' })).toBe('Contrast · far side');
    expect(rankNote({ crash: true })).toBe('Demo case · simulated engine failure');
    expect(rankNote({ region: 'south-pole' })).toBeUndefined();
  });
});

/* ---------- despegue ---------- */
describe('despegue en inglés', () => {
  const fake = (over: Record<string, unknown> = {}) => ({
    started: false, countLabel: '', t: 0, done: true, shownPct: 0.4, status: 'Data ready',
    statusSrc: { kind: 'ready' }, tele: { alt: '12.5 km', vel: '3.20 km/s', dist: '384,400 km' },
    app: { isHost: true, room: { status: 'open', room: 'abc' } }, beginCountdown: () => undefined, ...over,
  });
  const controlHud = (f: object) => method<() => PhaseHud>(LaunchPhase, 'controlHud').call(f);

  it('antes de despegar: cifra «Ready», botón «Start launch», lecturas y progreso en inglés', () => {
    en();
    const hud = controlHud(fake());
    expect(hud.figure).toEqual({ value: 'Ready', caption: 'for launch' });
    expect(hud.primary?.label).toBe('Start launch');
    expect(hud.progress?.label).toBe('Data loading');
    expect(hud.detail).toBe('Anyone following you can join with code abc before launch.');
    expect(hud.side).toMatchObject({ kind: 'readouts', items: [
      { label: 'Altitude', value: '12.5 km' }, { label: 'Velocity', value: '3.20 km/s' }, { label: 'Distance to the Moon', value: '384,400 km' },
    ] });
  });

  it('en español conserva los textos y el espacio duro de siempre', () => {
    const hud = controlHud(fake());
    expect(hud.figure).toEqual({ value: 'Listo', caption: 'para despegar' });
    expect(hud.primary?.label).toBe('Comenzar despegue');
    expect(hud.side).toMatchObject({ items: [{ label: 'Altitud', value: '12.5 km' }, { label: 'Velocidad' }, { label: 'Distancia a la Luna', value: `384${String.fromCharCode(160)}400 km` }] });
  });

  it('durante la cuenta: «T − 3» y, al encender, «Ignition»', () => {
    en();
    expect(controlHud(fake({ started: true, countLabel: 'T-3' })).figure).toEqual({ value: 'T − 3', caption: 'seconds to ignition' });
    expect(controlHud(fake({ started: true, countLabel: 'IGNICIÓN' })).figure.value).toBe('Ignition');
  });

  it('el panel de VR pinta el rótulo, las columnas y el botón en inglés', () => {
    en();
    const drawHud = method<(p: Panel, g: CanvasRenderingContext2D) => void>(LaunchPhase, 'drawHud');
    expect(paint(drawHud.bind(fake()), [1400, 360], 1.15)).toEqual(expect.arrayContaining(['Data ready', 'Start launch', '40%']));
    const started = paint(drawHud.bind(fake({ started: true })), [1400, 360], 1.15);
    expect(started).toEqual(expect.arrayContaining(['ALTITUDE', 'VELOCITY', 'DISTANCE TO MOON', '12.5 km']));
  });

  it('el panel de la cuenta pinta «IGNITION» aunque el rótulo interno siga en español', () => {
    en();
    const drawCount = method<(p: Panel, g: CanvasRenderingContext2D) => void>(LaunchPhase, 'drawCount');
    expect(paint(drawCount.bind(fake({ countLabel: 'IGNICIÓN' })), [480, 360], 0.4)).toEqual(['IGNITION']);
    expect(paint(drawCount.bind(fake({ countLabel: 'T-2' })), [480, 360], 0.4)).toEqual(['T-2']);
  });

  it('onLangChange reescribe la línea de estado e invalida el HUD y la cuenta', () => {
    const f = fake() as ReturnType<typeof fake> & { hud: { invalidate: () => void }; count: { invalidate: () => void } };
    f.hud = { invalidate: vi.fn() }; f.count = { invalidate: vi.fn() };
    en();
    method<() => void>(LaunchPhase, 'onLangChange').call(f);
    expect(f.status).toBe('Data ready · Heading for the lunar south pole');
    expect(f.hud.invalidate).toHaveBeenCalledOnce();
    expect(f.count.invalidate).toHaveBeenCalledOnce();
    es();
    method<() => void>(LaunchPhase, 'onLangChange').call(f);
    expect(f.status).toBe('Datos listos · Rumbo al polo sur lunar');
  });
});

/* ---------- órbita ---------- */
const REGIONS: Record<string, SiteInput['region']> = { 'apollo-11': 'equatorial', 'apollo-17': 'equatorial', 'chandrayaan-3': 'mid-latitude', 'change-4': 'far-side' };

function missionWithDemo(): MissionData {
  const data = realMissionData();
  const sites: SiteInput[] = data.sites.map((s) => ({ ...s, region: REGIONS[s.id] ?? 'south-pole' }));
  const src = sites.find((s) => s.id === 'malapert-massif')!;
  sites.push({ ...src, id: NO_CAER_SITE_ID, name: 'NO CAER', note: 'Caso de demostración, no es un sitio real.', crash: true });
  return { ...data, sites };
}

function orbitApp() {
  const app = {
    flags: new Set<string>(['orbit-done']), data: missionWithDemo(), ranking: [] as SiteMetrics[], selected: null as SiteMetrics | null,
    isXR: false, isHost: true, camera: new THREE.PerspectiveCamera(60, 1.6, 1, 500_000), rig: new THREE.Group(),
    renderer: { domElement: { clientWidth: 1440, clientHeight: 900 } }, moonTex: { general: new THREE.Texture(), north: null, south: null },
    room: { status: 'closed', room: 'test', setListener: vi.fn(), send: vi.fn() }, audio: { play: vi.fn(), loop: vi.fn(() => ({ stop: vi.fn() })) },
    narrator: { say: vi.fn() }, setView: vi.fn(), goTo: vi.fn(), applyMarkerEvent: vi.fn(),
  };
  return app as unknown as LunarApp & typeof app;
}

describe('órbita en inglés', () => {
  type OrbitInner = { list: Panel; detail: Panel; markers: { m: SiteMetrics; label: THREE.Sprite }[] };
  function open() {
    const app = orbitApp();
    const phase = new OrbitPhase(app);
    for (let i = 0; i < 30; i++) phase.update(0.5);
    return { app, phase, inner: phase as unknown as OrbitInner };
  }

  it('el HUD del DOM sale en inglés: cifra, estado, retraso, notas y botón', () => {
    const { app, phase } = open();
    en();
    app.selected = app.ranking.find((m) => m.site.id === 'apollo-11')!;
    const hud = phase.controlHud();
    expect(hud.figure.caption).toBe(`of 100 · ${app.selected.site.name}`);
    expect(hud.figure.badge?.label).toMatch(/^(Viable|Marginal|Not viable)$/);
    expect(hud.detail).toMatch(/^Contrast · equatorial · /);
    expect(hud.toggles?.label).toBe('Simulate delay');
    expect(hud.toggles?.options.at(-1)?.label).toBe('Original');
    expect(hud.primary?.label).toBe('Preconfirm site');
    expect(hud.side).toMatchObject({ kind: 'ranking', title: 'Sites evaluated' });
    expect(hud.facts?.map((f) => f.label)).toEqual(['Sun elevation', 'Illumination over 14 d', 'Earth elevation', 'Earth visible']);
    app.selected = app.ranking.find((m) => m.site.id === NO_CAER_SITE_ID)!;
    const demo = phase.controlHud();
    expect(demo.figure).toEqual({ value: 'DEMO', caption: 'NO CAER · simulated engine failure' });
    expect(demo.detail).toBe('Demo case · simulated engine failure · not a real site, no score');
  });

  it('el aviso de rango y el retraso se escriben en el idioma del momento', () => {
    const { phase } = open();
    const inner = phase as unknown as { applyDelay(d: number): void; rangeWarning: string | null };
    inner.applyDelay(999);
    expect(inner.rangeWarning).toMatch(/^\+999 d fuera de rango/);
    en();
    expect(inner.rangeWarning).toMatch(/^\+999 d out of range · 0 to \+\d+ d with the precomputed data$/);
    expect(phase.controlHud().detail).toBe(inner.rangeWarning);
  });

  it('onLangChange invalida las dos listas y rehace la ficha de cada pin con el texto nuevo, liberando la textura vieja', () => {
    const { phase, inner } = open();
    const apollo = inner.markers.find((mk) => mk.m.site.id === 'apollo-11')!;
    expect(spriteTexts(apollo.label)).toEqual(expect.arrayContaining(['Contraste', 'ecuatorial']));
    const oldLabel = apollo.label;
    const oldMap = apollo.label.material.map as THREE.Texture;
    const disposed = vi.spyOn(oldMap, 'dispose');
    const list = vi.spyOn(inner.list, 'invalidate'), detail = vi.spyOn(inner.detail, 'invalidate');
    en();
    phase.onLangChange();
    expect(list).toHaveBeenCalled();
    expect(detail).toHaveBeenCalled();
    expect(disposed).toHaveBeenCalled();
    const fresh = inner.markers.find((mk) => mk.m.site.id === 'apollo-11')!;
    expect(fresh.label).not.toBe(oldLabel);
    expect(spriteTexts(fresh.label)).toEqual(expect.arrayContaining(['Contrast', 'equatorial']));
    expect(spriteTexts(fresh.label)).not.toContain('Contraste');
    const demo = inner.markers.find((mk) => mk.m.site.id === NO_CAER_SITE_ID)!;
    expect(spriteTexts(demo.label)[0]).toMatch(/^#\d+ · DEMO$/);
  });

  it('los paneles de VR pintan en inglés: lista, ranking, fila de retraso y detalle', () => {
    const { app, phase, inner } = open();
    app.selected = app.ranking.find((m) => m.site.id === 'malapert-a')!;
    en();
    phase.onLangChange();
    const list = redraw(inner.list);
    expect(list).toEqual(expect.arrayContaining(['Sites evaluated', 'Final ranking · tap a site', 'SIMULATE DELAY', '↺ original']));
    expect(list.some((t) => /^Landing \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(t))).toBe(true);
    expect(list.some((t) => /^SUN \d+%  ·  EARTH \d+%/.test(t) || /SUN \d+%  ·  EARTH \d+%  ·  BOTH \d+%/.test(t))).toBe(true);
    const detail = redraw(inner.detail);
    expect(detail).toEqual(expect.arrayContaining(['Preconfirm site', 'SUN ELEVATION', 'EARTHSET IN', 'LONGEST NIGHT', 'VISIBLE SOLAR DISK', 'Power · 30%', 'Earth link · 25%']));
    expect(detail.some((t) => /^Viability · rank #\d+ of 10$/.test(t))).toBe(true);
    app.selected = app.ranking.find((m) => m.site.id === NO_CAER_SITE_ID)!;
    phase.onLangChange();
    expect(redraw(inner.detail)).toEqual(expect.arrayContaining(['Demo case', 'Simulated engine failure', 'Not a real site: it has no score or readings of its own.']));
  });
});

/* ---------- vista del sitio ---------- */
function povFake() {
  const sky = (elevation: number, aboveHorizon: number) => ({ elevation, aboveHorizon, azimuth: 120, local: new THREE.Vector3(0, 0, -1) });
  const m = {
    site: { name: 'Malapert A', lat: -80.1, lon: 1.4, hasTerrain: true, horizonSource: 'lola' },
    sun: sky(1.2, 0.4), earth: sky(3, 1), hoursToSunset: 20, hoursToEarthset: 50, powerPct: 71, tempC: -20, score: 72, status: 'marginal',
    illumPct: 80, earthPct: 90, breakdown: { ops: 0.7, energy: 0.8, comms: 0.8, continuity: 0.6 }, longestDarkH: 30, rank: 2,
  };
  const series = Array.from({ length: 169 }, (_, i) => ({ sun: Math.sin(i / 10) * 3, earth: 2 + Math.cos(i / 12) * 2, hSun: 0.5, hEarth: 0.2 }));
  return { m, series, aimPoint: null, app: { data: { landingDate: new Date('2027-01-10T00:00:00Z') }, isHost: true, goTo: () => undefined }, world: { roughness: 0.42 }, placeMarker: () => undefined, lookAtBody: () => undefined };
}

describe('vista del sitio en inglés', () => {
  it('las frases de elevación y horizonte, con LOLA y con horizonte geométrico', () => {
    en();
    const sky = (azimuth: number, elevation: number, aboveHorizon: number) => ({ azimuth, elevation, aboveHorizon }) as never;
    expect(skyElevationText(sky(93, 1.06, 3.83), { horizonSource: 'lola' }).full).toBe('1.06° elevation · 3.83° above the LOLA horizon (−2.77°)');
    expect(skyElevationText(sky(296, 1.3, -5.69), { horizonSource: 'spherical' }).full).toBe('1.30° elevation · 5.69° below the geometric horizon (6.99°)');
    expect(skyHorizonLabel('Tierra', { horizonSource: 'spherical' })).toBe('Earth above the geometric horizon');
    expect(skyHorizonLabel('Sol', { horizonSource: 'lola' })).toBe('Sun above the LOLA horizon');
    expect(horizonName({ horizonSource: 'lola' })).toBe('LOLA');
    expect(temperatureLabel()).toBe('Approx. temperature');
    expect(earthLinkText(true)).toBe('direct-to-Earth (DTE) link');
    expect(earthLinkText(false)).toBe('hidden from the surface · needs a relay');
    const base = { id: 'x', hasTerrain: false, horizonSource: 'lola' } as never;
    expect(nearReliefNote(base)).toBe('Illustrative near-field relief · horizon: real LOLA');
    expect(nearReliefNote({ ...(base as object), hasTerrain: true } as never)).toBe('Relief: LOLA 80 m/px · minor craters and ground texture are illustrative');
  });

  it('el HUD del DOM: figura, hechos, bloques de cielo, marcas de riesgo y acciones en inglés', () => {
    en();
    const hud = method<() => PhaseHud>(PovPhase, 'controlHud').call(povFake());
    expect(hud.figure).toEqual({ value: 'Sunlit', caption: 'Drag to look around' });
    expect(hud.detail).toContain('The Sun is 0.40° above the LOLA horizon and sets in 20 h. The longest night of the mission lasts 30 h.');
    expect(hud.facts).toEqual([
      { label: 'Longest night', value: '30 h' }, { label: 'Score', value: '72/100 · Marginal' }, { label: 'Communication window', value: '50 h remaining'.replace('50 h', '2.1 d') },
    ]);
    expect(hud.side).toMatchObject({ kind: 'sky', blocks: [
      { label: 'Sun · power', shareLabel: 'Sun visible 80% of the 14 days' },
      { label: 'Earth · communications', shareLabel: 'Earth visible 90% of the 14 days' },
    ] });
    const side = hud.side as Extract<PhaseHud['side'], { kind: 'sky' }>;
    expect(side.blocks[0]!.detail).toBe('elevation · 0.40° above the LOLA horizon (0.80°) · azimuth 120°'.replace('(0.80°)', '(0.80°)'));
    expect(side.blocks[1]!.detail).toContain('direct-to-Earth (DTE) link');
    expect(side.extras?.map((e) => e.label)).toEqual(['Visible solar disk', 'Approx. temperature', 'Roughness at 120 m (LOLA DEM)']);
    expect(side.marks).toMatchObject({ label: 'Mark a hazard where you look (green ring)' });
    expect(side.marks?.options.map((o) => o.label)).toEqual(['Rock', 'Slope', 'Shadow', 'Other']);
    expect(hud.secondary?.map((a) => a.label)).toEqual(['Look at the Sun', 'Look at the Earth', 'Choose another site']);
    expect(hud.primary?.label).toBe('Begin descent');
  });

  it('los paneles de VR pintan en inglés', () => {
    en();
    const info = paint(method<(p: Panel, g: CanvasRenderingContext2D) => void>(PovPhase, 'drawInfo').bind(povFake()), [1024, 1240], 0.66);
    expect(info).toEqual(expect.arrayContaining(['VIEW FROM THE SITE · PRE-CONFIRMATION', 'Sun · elevation / azimuth', 'Communication window', 'NEXT 14 DAYS · ELEVATION (°)', 'sunlit', '- - LOLA horizon', 'Sun', 'Earth']));
    const actions = paint(method<(p: Panel, g: CanvasRenderingContext2D) => void>(PovPhase, 'drawActions').bind(povFake()), [1024, 960], 0.56);
    expect(actions).toEqual(expect.arrayContaining(['Site viability', '#2 in the ranking', 'Confirm landing', 'Choose another site', 'Look at the Sun', 'Look at the Earth', '🪨 Rock', '⛰ Slope', '🌑 Shadow', '⚠ Other', 'Mark a hazard where you are looking (green ring)']));
  });

  it('onLangChange invalida los dos paneles y rehace las fichas del mundo, de los riesgos y del visor', () => {
    const f = { info: { invalidate: vi.fn() }, actions: { invalidate: vi.fn() }, world: { relabel: vi.fn() }, markerField: { relabel: vi.fn() }, spy: { relabel: vi.fn() } };
    en();
    method<() => void>(PovPhase, 'onLangChange').call(f);
    for (const part of [f.info.invalidate, f.actions.invalidate, f.world.relabel, f.markerField.relabel, f.spy.relabel]) expect(part).toHaveBeenCalledOnce();
    method<() => void>(PovPhase, 'onLangChange').call({ ...f, spy: null });
  });
});

/* ---------- fichas de riesgo y visor del inspector ---------- */
describe('fichas de riesgo en inglés', () => {
  const marker = (kind: Marker['kind'], note?: string): Marker => ({ id: kind, site_id: 'x', kind, x_m: 3, y_m: 4, note });

  it('relabel() repinta cada ficha en su mismo sprite y libera la textura vieja', () => {
    const scene = new THREE.Scene();
    const field = new MarkerField(scene, 'x', () => 0);
    field.sync([marker('rock', 'Roca grande'), marker('other')]);
    const sprites: THREE.Sprite[] = [];
    scene.traverse((o) => { if ((o as THREE.Sprite).isSprite) sprites.push(o as THREE.Sprite); });
    expect(sprites.map(spriteTexts)).toEqual([['🪨 Roca', 'Roca grande'], ['⚠ Otro']]);
    const oldMaps = sprites.map((s) => s.material.map as THREE.Texture);
    const disposed = oldMaps.map((m) => vi.spyOn(m, 'dispose'));
    en();
    field.relabel();
    expect(sprites.map(spriteTexts)).toEqual([['🪨 Rock', 'Roca grande'], ['⚠ Other']]);
    disposed.forEach((d) => expect(d).toHaveBeenCalled());
    sprites.forEach((s, i) => expect(s.material.map).not.toBe(oldMaps[i]));
    expect(markerLabel('slope')).toBe('Slope');
    field.dispose();
  });
});

describe('visor del inspector en inglés', () => {
  it('relabel() repinta el título y las dos insignias sin mover ni mostrar nada', () => {
    const view = new SpyView(new THREE.Scene(), 'malapert-a');
    const sprites = view.mesh.children.filter((o) => (o as THREE.Sprite).isSprite) as THREE.Sprite[];
    expect(sprites.map(spriteTexts).flat()).toEqual(['VISTA DEL INSPECTOR VR', '● EN VIVO', '● SIN SEÑAL']);
    const before = sprites.map((s) => ({ pos: s.position.clone(), visible: s.visible }));
    en();
    view.relabel();
    expect(sprites.map(spriteTexts).flat()).toEqual(['VR INSPECTOR VIEW', '● LIVE', '● NO SIGNAL']);
    sprites.forEach((s, i) => { expect(s.position).toEqual(before[i]!.pos); expect(s.visible).toBe(before[i]!.visible); });
    view.dispose();
  });
});

/* ---------- el mundo de la superficie ---------- */
const PUBLIC = join(process.cwd(), 'public') + '/';
const json = <T,>(path: string) => JSON.parse(readFileSync(PUBLIC + path, 'utf8')) as T;
const catalog = json<SitesFile>('data/sites.json');
const terrains = json<Record<string, TerrainInfo>>('data/terrains.json');

function loadSite(id: string): SiteInput {
  const s = catalog.sites.find((x) => x.id === id)!;
  let terrain: TerrainPatch | undefined;
  if (s.has_terrain) {
    const buf = readFileSync(PUBLIC + `static/terrain/${id}.raw`);
    terrain = decodeTerrainPatch(terrains[id]!, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
  }
  return {
    id, name: s.name, lat: s.lat, lon: s.lon, elevationKm: s.elevation_m / 1000, slopeDeg: 6.5,
    track: trackFromFile(json<EphemerisFile>(`data/ephemeris/${id}.json`)),
    horizon: json<HorizonFile>(`data/horizons/${id}.json`),
    hasTerrain: s.has_terrain, horizonSource: s.horizon_source, ephemerisSource: s.ephemeris_source, terrain,
  };
}

const worldApp = { camera: new THREE.PerspectiveCamera(), eyeHeight: 1.6 } as unknown as LunarApp;
const built: SurfaceWorld[] = [];
const worldFor = (id: string) => {
  const w = new SurfaceWorld(worldApp, evaluateSites([loadSite(id)], new Date('2027-01-10T00:00:00Z'))[0]!);
  built.push(w);
  return w;
};
afterEach(() => { while (built.length) built.pop()!.dispose(); });

describe('mundo de la superficie en inglés', () => {
  const named = (w: SurfaceWorld, name: string) => w.scene.getObjectByName(name) as THREE.Sprite;

  it('las etiquetas de nacimiento salen en español y el nombre de cada sprite no depende del texto', () => {
    const w = worldFor('nobile-rim-2');
    expect(spriteTexts(named(w, 'label:SOL'))[0]).toBe('SOL');
    expect(spriteTexts(named(w, 'label:TIERRA'))[0]).toBe('TIERRA');
    expect(spriteTexts(named(w, 'label:ZONA'))[0]).toBe('ZONA DE ALUNIZAJE');
  }, 60_000);

  it('en Nobile Rim 2 la ficha dice «Earth hidden by terrain · 5.7°»', () => {
    en();
    expect(earthOcclusionLabel(-5.69)).toBe('Earth hidden by terrain · 5.7°');
    const w = worldFor('nobile-rim-2');
    expect(w.earthGhost!.label).toBe('Earth hidden by terrain · 5.7°');
    expect(w.horizonLabelText).toBe('LOLA horizon');
    const ghost = w.earthGhost!.group.getObjectByName('label:fantasma') as THREE.Sprite;
    expect(spriteTexts(ghost)).toEqual(['Earth hidden by terrain · 5.7°', 'as seen from the surface']);
  }, 60_000);

  it('relabel() repinta todas las fichas en su mismo sprite, con otra textura, y libera la vieja', () => {
    const w = worldFor('nobile-rim-2');
    const sprites = [named(w, 'label:SOL'), named(w, 'label:TIERRA'), named(w, 'label:ZONA'), w.horizonLabel, w.earthGhost!.group.getObjectByName('label:fantasma') as THREE.Sprite];
    expect(sprites.map((s) => spriteTexts(s)[0])).toEqual(['SOL', 'TIERRA', 'ZONA DE ALUNIZAJE', 'Horizonte LOLA', 'Tierra tapada por el relieve · 5.7°']);
    const old = sprites.map((s) => s.material.map as THREE.Texture);
    const disposed = old.map((m) => vi.spyOn(m, 'dispose'));
    const pose = sprites.map((s) => ({ pos: s.position.clone(), order: s.renderOrder, depthTest: s.material.depthTest, visible: s.visible }));
    en();
    w.relabel();
    expect(sprites.map((s) => spriteTexts(s)[0])).toEqual(['SUN', 'EARTH', 'LANDING SITE', 'LOLA horizon', 'Earth hidden by terrain · 5.7°']);
    expect(spriteTexts(sprites[0]!)[1]).toMatch(/^elev [\d.]+° · az \d+°$/);
    expect(spriteTexts(sprites[2]!)[1]).toMatch(/^Ø 40 m · roughness [\d.]+ m$/);
    disposed.forEach((d) => expect(d).toHaveBeenCalled());
    sprites.forEach((s, i) => {
      expect(s.material.map).not.toBe(old[i]);
      expect(s.position).toEqual(pose[i]!.pos);
      expect(s.renderOrder).toBe(pose[i]!.order);
      expect(s.material.depthTest).toBe(pose[i]!.depthTest);
      expect(s.visible).toBe(pose[i]!.visible);
    });
  }, 60_000);
});

/* ---------- alunizaje ---------- */
describe('alunizaje en inglés', () => {
  const fake = (over: Record<string, unknown> = {}) => ({
    world: { m: { site: { lat: -80, lon: 1, hasTerrain: true, horizonSource: 'lola', crash: false } } },
    crash: false, t: 0, alt: 50, vs: 3, hs: 1, fuel: 50, touched: false, impactAt: -1, impactSpeed: 4.2, crashHud: method<(s: object) => PhaseHud>(LandingPhase, 'crashHud'), ...over,
  });
  const hud = (f: object) => method<() => PhaseHud>(LandingPhase, 'controlHud').call(f);

  it('descenso normal: figura, estado, lecturas y luz de contacto', () => {
    en();
    const h = hud(fake());
    expect(h.figure).toEqual({ value: '50.0 m', caption: 'above the surface' });
    expect(h.progress?.label).toBe('Descent progress');
    expect(h.detail).toBe('Powered descent · approach · touchdown in 26 s');
    expect(h.side).toMatchObject({ kind: 'readouts', note: 'Relief: LOLA 80 m/px · minor craters and ground texture are illustrative' });
    const items = (h.side as { items: { label: string; value: string }[] }).items;
    expect(items.map((i) => i.label)).toEqual(['Descent rate', 'Horizontal velocity', 'Propellant', 'Contact light', 'Landing site']);
    expect(items[3]!.value).toBe('Off');
    expect(items[2]!.value).toBe('50%');
    expect(hud(fake({ touched: true })).detail).toBe('Contact light · engine off · landing confirmed');
  });

  it('en español el HUD conserva el espacio duro y los textos de siempre', () => {
    const h = hud(fake());
    expect(h.detail).toBe('Descenso motorizado · aproximación · contacto en 26 s');
    expect((h.side as { items: { value: string }[] }).items[2]!.value).toBe(`50${String.fromCharCode(160)}%`);
  });

  it('el caso NO CAER: falla del motor e impacto', () => {
    en();
    const falling = hud(fake({ crash: true, t: 13 }));
    expect(falling.detail).toBe('ENGINE FAILURE · free fall under lunar gravity (1.62 m/s²)');
    expect(falling.figure.caption).toBe('free fall · engine off');
    const hit = hud(fake({ crash: true, t: 14, impactAt: 13 }));
    expect(hit.figure).toEqual({ value: 'IMPACT', caption: 'mission lost' });
    expect(hit.detail).toBe('Impact at 4.2 m/s · returning to orbit');
    const items = (hit.side as { items: { label: string; value: string }[] }).items;
    expect(items.find((i) => i.label === 'Main engine')?.value).toBe('Failed');
    expect(items.find((i) => i.label === 'Contact light')?.value).toBe('Impact');
  });

  it('onLangChange avisa a la consola de la cabina y al mundo; tras el impacto la consola ya no existe y se salta', () => {
    const f = { impactAt: -1, cabinConsole: { onLangChange: vi.fn() }, world: { relabel: vi.fn() } };
    method<() => void>(LandingPhase, 'onLangChange').call(f);
    expect(f.cabinConsole.onLangChange).toHaveBeenCalledOnce();
    expect(f.world.relabel).toHaveBeenCalledOnce();
    method<() => void>(LandingPhase, 'onLangChange').call({ ...f, impactAt: 3 });
    expect(f.cabinConsole.onLangChange).toHaveBeenCalledOnce();
  });
});

describe('consola de la cabina en inglés', () => {
  const SITE = {
    site: { name: 'Malapert A (IM-1 Odysseus)', lat: -80.13, lon: 1.44 }, sun: { elevation: 1.8, azimuth: 123.4, aboveHorizon: 0.6 }, earth: { aboveHorizon: -2.5 },
    hoursToSunset: 210, hoursToEarthset: 60, powerPct: 71, score: 72, status: 'marginal',
  } as unknown as SiteMetrics;

  function hudIn(labels: string[]): () => PhaseHud {
    return () => ({
      figure: { value: '1250.0 m', caption: labels[5]! }, progress: { value: 0.58, label: 'x', text: '58%' },
      side: { kind: 'readouts', items: [
        { label: labels[0]!, value: '18.0 m/s' }, { label: 'horizontal', value: '2.1 m/s' }, { label: labels[1]!, value: '74%' }, { label: labels[2]!, value: labels[3]! }, { label: labels[4]!, value: '−80.13°, 1.44° E', size: 'md' },
      ] },
    });
  }

  function host() {
    const h: ConsoleHost & { run: { mode: RunMode } } = {
      eyeHeight: 1.6, run: { mode: 'running' }, selected: SITE, data: { landingDate: new Date('2027-01-10T00:00:00Z') }, globalTargets: [],
      setPaused: () => undefined, stop: () => undefined, restart: () => undefined, exitVR: () => undefined,
    };
    return h;
  }

  beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
  afterEach(() => vi.useRealTimers());

  it('nace en español y, al cambiar el idioma, los cinco paneles se repintan (también el de control, que no es de los vivos)', () => {
    let cabin = new CabinConsole(host(), hudIn(['Velocidad de descenso', 'Combustible', 'Luz de contacto', 'Apagada', 'Zona de alunizaje', 'sobre la superficie']));
    cabin.mount(new THREE.Group());
    for (const p of Object.values(cabin.panels)) p.mesh.visible = true;
    cabin.update();
    expect(textsOf(cabin.panels.control.canvas)).toContain('Control de la misión');
    expect(textsOf(cabin.panels.mission.canvas)).toEqual(expect.arrayContaining(['Fase 4 de 5 · Alunizaje', 'Aterrizaje 10 ene 2027 · 00:00 UTC']));
    cabin.dispose();

    es();
    cabin = new CabinConsole(host(), hudIn(['Velocidad de descenso', 'Combustible', 'Luz de contacto', 'Apagada', 'Zona de alunizaje', 'sobre la superficie']));
    cabin.mount(new THREE.Group());
    for (const p of Object.values(cabin.panels)) p.mesh.visible = true;
    cabin.update();
    en();
    const hudEn = hudIn(['Descent rate', 'Propellant', 'Contact light', 'Off', 'Landing site', 'above the surface']);
    (cabin as unknown as { readHud: () => PhaseHud }).readHud = hudEn;
    cabin.onLangChange();
    cabin.update();
    expect(textsOf(cabin.panels.control.canvas)).toEqual(expect.arrayContaining(['Mission control', 'Pause', 'Stop', 'Exit VR']));
    expect(textsOf(cabin.panels.mission.canvas)).toEqual(expect.arrayContaining(['Phase 4 of 5 · Landing', 'Landing Jan 10, 2027 · 00:00 UTC', 'above the surface']));
    expect(textsOf(cabin.panels.telemetry.canvas)).toEqual(['Descent rate', '18.0 m/s', 'Propellant', '74%', 'Contact light', 'Off']);
    expect(textsOf(cabin.panels.phases.canvas)).toEqual(expect.arrayContaining(['Mission phases', 'Launch', 'Orbit and ranking', 'Site view', 'Landing', 'Transmission', 'Mission']));
    expect(textsOf(cabin.panels.site.canvas)).toEqual(expect.arrayContaining(['Site data', 'Sun · elevation / azimuth', 'Sunset in', '8.8 d', 'Earthset in', 'no link', 'Visible solar disk', '71%', 'Viability', '72/100 · Marginal']));
    cabin.dispose();
    cabin.onLangChange();
  });
});

/* ---------- transmisión ---------- */
describe('transmisión en inglés', () => {
  const fake = (over: Record<string, unknown> = {}) => ({
    world: { m: { site: { name: 'Malapert A', lat: -80.1, lon: 1.4, horizonSource: 'lola' }, earth: { elevation: 3, aboveHorizon: 1 }, sun: { elevation: 1 }, powerPct: 71, score: 72.4, hoursToEarthset: 50 }, sunVisible: 1 },
    sent: 0.5, relay: null, app: { goTo: () => undefined, data: null }, ...over,
  });

  it('elevación de la Tierra, paquetes y ficha del relevo', () => {
    en();
    expect(earthElevationText(8.5, 1.51, 'lola')).toBe('8.50° · visible');
    expect(earthElevationText(1.3, 1.3 - 6.99, 'lola')).toBe('1.30° · below the LOLA horizon (6.99°)');
    expect(earthElevationText(-2.4, -2.4, 'spherical')).toBe('−2.40° · below the geometric horizon');
    expect(earthElevationText(-2.4, -9, 'lola')).toBe('−2.40° · below the horizon');
    expect(packetsText(1)).toBe('4,096 / 4,096');
    expect(spriteTexts(buildRelayLabel())).toEqual(['Relay (illustrative position)']);
  });

  it('el panel de VR pinta en inglés', () => {
    en();
    const texts = paint(method<(p: Panel, g: CanvasRenderingContext2D) => void>(TransmitPhase, 'drawHud').bind(fake()), [1024, 900], 0.64);
    expect(texts).toEqual(expect.arrayContaining([
      'Landing successful!', '-80.10°S 1.40° · viability 72/100', 'Transmitting over the direct-to-Earth link…', 'Link', 'Direct · Earth at 3.0°', 'Signal delay',
      'Packets sent', '2,048 / 4,096', 'Solar power', '71% · Sun at 1.0°', 'Window remaining', '50 h of communication', 'Repeat mission', 'Another site',
    ].map((t) => (t.startsWith('-80') ? '80.10°S 1.40° · viability 72/100' : t))));
    const relay = paint(method<(p: Panel, g: CanvasRenderingContext2D) => void>(TransmitPhase, 'drawHud').bind(fake({ relay: new THREE.Vector3(), sent: 1 })), [1024, 900], 0.64);
    expect(relay).toEqual(expect.arrayContaining(['Telemetry received on Earth', 'Orbital relay (Earth below the horizon)']));
  });

  it('el HUD del DOM sale en inglés', () => {
    en();
    const hud = method<() => PhaseHud>(TransmitPhase, 'controlHud').call(fake({ sent: 1, relay: new THREE.Vector3() }));
    expect(hud.figure).toEqual({ value: '100%', caption: 'of telemetry sent', badge: { label: 'Landing successful', tone: 'ok' } });
    expect(hud.progress?.label).toBe('Telemetry sent');
    expect(hud.detail).toBe('Telemetry received on Earth');
    expect(hud.facts).toEqual([
      { label: 'Packets sent', value: '4,096 / 4,096' }, { label: 'Solar power', value: '71% · Sun at 1.0°' }, { label: 'Window remaining', value: '50 h of communication' },
    ]);
    expect(hud.side).toMatchObject({ kind: 'readouts', items: [{ label: 'Link', value: 'Orbital relay' }, { label: 'Earth elevation', value: '3.00° · visible' }] });
    expect(hud.secondary?.map((a) => a.label)).toEqual(['Repeat mission', 'Another site']);
    expect(hud.primary?.label).toBe('View report in Mission Control');
  });

  it('onLangChange invalida el panel, repinta el mundo y vuelve a hacer la ficha del relevo en el mismo sprite', () => {
    const relayLabel = buildRelayLabel();
    const oldMap = relayLabel.material.map as THREE.Texture;
    const disposed = vi.spyOn(oldMap, 'dispose');
    const f = { hud: { invalidate: vi.fn() }, world: { relabel: vi.fn() }, relayLabel };
    en();
    method<() => void>(TransmitPhase, 'onLangChange').call(f);
    expect(f.hud.invalidate).toHaveBeenCalledOnce();
    expect(f.world.relabel).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalled();
    expect(relayLabel.material.map).not.toBe(oldMap);
    method<() => void>(TransmitPhase, 'onLangChange').call({ ...f, relayLabel: null });
  });
});

export type { Internals };
