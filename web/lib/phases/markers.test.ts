import * as THREE from 'three';
import type { Marker } from '@touchdown/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { palette } from '../ui/palette';
import { MarkerField, paperLabel, paperStatusColor } from './markers';

/** Contexto 2D que anota cada color y cada texto, un registro por lienzo: jsdom no trae canvas. */
interface Log { fills: string[]; strokes: string[]; texts: { text: string; color: string }[]; ctx?: unknown }
const logs = new Map<unknown, Log>();
function installRecorder() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (logs.has(this)) return logs.get(this)!.ctx as never;
    const log: Log = { fills: [], strokes: [], texts: [] };
    let fill = '';
    log.ctx = new Proxy({}, {
      get: (_t, key) => (key === 'measureText' ? (s: string) => ({ width: s.length * 14 })
        : key === 'fillText' ? (text: string) => log.texts.push({ text, color: fill })
        : key === 'fillStyle' ? fill : () => undefined),
      set: (_t, key, value) => {
        if (key === 'fillStyle') { if (typeof value === 'string') { fill = value; log.fills.push(fill); } }
        if (key === 'strokeStyle' && typeof value === 'string') log.strokes.push(value);
        return true;
      },
    });
    logs.set(this, log);
    return log.ctx as never;
  });
}
const logOf = (sprite: THREE.Sprite) => logs.get((sprite.material.map as THREE.CanvasTexture).image)!;
const imageOf = (sprite: THREE.Sprite) => (sprite.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
const DARK = /^rgba?\(\s*20\s*,\s*20\s*,\s*19/;

beforeEach(installRecorder);
afterEach(() => { vi.restoreAllMocks(); logs.clear(); });

describe('paperLabel: ficha de papel dentro del 3D', () => {
  const sprite = () => paperLabel([{ text: '#1 · 94/100', size: 52, weight: 800 }, { text: 'Shackleton', size: 34 }, { text: 'nota', size: 26, muted: true }], 46, { accent: palette.viable });

  it('rellena con el papel opaco y borde fino de control; ninguna ficha oscura', () => {
    const log = logOf(sprite());
    expect(log.fills[0]).toBe(palette['bg-surface']);
    expect(log.strokes[0]).toBe(palette['control-border']);
    expect(log.fills.filter((f) => DARK.test(f))).toEqual([]);
  });

  it('el texto va en tinta y tinta 2, nunca en el color de estado; el estado solo es un filete', () => {
    const log = logOf(sprite());
    expect(log.texts.map((t) => t.color)).toEqual([palette.label, palette.label, palette['label-2']]);
    expect(log.fills).toContain(palette.viable);
  });

  it('el lienzo se mide al texto: un texto corto no arrastra los 512 px fijos y uno largo no se corta', () => {
    const short = paperLabel([{ text: 'SOL', size: 52 }], 170);
    const long = paperLabel([{ text: 'Tierra tapada por el relieve · 5.7° y algo más largo todavía', size: 52 }], 170);
    expect(imageOf(short).width).toBeLessThan(512);
    expect(imageOf(long).width).toBeGreaterThan(512);
    expect(imageOf(long).width).toBeGreaterThanOrEqual(61 * 14);
  });

  it('conserva la escala del texto: los metros por pixel salen del ancho pedido sobre 512 px', () => {
    const s = paperLabel([{ text: 'SOL', size: 52 }], 170);
    expect(s.scale.x / imageOf(s).width).toBeCloseTo(170 / 512, 6);
  });

  it('el texto cumple AA (4.5:1) sobre el papel y el borde 3:1', () => {
    expect(contrast(palette.label, palette['bg-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette['label-2'], palette['bg-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette['control-border'], palette['bg-surface'])).toBeGreaterThanOrEqual(3);
  });

  it('los acentos de estado salen de la paleta', () => {
    expect(paperStatusColor('viable')).toBe(palette.viable);
    expect(paperStatusColor('marginal')).toBe(palette.marginal);
    expect(paperStatusColor('bad')).toBe(palette.bad);
  });
});

describe('MarkerField: etiquetas de riesgo', () => {
  const marker = (kind: Marker['kind'], note?: string): Marker => ({ id: kind, site_id: 'x', kind, x_m: 3, y_m: 4, note });

  it('cada etiqueta es una ficha de papel con el tipo en tinta', () => {
    const scene = new THREE.Scene();
    const field = new MarkerField(scene, 'x', () => 0);
    field.sync([marker('rock', 'Roca grande'), marker('other')]);
    const sprites: THREE.Sprite[] = [];
    scene.traverse((o) => { if ((o as THREE.Sprite).isSprite) sprites.push(o as THREE.Sprite); });
    expect(sprites).toHaveLength(2);
    for (const s of sprites) {
      const log = logOf(s);
      expect(log.fills[0]).toBe(palette['bg-surface']);
      expect(log.fills.filter((f) => DARK.test(f))).toEqual([]);
      expect(log.texts[0]!.color).toBe(palette.label);
    }
    field.dispose();
  });
});
