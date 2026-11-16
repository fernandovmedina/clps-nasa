import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/lib/i18n';
import type { LunarApp } from './app';
import { createRunPanel } from './run-panel';

/** Every string the panel paints, in order. */
let painted: string[] = [];

beforeEach(() => {
  painted = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => new Proxy({}, {
    get: (_t, k) => (k === 'fillText' ? (text: string) => { painted.push(text); } : k === 'measureText' ? (s: string) => ({ width: s.length * 10 }) : () => undefined),
    set: () => true,
  })) as never);
});
afterEach(() => { vi.restoreAllMocks(); });

const app = (over: { stopped?: boolean; paused?: boolean; awaitingStart?: boolean } = {}) => ({
  run: { stopped: !!over.stopped, paused: !!over.paused },
  awaitingStart: !!over.awaitingStart,
  eyeHeight: 1.6,
  restart: () => undefined, setPaused: () => undefined, stop: () => undefined,
}) as unknown as LunarApp;

function draw(over: Parameters<typeof app>[0] = {}) {
  const panel = createRunPanel(app(over));
  panel.invalidate();
  panel.update();
  return panel;
}

describe('run panel texts', () => {
  it.each([
    ['running', {}, ['Pausar', 'Detener']],
    ['paused', { paused: true }, ['Reanudar', 'Detener']],
    ['waiting for the start', { awaitingStart: true }, ['Pausar', 'Detener']],
    ['stopped', { stopped: true }, ['Misión detenida', 'Reiniciar desde el despegue']],
  ] as const)('in Spanish, %s', (_name, over, expected) => {
    draw(over);
    expect(painted).toEqual(expected);
  });

  it.each([
    ['running', {}, ['Pause', 'Stop']],
    ['paused', { paused: true }, ['Resume', 'Stop']],
    ['waiting for the start', { awaitingStart: true }, ['Pause', 'Stop']],
    ['stopped', { stopped: true }, ['Mission stopped', 'Restart from launch']],
  ] as const)('in English, %s', (_name, over, expected) => {
    setLang('en', { persist: false });
    draw(over);
    expect(painted).toEqual(expected);
  });

  it('redraws in the new language after invalidate (what LunarApp does on a language change)', () => {
    const panel = draw();
    expect(painted).toEqual(['Pausar', 'Detener']);
    setLang('en', { persist: false });
    painted = [];
    panel.invalidate();
    panel.update();
    expect(painted).toEqual(['Pause', 'Stop']);
  });
});
