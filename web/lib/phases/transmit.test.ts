import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtInt } from '../engine/hud';
import { palette } from '../ui/palette';
import { RELAY_LABEL, buildRelayLabel, earthElevationText, packetsText } from './transmit';

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

describe('transmisión: elevación de la Tierra', () => {
  it('visible: la elevación y «visible»', () => {
    expect(earthElevationText(8.5, 1.51, 'lola')).toBe('8.50° · visible');
  });

  it('positiva pero tapada por el relieve: cita el horizonte LOLA calculado', () => {
    expect(earthElevationText(1.3, 1.3 - 6.99, 'lola')).toBe('1.30° · bajo el horizonte LOLA (6.99°)');
  });

  it('con horizonte esférico dice «horizonte geométrico»', () => {
    expect(earthElevationText(-2.4, -2.4, 'spherical')).toBe('−2.40° · bajo el horizonte geométrico');
  });

  it('negativa con horizonte LOLA: bajo el horizonte, sin cifra de relieve', () => {
    expect(earthElevationText(-2.4, -9, 'lola')).toBe('−2.40° · bajo el horizonte');
  });
});
