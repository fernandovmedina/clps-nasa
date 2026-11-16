import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtInt } from '../engine/hud';
import { palette } from '../ui/palette';
import { RELAY_LABEL, buildRelayLabel, packetsText } from './transmit';

describe('transmisión: textos', () => {
  it('«4 096 / 4 096» usa el mismo formato de número que el DOM, no el en-US del visor', () => {
    expect(packetsText(1)).toBe(`${fmtInt(4096)} / ${fmtInt(4096)}`);
    expect(packetsText(1)).not.toContain(',');
    expect(packetsText(0.5)).toBe(`${fmtInt(2048)} / ${fmtInt(4096)}`);
    expect(packetsText(0)).toBe(`0 / ${fmtInt(4096)}`);
  });

  it('el satélite de relevo se rotula como posición ilustrativa', () => {
    expect(RELAY_LABEL).toBe('Relevo (posición ilustrativa)');
  });
});

describe('transmisión: ficha del relevo', () => {
  const fills: string[] = [];
  const texts: string[] = [];
  beforeEach(() => {
    fills.length = 0; texts.length = 0;
    const ctx = new Proxy({}, {
      get: (_t, key) => (key === 'measureText' ? (s: string) => ({ width: s.length * 14 }) : key === 'fillText' ? (s: string) => texts.push(s) : () => undefined),
      set: (_t, key, value) => { if (key === 'fillStyle' && typeof value === 'string') fills.push(value); return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('es una ficha de papel con el rótulo del relevo', () => {
    const sprite = buildRelayLabel();
    expect(sprite).toBeInstanceOf(THREE.Sprite);
    expect(fills[0]).toBe(palette['bg-surface']);
    expect(texts).toEqual([RELAY_LABEL]);
  });
});
