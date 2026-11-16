import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Marker } from '@touchdown/core';
import type { LunarApp } from '../engine/app';
import { Panel, RENDER, UI, renderStatusColor, statusBg, statusColor } from '../engine/panel';
import type { SiteMetrics } from '../mission/scoring';
import { NO_CAER_SITE_ID, type MissionData, type SiteInput } from '../mission/sites';
import { realMissionData } from '../mission/test-data';
import { palette } from '../ui/palette';
import { LaunchPhase } from './launch';
import { MarkerField } from './markers';
import { OrbitPhase } from './orbit';
import { PovPhase } from './pov';
import { TransmitPhase } from './transmit';

/**
 * Los paneles de fase (órbita, vista del sitio, despegue y transmisión) se dibujan sobre el papel de Panel.frame:
 * ningún literal claro sobre claro, ninguna pista invisible, ningún texto bajo 3:1. Un contexto espía registra
 * cada pintura con su estilo y el texto dibujado.
 */
interface Paint { op: 'fill' | 'fillRect' | 'stroke' | 'fillText'; style: string; text?: string; font?: string }

const spies = new Map<HTMLCanvasElement, Paint[]>();

function spyContext(log: Paint[]) {
  const state: Record<string | symbol, unknown> = { font: '10px x', textAlign: 'left', globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000' };
  const paint = (op: Paint['op'], key: 'fillStyle' | 'strokeStyle') => (text?: unknown) => {
    log.push({ op, style: String(state[key]), text: typeof text === 'string' ? text : undefined, font: String(state.font) });
  };
  return new Proxy(state, {
    get(t, k) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'clearRect') return () => { log.length = 0; };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      if (k === 'fill') return paint('fill', 'fillStyle');
      if (k === 'fillRect') return paint('fillRect', 'fillStyle');
      if (k === 'fillText') return paint('fillText', 'fillStyle');
      if (k === 'stroke') return paint('stroke', 'strokeStyle');
      return k in t ? t[k] : () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const PALETTE_VALUES = new Set<string>(Object.values(palette));
const PAPER = palette['bg-surface'];

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Afirma que un panel de fase es de papel y legible: todo estilo sale de la paleta (ni rgba claro sobre claro ni
 * hex sueltos) y cada texto contrasta 4,5:1 (3:1 si es grande) con el papel y con el fondo de su fila (el texto papel de un botón de tinta no aparece en estos paneles).
 */
function expectReadable(log: Paint[], name: string, accents: string[] = []) {
  expect(log.length, `${name}: no se dibujó nada`).toBeGreaterThan(0);
  for (const p of log) expect(PALETTE_VALUES.has(p.style), `${name}: ${p.op} ${p.text ?? ''} con ${p.style} fuera de la paleta`).toBe(true);
  let prev: Paint | undefined;
  let under: string = PAPER; // fondo de superficie de debajo: papel, o el pozo/seleccionado de una fila
  for (const p of log) {
    const onInk = p.style === PAPER && prev?.style === palette.label; // texto papel del botón primario de tinta
    prev = p;
    if (p.op === 'fill' && ([PAPER, palette['bg-raised'], palette['bg-selected']] as string[]).includes(p.style)) under = p.style;
    if (p.op !== 'fillText' || !p.style.startsWith('#') || onInk) continue;
    // AA: 4,5:1 para texto normal; 3:1 solo para texto grande (>=24 px, o >=18,66 px en negrita 700).
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(p.font ?? '')?.[1] ?? 0), weight = Number(/\b(\d{3})\b/.exec(p.font ?? '')?.[1] ?? 400);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    for (const bg of new Set([PAPER, under])) expect(contrast(p.style, bg), `${name}: «${p.text}» ${p.style} ${p.font} sobre ${bg} (pide ${need}:1)`).toBeGreaterThanOrEqual(need);
  }
  const dark = log.filter((p) => (p.op === 'fill' || p.op === 'fillRect') && p.style.startsWith('#') && luminance(p.style) < 0.2);
  for (const p of dark) expect([palette.label, palette['label-2'], ...accents], `${name}: relleno oscuro que no es tinta`).toContain(p.style);
}

beforeEach(() => {
  spies.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const log: Paint[] = [];
    spies.set(this, log);
    return spyContext(log);
  } as never);
});
afterEach(() => { vi.restoreAllMocks(); });

const drawn = (p: Panel) => { p.invalidate(); p.update(); return spies.get(p.canvas)!; };

describe('colores de render del espacio 3D', () => {
  it('son tonos claros solo para el render: contrastan con el espacio negro y no reemplazan a los de papel', () => {
    for (const [key, value] of Object.entries(RENDER)) expect(contrast(value, '#000000'), `RENDER.${key}`).toBeGreaterThanOrEqual(7);
    expect(RENDER.rock).not.toBe(palette['terrain-line']);
  });

  it('los colores de estado de los paneles contrastan 3:1 con el papel y su fondo tenue es de la paleta', () => {
    for (const status of ['viable', 'marginal', 'not_viable'] as const) {
      expect(contrast(statusColor(status), PAPER), status).toBeGreaterThanOrEqual(3);
      expect(PALETTE_VALUES.has(statusBg(status)), `fondo ${status}`).toBe(true);
      expect(contrast(UI.text, statusBg(status)), `tinta sobre fondo ${status}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('etiquetas de riesgo del sitio', () => {
  const marker = (kind: Marker['kind']): Marker => ({ id: kind, site_id: 's', kind, x_m: 0, y_m: 0, note: '' }) as Marker;

  it.each(['rock', 'slope', 'shadow', 'other'] as const)('la etiqueta «%s» se lee 3:1 sobre su chip de papel', (kind) => {
    const field = new MarkerField(new THREE.Scene(), 's', () => 0);
    field.sync([marker(kind)]);
    const log = [...spies.values()].find((l) => l.some((p) => p.op === 'fillText'))!;
    // El filete de color del borde inferior de la ficha (paintPaperChip) es el único relleno oscuro permitido y debe dar 3:1 con el papel.
    const accent = log.filter((p) => p.op === 'fill' && p.style !== PAPER).at(-1)!.style;
    expect(contrast(accent, PAPER), `filete ${kind}`).toBeGreaterThanOrEqual(3);
    expectReadable(log, `marcador ${kind}`, [accent]);
    field.dispose();
  });
});

const REGIONS: Record<string, SiteInput['region']> = {
  'apollo-11': 'equatorial', 'apollo-17': 'equatorial', 'chandrayaan-3': 'mid-latitude', 'change-4': 'far-side',
};

function missionWithDemo(): MissionData {
  const data = realMissionData();
  const sites: SiteInput[] = data.sites.map((s) => ({ ...s, region: REGIONS[s.id] ?? 'south-pole' }));
  const src = sites.find((s) => s.id === 'malapert-massif')!;
  sites.push({ ...src, id: NO_CAER_SITE_ID, name: 'NO CAER', note: 'Caso de demostración, no es un sitio real.', crash: true });
  return { ...data, sites };
}

function fakeApp() {
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, 1, 500_000);
  return {
    flags: new Set<string>(['orbit-done']), data: missionWithDemo(), ranking: [] as SiteMetrics[], selected: null as SiteMetrics | null,
    isXR: false, isHost: true, camera, rig: new THREE.Group(), renderer: { domElement: { clientWidth: 1440, clientHeight: 900 } },
    moonTex: { general: new THREE.Texture(), north: null, south: null },
    room: { status: 'closed', room: 'test', setListener: vi.fn(), send: vi.fn() },
    audio: { play: vi.fn(), loop: vi.fn(() => ({ stop: vi.fn() })) }, narrator: { say: vi.fn() },
    setView: vi.fn(), goTo: vi.fn(), applyMarkerEvent: vi.fn(),
  } as unknown as LunarApp & { ranking: SiteMetrics[]; selected: SiteMetrics | null; room: { status: string } };
}

type OrbitInternals = { list: Panel; detail: Panel; maxDelayDays: number };

describe('órbita: ranking y detalle', () => {
  it('la lista (con fila resaltada, retrasos deshabilitados y sin conexión) es legible sobre papel', () => {
    const app = fakeApp();
    const phase = new OrbitPhase(app);
    for (let i = 0; i < 30; i++) phase.update(0.5);
    const inner = phase as unknown as OrbitInternals;
    inner.maxDelayDays = 3;
    app.selected = app.ranking.find((m) => m.site.id === 'malapert-a')!;
    inner.list.hover = `row-${app.ranking[3]!.site.id}`;
    const log = drawn(inner.list);
    expectReadable(log, 'orbit lista');
    // Un cuadro de rango por estado: relleno tenue de la paleta; el color de estado sólido bajo la tinta daba 2.8:1.
    let prev: Paint | undefined;
    for (const p of log) {
      if (p.op === 'fillText' && prev?.op === 'fill') expect([palette.viable, palette.marginal, palette.bad], `«${p.text}» sobre estado sólido`).not.toContain(prev.style);
      prev = p;
    }
    expect(log.some((p) => p.op === 'fill' && [palette['viable-bg'], palette['marginal-bg'], palette['bad-bg']].includes(p.style as never))).toBe(true);
    expect(log.filter((p) => p.op === 'fillText' && /^\+\d+ d$/.test(p.text ?? '')).length, 'los retrasos deshabilitados se escriben').toBeGreaterThan(0);
  });

  it('mientras calcula, la pista de la barra de progreso se ve (línea fuerte de la paleta)', () => {
    const app = fakeApp();
    app.flags.clear();
    const phase = new OrbitPhase(app);
    phase.update(5);
    const log = drawn((phase as unknown as OrbitInternals).list);
    expectReadable(log, 'orbit calculando');
    expect(log.some((p) => p.op === 'fill' && p.style === palette['line-strong'])).toBe(true);
  });

  it('el detalle con un sitio elegido es legible: pistas de barras visibles', () => {
    const app = fakeApp();
    const phase = new OrbitPhase(app);
    for (let i = 0; i < 30; i++) phase.update(0.5);
    app.selected = app.ranking.find((m) => m.site.id === 'malapert-a')!;
    const log = drawn((phase as unknown as OrbitInternals).detail);
    expectReadable(log, 'orbit detalle');
    expect(log.filter((p) => p.op === 'fill' && p.style === palette['line-strong']).length).toBeGreaterThanOrEqual(4);
  });

  it('el chip de rango de los pines es de papel con tinta y el anillo de estado', () => {
    const app = fakeApp();
    new OrbitPhase(app);
    const canvases = [...spies.entries()].filter(([c]) => c.width === 128 && c.height === 72);
    expect(canvases.length, 'un chip por pin').toBeGreaterThan(0);
    for (const [, log] of canvases) {
      const accent = log.filter((p) => p.op === 'fill').at(-1)!.style;
      expect([palette.viable, palette.marginal, palette.bad], 'filete de estado').toContain(accent);
      expectReadable(log, 'chip de rango', [accent]);
      expect(log.find((p) => p.op === 'fill')!.style).toBe(PAPER);
      expect(log.find((p) => p.op === 'fillText')!.style).toBe(palette.label);
      expect(log.filter((p) => p.op === 'stroke').at(-1)!.style).toBe(palette['control-border']);
    }
  });

  it('con retraso aplicado, con aviso de rango y con el caso NO CAER, el texto de la lista es legible en la fila elegida y en la de hover', () => {
    const app = fakeApp();
    const phase = new OrbitPhase(app);
    for (let i = 0; i < 30; i++) phase.update(0.5);
    const inner = phase as unknown as OrbitInternals & { applyDelay(days: number): void; delayDays: number; rangeWarning: string | null };
    inner.maxDelayDays = 3;
    inner.applyDelay(2);
    expect(inner.delayDays, 'el retraso se aplicó').toBe(2);
    for (let i = 0; i < 5; i++) phase.update(0.5);
    app.selected = app.ranking[1]!;
    inner.list.hover = `row-${app.ranking[2]!.site.id}`;
    let log = drawn(inner.list);
    expectReadable(log, 'orbit lista con retraso');
    // Los deltas ↑/↓ van en tinta: el color de estado no da 4,5:1 a 22 px (la flecha ya marca el sentido).
    const deltas = log.filter((p) => p.op === 'fillText' && /^(↑ \+|↓ )\d+$|^± 0$/.test(p.text ?? ''));
    expect(deltas.length, 'deltas de puntaje dibujados').toBeGreaterThan(0);
    for (const d of deltas) expect(d.style, `delta «${d.text}»`).toBe(palette.label);

    inner.applyDelay(99);
    expect(inner.rangeWarning, 'aviso de rango').toMatch(/fuera de rango/);
    log = drawn(inner.list);
    expectReadable(log, 'orbit lista con aviso de rango');
    const warn = log.find((p) => p.op === 'fillText' && /fuera de rango/.test(p.text ?? ''))!;
    expect(warn.style, 'el aviso va en tinta, con un punto de estado').toBe(palette.label);
    expect(log.some((p) => p.op === 'fill' && p.style === palette.marginal), 'punto de estado del aviso').toBe(true);
  });

  it('la nota del caso NO CAER va en tinta con su punto de estado', () => {
    const app = fakeApp();
    const phase = new OrbitPhase(app);
    for (let i = 0; i < 60; i++) phase.update(0.5);
    app.selected = app.ranking.find((m) => m.site.id === NO_CAER_SITE_ID) ?? app.selected;
    const log = drawn((phase as unknown as OrbitInternals).list);
    expectReadable(log, 'orbit lista NO CAER');
    const note = log.find((p) => p.op === 'fillText' && /Caso de demostración/.test(p.text ?? ''));
    expect(note, 'la nota del caso se dibuja').toBeTruthy();
    expect(note!.style).toBe(palette.label);
  });

  it('cabezas y anillos de los pines usan tonos claros de render, no el color de papel', () => {
    const app = fakeApp();
    const phase = new OrbitPhase(app);
    const pins = (phase as unknown as { markers: { m: SiteMetrics; head: THREE.Mesh; ring: THREE.Mesh; beam: THREE.Mesh }[] }).markers;
    expect(pins.length).toBeGreaterThan(0);
    // update() repinta la cabeza en cada fotograma: se prueba con varios fotogramas, con un pin elegido y los demás sin elegir.
    app.selected = pins[0]!.m;
    for (let i = 0; i < 20; i++) phase.update(0.1);
    const selected = pins[0]!, others = pins.slice(1);
    expect(`#${(selected.head.material as THREE.MeshBasicMaterial).color.getHexString()}`, 'cabeza del pin elegido (blanca)').toBe('#ffffff');
    for (const pin of others) {
      const hex = `#${(pin.head.material as THREE.MeshBasicMaterial).color.getHexString()}`;
      expect(hex, `cabeza sin elegir de ${pin.m.site.id}`).toBe(renderStatusColor(pin.m.status).toLowerCase());
    }
    app.selected = null;
    for (let i = 0; i < 5; i++) phase.update(0.1);
    const render = new Set(Object.values(RENDER).map((c) => c.toLowerCase()));
    const paper = new Set([palette.viable, palette.marginal, palette.bad].map((c) => c.toLowerCase()));
    for (const pin of pins) {
      for (const part of [pin.head, pin.ring, pin.beam]) {
        const hex = `#${(part.material as THREE.MeshBasicMaterial).color.getHexString()}`;
        expect(render.has(hex), `pin ${hex}`).toBe(true);
        expect(paper.has(hex), `pin ${hex}`).toBe(false);
      }
    }
  });
});

/** Datos mínimos de un sitio con el Sol cruzando el horizonte para que el sombreado «iluminado» se dibuje. */
function povFake() {
  const sky = (elevation: number, aboveHorizon: number) => ({ elevation, aboveHorizon, azimuth: 120, local: new THREE.Vector3(0, 0, -1) });
  const m = {
    site: { name: 'Malapert A', lat: -80.1, lon: 1.4, hasTerrain: true, horizonSource: 'lola' },
    sun: sky(1.2, 0.4), earth: sky(3, 1), hoursToSunset: 200, hoursToEarthset: 50, powerPct: 71, tempC: -20, score: 72, status: 'marginal',
    illumPct: 80, earthPct: 90, breakdown: { ops: 0.7, energy: 0.8, comms: 0.8, continuity: 0.6 }, longestDarkH: 30, rank: 2,
  };
  const series = Array.from({ length: 169 }, (_, i) => ({ sun: Math.sin(i / 10) * 3, earth: 2 + Math.cos(i / 12) * 2, hSun: 0.5, hEarth: 0.2 }));
  return { m, series, app: { data: { landingDate: new Date('2027-01-10T00:00:00Z') }, isHost: true }, world: { roughness: null } };
}

describe('vista del sitio: panel de datos', () => {
  it('la curva del horizonte, la retícula, el sombreado y las leyendas se ven sobre papel', () => {
    const fake = povFake();
    const panel = new Panel(1024, 1240, 0.66, () => undefined);
    const drawInfo = (PovPhase.prototype as unknown as { drawInfo(p: Panel, g: CanvasRenderingContext2D): void }).drawInfo;
    panel.ctx.clearRect(0, 0, 1, 1);
    drawInfo.call(fake, panel, panel.ctx);
    const log = spies.get(panel.canvas)!;
    expectReadable(log, 'pov info');
    const strokes = log.filter((p) => p.op === 'stroke').map((p) => p.style);
    expect(strokes).toContain(palette['label-2']); // curva del horizonte local
    expect(log.some((p) => p.op === 'fillRect' && p.style === palette['marginal-bg']), 'sombreado de «iluminado»').toBe(true);
    const legend = log.find((p) => p.op === 'fillText' && p.text === 'iluminado')!;
    expect(contrast(legend.style, PAPER)).toBeGreaterThanOrEqual(4.5);
  });

  it('la nota de relieve ilustrativo (sitio sin terreno real) va en tinta con su punto de estado', () => {
    const fake = povFake();
    fake.m.site.hasTerrain = false;
    const panel = new Panel(1024, 1240, 0.66, () => undefined);
    panel.ctx.clearRect(0, 0, 1, 1);
    (PovPhase.prototype as unknown as { drawInfo(p: Panel, g: CanvasRenderingContext2D): void }).drawInfo.call(fake, panel, panel.ctx);
    const log = spies.get(panel.canvas)!;
    expectReadable(log, 'pov info sin terreno');
    const note = log.find((p) => p.op === 'fillText' && /Relieve cercano ilustrativo/.test(p.text ?? ''))!;
    expect(note, 'la nota se dibuja').toBeTruthy();
    expect(note.style).toBe(palette.label);
    expect(log.some((p) => p.op === 'fill' && p.style === palette.marginal), 'punto de estado').toBe(true);
  });
});

describe('despegue y transmisión: pistas de progreso', () => {
  it.each([[false], [true]])('el HUD de despegue (iniciado=%s) dibuja la pista con línea fuerte', (started) => {
    const fake = { started, status: 'Cuenta atrás', shownPct: 0.4, tele: { alt: '1 km', vel: '2 m/s', dist: '3 km' }, beginCountdown: () => undefined };
    const panel = new Panel(1400, 360, 1.15, () => undefined);
    (LaunchPhase.prototype as unknown as { drawHud(p: Panel, g: CanvasRenderingContext2D): void }).drawHud.call(fake, panel, panel.ctx);
    const log = spies.get(panel.canvas)!;
    expectReadable(log, `launch ${started}`);
    expect(log.some((p) => p.op === 'fill' && p.style === palette['line-strong'])).toBe(true);
  });

  it('el HUD de transmisión dibuja la pista, escribe la viabilidad como N/100 y es legible', () => {
    const fake = {
      world: { m: { site: { name: 'Malapert A', lat: -80.1, lon: 1.4 }, earth: { elevation: 3, aboveHorizon: 1 }, sun: { elevation: 1 }, powerPct: 71, score: 72.4, hoursToEarthset: 50 }, sunVisible: 1 },
      sent: 0.5, relay: null, app: { goTo: () => undefined },
    };
    const panel = new Panel(1024, 900, 0.64, () => undefined);
    (TransmitPhase.prototype as unknown as { drawHud(p: Panel, g: CanvasRenderingContext2D): void }).drawHud.call(fake, panel, panel.ctx);
    const log = spies.get(panel.canvas)!;
    expectReadable(log, 'transmit');
    expect(log.some((p) => p.op === 'fill' && p.style === palette['line-strong'])).toBe(true);
    const score = log.find((p) => p.op === 'fillText' && /viabilidad/.test(p.text ?? ''))!;
    expect(score.text).toMatch(/viabilidad 72\/100$/);
  });
});
