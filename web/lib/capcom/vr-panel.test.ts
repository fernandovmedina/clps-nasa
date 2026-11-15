import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '../engine/app';
import type { CapcomController, CapcomSnapshot } from './controller';

const made: Array<{ invalidate: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; mesh: { onBeforeRender?: () => void; add: ReturnType<typeof vi.fn> } }> = [];
const donkeys: Array<{ group: object; setMood: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];

vi.mock('./donkey', () => ({
  donkeyMood: (s: { state: string }) => (s.state === 'speaking' ? 'speaking' : 'idle'),
  DonkeyGuide: class {
    group = { position: { set: vi.fn() }, rotation: { y: 0 } };
    setMood = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    load() { return this; }
    constructor() { donkeys.push(this); }
  },
}));

vi.mock('../engine/panel', () => ({
  UI: { font: 'x', text: '#fff', dim: '#aaa', ok: '#0f0', warn: '#ff0', bad: '#f00' },
  Panel: class {
    mesh: { onBeforeRender?: () => void; add: ReturnType<typeof vi.fn> } = { add: vi.fn() };
    invalidate = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    place = vi.fn(() => this);
    constructor() { made.push(this); }
  },
}));

const { describePanel, mountCapcomVrPanel, NEEDS_MIC_TEXT } = await import('./vr-panel');

const BASE: CapcomSnapshot = { state: 'disconnected', talking: false, question: '', answer: '', answerFinal: false, message: null, mic: 'granted' };

describe('describePanel', () => {
  it('asks to activate CAPCOM before entering VR when the microphone was not granted', () => {
    expect(describePanel({ ...BASE, mic: 'unknown' }).body).toBe(NEEDS_MIC_TEXT);
    expect(describePanel({ ...BASE, mic: 'denied', state: 'error', message: 'x' }).body).toBe(NEEDS_MIC_TEXT);
    expect(describePanel({ ...BASE, mic: 'granted' }).body).not.toBe(NEEDS_MIC_TEXT);
  });

  it('shows the state and the last subtitle, preferring CAPCOM\'s answer to the question', () => {
    expect(describePanel({ ...BASE, state: 'listening', talking: true })).toMatchObject({ status: 'Escuchando…', hint: 'Mantén A para hablar' });
    expect(describePanel({ ...BASE, state: 'thinking', question: 'cómo va el viaje' })).toMatchObject({ status: 'Pensando…', body: 'cómo va el viaje' });
    expect(describePanel({ ...BASE, state: 'speaking', question: 'q', answer: 'Vamos a 169 km.' })).toMatchObject({ status: 'Hablando…', body: 'Vamos a 169 km.' });
    expect(describePanel({ ...BASE, state: 'connecting' }).status).toBe('Conectando…');
    expect(describePanel({ ...BASE, state: 'listening' }).status).toBe('Listo');
  });

  it('says CAPCOM is not available when it is', () => {
    expect(describePanel({ ...BASE, state: 'unavailable', message: 'CAPCOM no disponible' })).toMatchObject({ status: 'CAPCOM no disponible', hint: '' });
  });
});

describe('mountCapcomVrPanel', () => {
  beforeEach(() => { made.length = 0; donkeys.length = 0; });

  function setup() {
    let buttonListener: ((held: boolean) => void) | null = null;
    let stateListener: (() => void) | null = null;
    const offButton = vi.fn(() => { buttonListener = null; });
    const offState = vi.fn(() => { stateListener = null; });
    const app = {
      eyeHeight: 1.6,
      rig: { add: vi.fn() },
      globalTargets: [] as unknown[],
      input: { onAButton: (l: (held: boolean) => void) => { buttonListener = l; return offButton; } },
    } as unknown as LunarApp;
    const controller = {
      getSnapshot: () => BASE,
      subscribe: (l: () => void) => { stateListener = l; return offState; },
      press: vi.fn(), release: vi.fn(),
    } as unknown as CapcomController;
    const unmount = mountCapcomVrPanel(app, controller);
    return { app, controller, unmount, press: (held: boolean) => buttonListener?.(held), change: () => stateListener?.(), offButton, offState };
  }

  it('adds a pointer-reachable panel to the rig that redraws itself and on every state change', () => {
    const { app, change } = setup();
    expect(app.rig.add).toHaveBeenCalledWith(made[0]!.mesh);
    expect(app.globalTargets).toContain(made[0]!.mesh);
    made[0]!.mesh.onBeforeRender?.();
    expect(made[0]!.update).toHaveBeenCalledTimes(1);
    change();
    expect(made[0]!.invalidate).toHaveBeenCalledTimes(1);
  });

  it('puts the donkey on the panel, animates it every frame and follows CAPCOM\'s state', () => {
    const { change } = setup();
    expect(made[0]!.mesh.add).toHaveBeenCalledWith(donkeys[0]!.group);
    made[0]!.mesh.onBeforeRender?.();
    expect(donkeys[0]!.update).toHaveBeenCalledTimes(1);
    expect(donkeys[0]!.setMood).toHaveBeenLastCalledWith('idle');
    change();
    expect(donkeys[0]!.setMood).toHaveBeenCalledTimes(2);
  });

  it('holds to talk with the right A button', () => {
    const { controller, press } = setup();
    press(true);
    expect(controller.press).toHaveBeenCalledTimes(1);
    press(false);
    expect(controller.release).toHaveBeenCalledTimes(1);
  });

  it('removes everything when unmounted', () => {
    const { app, unmount, offButton, offState } = setup();
    unmount();
    expect(app.globalTargets).toEqual([]);
    expect(offButton).toHaveBeenCalled();
    expect(offState).toHaveBeenCalled();
    expect(made[0]!.dispose).toHaveBeenCalled();
    expect(donkeys[0]!.dispose).toHaveBeenCalled();
  });
});
