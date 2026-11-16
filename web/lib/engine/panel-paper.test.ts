import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { palette } from '../ui/palette';
import type { PhaseHud } from './hud';
import type { LunarApp } from './app';
import type { SiteMetrics } from '../mission/scoring';
import { Panel, UI, statusColor, textLabel } from './panel';
import { createRunPanel } from './run-panel';
import { CONSOLE_SLOTS, CabinConsole, type ConsoleHost, type ConsoleId } from '../phases/landing-console';

/** Una operación de pintura con el estilo vigente en ese instante. */
interface Paint { op: 'fill' | 'fillRect' | 'stroke' | 'fillText'; style: string; alpha: number }

const spies = new Map<HTMLCanvasElement, Paint[]>();

function spyContext(log: Paint[]) {
  const state: Record<string | symbol, unknown> = { font: '10px x', textAlign: 'left', globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000' };
  const paint = (op: Paint['op'], key: 'fillStyle' | 'strokeStyle') => () => { log.push({ op, style: String(state[key]), alpha: Number(state.globalAlpha) }); };
  return new Proxy(state, {
    get(t, k) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'clearRect') return () => { log.length = 0; };
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
const paletteName = (value: string) => Object.entries(palette).find(([, v]) => v === value)?.[0] ?? `FUERA DE LA PALETA: ${value}`;

/** Luminancia relativa de un #rrggbb de la paleta. */
function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Afirma que un panel ya dibujado es de papel: todo color sale de la paleta, el primer relleno (el fondo) es el
 * papel opaco y ningún texto se pinta del color de su fondo. `allowInkFill` admite el relleno de tinta del botón
 * primario y de los iconos, que son tinta sobre papel y no un fondo oscuro.
 */
function expectPaper(log: Paint[], name: string) {
  expect(log.length, `${name}: no se dibujó nada`).toBeGreaterThan(0);
  for (const p of log) expect(PALETTE_VALUES.has(p.style), `${name}: ${p.op} con ${paletteName(p.style)}`).toBe(true);
  const fills = log.filter((p) => p.op === 'fill' || p.op === 'fillRect');
  expect(fills[0].style, `${name}: fondo`).toBe(palette['bg-surface']);
  expect(fills[0].alpha, `${name}: el fondo es opaco`).toBe(1);
  expect(luminance(fills[0].style), `${name}: fondo claro`).toBeGreaterThan(0.8);
  // El texto papel solo va sobre un relleno de tinta (botón primario), nunca sobre el papel.
  let under = '';
  for (const p of log) {
    if (p.op === 'fill' || p.op === 'fillRect') under = p.style;
    if (p.op === 'fillText' && p.style === palette['bg-surface']) expect(under, `${name}: texto papel sobre papel`).not.toBe(palette['bg-surface']);
  }
  const bg = log.filter((p) => p.op === 'fill' || p.op === 'fillRect').map((p) => p.style);
  for (const style of bg.filter((st) => st.startsWith('rgba'))) expect(style, `${name}: solo la línea fina puede ser translúcida`).toBe(palette.line);
  for (const style of bg) {
    const dark = style.startsWith('#') && luminance(style) < 0.2;
    if (dark) expect([palette.label, palette['label-2']], `${name}: relleno oscuro que no es tinta`).toContain(style);
  }
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

const logOf = (p: Panel) => spies.get(p.canvas)!;
const drawn = (p: Panel) => { p.invalidate(); p.update(); return logOf(p); };

describe('UI de los paneles de canvas', () => {
  it('toma todos sus colores de la paleta única', () => {
    for (const [key, value] of Object.entries(UI)) {
      if (key === 'font' || key === 'mono') continue;
      expect(PALETTE_VALUES.has(value), `UI.${key}`).toBe(true);
    }
    expect(UI.bg).toBe('#faf9f5');
    expect(UI.text).toBe('#141413');
    expect(UI.accent).toBe(palette.accent);
    expect(UI.onAccent).toBe('#141413');
  });

  it('usa Inter y los colores de estado de la paleta', () => {
    expect(UI.font).toContain('Inter');
    expect(statusColor('viable')).toBe(palette.viable);
    expect(statusColor('marginal')).toBe(palette.marginal);
    expect(statusColor('not_viable')).toBe(palette.bad);
  });
});

describe('Panel base', () => {
  const draw = (style: 'cta' | 'primary' | 'ghost' | undefined, hover = false) => {
    const panel = new Panel(400, 200, 0.5, (p, g) => {
      p.frame(g);
      p.button(g, 'b', 40, 60, 320, 80, 'Acción', () => undefined, style);
    });
    if (hover) panel.hover = 'b';
    return drawn(panel);
  };

  it.each([['cta'], ['primary'], ['ghost'], [undefined]] as const)('pinta de papel el marco y el botón (%s)', (style) => {
    expectPaper(draw(style), `botón ${style}`);
    expectPaper(draw(style, true), `botón ${style} con foco`);
  });

  it('el CTA es arcilla con texto tinta, el primario tinta con texto papel y el secundario papel con borde fino', () => {
    const cta = draw('cta'), primary = draw('primary'), ghost = draw('ghost');
    expect(cta.filter((p) => p.op === 'fill').map((p) => p.style)).toEqual([palette['bg-surface'], palette.accent]);
    expect(cta.at(-1)).toMatchObject({ op: 'fillText', style: palette['on-accent'] });
    expect(primary.filter((p) => p.op === 'fill').map((p) => p.style)).toEqual([palette['bg-surface'], palette.label]);
    expect(primary.at(-1)).toMatchObject({ op: 'fillText', style: palette['bg-surface'] });
    expect(ghost.filter((p) => p.op === 'fill').map((p) => p.style)).toEqual([palette['bg-surface'], palette['bg-surface']]);
    expect(ghost.filter((p) => p.op === 'stroke').at(-1)?.style).toBe(palette['control-border']);
    expect(ghost.at(-1)).toMatchObject({ op: 'fillText', style: palette.label });
  });

  it('la etiqueta flotante es de papel', () => {
    const labelLog: Paint[] = [];
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation((() => spyContext(labelLog)) as never);
    textLabel([{ text: 'Malapert', size: 40 }, { text: '72/100', size: 30, color: UI.dim }], 0.3);
    expectPaper(labelLog, 'textLabel');
  });
});

describe('panel de pausa de VR', () => {
  const app = (over: { stopped?: boolean; paused?: boolean; awaitingStart?: boolean }) => ({
    run: { stopped: !!over.stopped, paused: !!over.paused },
    awaitingStart: !!over.awaitingStart,
    eyeHeight: 1.6,
    restart: () => undefined, setPaused: () => undefined, stop: () => undefined,
  }) as unknown as LunarApp;

  it.each([
    ['en marcha', {}],
    ['en pausa', { paused: true }],
    ['detenida', { stopped: true }],
    ['esperando el inicio (botón Pausar inactivo)', { awaitingStart: true }],
  ] as const)('%s: de papel', (name, over) => {
    const panel = createRunPanel(app(over));
    expectPaper(drawn(panel), `run-panel ${name}`);
  });
});

describe('consola del alunizaje', () => {
  const SITE = {
    site: { name: 'Malapert A', lat: -80.13, lon: 1.44 },
    sun: { elevation: 1.8, azimuth: 123.4, aboveHorizon: 0.6 },
    earth: { aboveHorizon: 2.5 },
    hoursToSunset: 210, hoursToEarthset: 60, powerPct: 71, score: 72, status: 'marginal',
  } as unknown as SiteMetrics;
  const hud = (): PhaseHud => ({
    figure: { value: '1250.0 m', caption: 'sobre la superficie' },
    progress: { value: 0.58, label: 'Avance', text: '58 %' },
    side: { kind: 'readouts', items: [{ label: 'Velocidad de descenso', value: '18 m/s' }, { label: 'Combustible', value: '74 %' }, { label: 'Luz de contacto', value: 'Apagada' }] },
  });
  const open = (mode: 'running' | 'paused' | 'stopped') => {
    const host: ConsoleHost = {
      eyeHeight: 1.6, run: { mode }, selected: SITE, data: { landingDate: new Date('2027-01-10T00:00:00Z') }, globalTargets: [],
      setPaused: () => undefined, stop: () => undefined, restart: () => undefined, exitVR: () => undefined,
    };
    const cabin = new CabinConsole(host, hud);
    cabin.mount(new THREE.Group());
    return cabin;
  };

  it.each(['running', 'paused', 'stopped'] as const)('los cinco paneles son de papel (%s)', (mode) => {
    const cabin = open(mode);
    for (const id of Object.keys(CONSOLE_SLOTS) as ConsoleId[]) expectPaper(drawn(cabin.panels[id]), `${id} (${mode})`);
    cabin.dispose();
  });

  it('el CTA del panel de control es arcilla con texto tinta al reanudar o reiniciar', () => {
    for (const mode of ['paused', 'stopped'] as const) {
      const cabin = open(mode);
      const log = drawn(cabin.panels.control);
      expect(log.some((p) => p.op === 'fill' && p.style === palette.accent), mode).toBe(true);
      cabin.dispose();
    }
  });

  it('en marcha no hay CTA: Pausar, Detener y Salir son secundarios de papel con borde fino', () => {
    const cabin = open('running');
    const log = drawn(cabin.panels.control);
    expect(log.some((p) => p.style === palette.accent)).toBe(false);
    expect(log.filter((p) => p.op === 'stroke').some((p) => p.style === palette['control-border'])).toBe(true);
    cabin.dispose();
  });

  it('rotula «Disco solar visible» y escribe el puntaje como N/100', () => {
    const labels: string[] = [];
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation((() => {
      const ctx = spyContext([]);
      return new Proxy(ctx, { get(t, k) { return k === 'fillText' ? (s: string) => labels.push(s) : (t as never)[k]; } });
    }) as never);
    const fresh = open('running');
    drawn(fresh.panels.site);
    expect(labels).toContain('Disco solar visible');
    expect(labels).not.toContain('Potencia solar');
    expect(labels).toContain('72/100 · Marginal');
    expect(labels.some((l) => /\d\s?%/.test(l) && /Marginal|Viable/.test(l))).toBe(false);
    fresh.dispose();
  });
});
