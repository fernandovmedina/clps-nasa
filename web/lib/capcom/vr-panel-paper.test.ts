import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '../engine/app';
import { palette } from '../ui/palette';
import type { CapcomController, CapcomSnapshot } from './controller';

vi.mock('./donkey', () => ({
  donkeyMood: () => 'idle',
  DonkeyGuide: class {
    group = { position: { set: vi.fn() }, rotation: { y: 0 } };
    setMood = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    load() { return this; }
  },
}));

const { mountCapcomVrPanel } = await import('./vr-panel');

interface Paint { op: string; style: string; alpha: number }
let log: Paint[] = [];
const VALUES = new Set<string>(Object.values(palette));

function spyContext() {
  const state: Record<string | symbol, unknown> = { font: '10px x', textAlign: 'left', globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000' };
  const paint = (op: string, key: string) => () => { log.push({ op, style: String(state[key]), alpha: Number(state.globalAlpha) }); };
  return new Proxy(state, {
    get(t, k) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'clearRect') return () => { log = []; };
      if (k === 'fill') return paint('fill', 'fillStyle');
      if (k === 'fillText') return paint('fillText', 'fillStyle');
      if (k === 'stroke') return paint('stroke', 'strokeStyle');
      return k in t ? t[k] : () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

beforeEach(() => { log = []; vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => spyContext()) as never); });
afterEach(() => { vi.restoreAllMocks(); });

const BASE: CapcomSnapshot = { state: 'listening', talking: false, question: '', answer: 'Vamos a 169 km.', answerFinal: true, message: null, mic: 'granted' };

function draw(snap: CapcomSnapshot) {
  const controller = { getSnapshot: () => snap, subscribe: () => () => undefined, press: vi.fn(), release: vi.fn() } as unknown as CapcomController;
  const app = {
    eyeHeight: 1.6, phase: null, globalTargets: [] as unknown[], rig: { add: vi.fn() },
    input: { onAButton: () => () => undefined },
  } as unknown as LunarApp;
  const unmount = mountCapcomVrPanel(app, controller);
  const mesh = (app.rig.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as { onBeforeRender: () => void };
  mesh.onBeforeRender();
  const out = [...log];
  unmount();
  return out;
}

describe('panel CAPCOM de VR', () => {
  it.each([
    ['listo', BASE],
    ['escuchando', { ...BASE, talking: true }],
    ['sin conexión', { ...BASE, state: 'error', message: 'Sin red', mic: 'granted' }],
    ['sin micrófono', { ...BASE, state: 'disconnected', mic: 'denied' }],
    ['no disponible', { ...BASE, state: 'unavailable' }],
  ] as const)('%s: fondo papel opaco y todo color de la paleta', (_name, snap) => {
    const out = draw(snap as CapcomSnapshot);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(VALUES.has(p.style), `${p.op} con ${p.style}`).toBe(true);
    const first = out.find((p) => p.op === 'fill')!;
    expect(first.style).toBe(palette['bg-surface']);
    expect(first.alpha).toBe(1);
    let under = '';
    for (const p of out) {
      if (p.op === 'fill') under = p.style;
      if (p.op === 'fillText' && p.style === palette['bg-surface']) expect(under, 'texto papel sobre papel').not.toBe(palette['bg-surface']);
    }
    // Todo texto es tinta, tinta 2 o papel sobre tinta: el tono del estado va en un punto, no en el texto (AA).
    for (const p of out.filter((p) => p.op === 'fillText')) expect([palette.label, palette['label-2'], palette['bg-surface']]).toContain(p.style);
    for (const p of out.filter((p) => p.op === 'fill' && p.style.startsWith('#'))) {
      expect([palette['bg-surface'], palette.label, palette.accent, palette['bg-selected'], palette.viable, palette.marginal, palette.bad, palette['control-border']]).toContain(p.style);
    }
  });

  it('Soltar (mientras habla) es el botón primario en tinta con texto papel', () => {
    const out = draw({ ...BASE, talking: true });
    const fills = out.filter((p) => p.op === 'fill').map((p) => p.style);
    expect(fills[0]).toBe(palette['bg-surface']);
    expect(fills.at(-1)).toBe(palette.label);
    expect(out.filter((p) => p.op === 'fillText').at(-1)?.style).toBe(palette['bg-surface']);
  });

  it.each([
    ['escuchando', { ...BASE, talking: true }, palette.viable],
    ['sin micrófono', { ...BASE, state: 'disconnected', mic: 'denied' }, palette.marginal],
    ['sin conexión', { ...BASE, state: 'error', message: 'x' }, palette.bad],
  ] as const)('marca el estado «%s» con un punto de la paleta', (_n, snap, color) => {
    const out = draw(snap as CapcomSnapshot);
    expect(out.filter((p) => p.op === 'fill').map((p) => p.style)).toContain(color);
  });

  it('Hablar es un botón secundario de papel con borde fino', () => {
    const out = draw(BASE);
    expect(out.filter((p) => p.op === 'stroke').at(-1)?.style).toBe(palette['control-border']);
    expect(out.filter((p) => p.op === 'fillText').at(-1)?.style).toBe(palette.label);
  });
});
