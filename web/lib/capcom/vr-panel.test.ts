import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '../engine/app';
import { setLang } from '@/lib/i18n';
import type { CapcomController, CapcomSnapshot } from './controller';

const made: Array<{ draw: (p: unknown, g: unknown) => void; invalidate: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; mesh: { onBeforeRender?: () => void; add: ReturnType<typeof vi.fn> } }> = [];
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
    draw: (p: unknown, g: unknown) => void;
    invalidate = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    place = vi.fn(() => this);
    constructor(_w: number, _h: number, _m: number, draw: (p: unknown, g: unknown) => void) { this.draw = draw; made.push(this); }
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

  it('shows a recoverable error as a message to retry, not as a state label', () => {
    expect(describePanel({ ...BASE, state: 'error', message: 'No se pudo conectar con CAPCOM · pulsa para reintentar.' })).toEqual({
      status: 'Sin conexión', tone: 'bad', body: 'No se pudo conectar con CAPCOM · pulsa para reintentar.', hint: 'Mantén A para reintentar',
    });
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

describe('CAPCOM VR panel in English', () => {
  beforeEach(() => { setLang('en', { persist: false }); made.length = 0; donkeys.length = 0; });

  it('describes every state in English', () => {
    expect(describePanel({ ...BASE, mic: 'unknown' })).toMatchObject({ status: 'No microphone', body: 'Turn on CAPCOM before entering VR', hint: 'Allow the microphone in the page, then re-enter.' });
    expect(describePanel({ ...BASE, state: 'listening', talking: true })).toMatchObject({ status: 'Listening…', hint: 'Hold A to talk' });
    expect(describePanel({ ...BASE, state: 'connecting' }).status).toBe('Connecting…');
    expect(describePanel({ ...BASE, state: 'thinking' }).status).toBe('Thinking…');
    expect(describePanel({ ...BASE, state: 'speaking' }).status).toBe('Speaking…');
    expect(describePanel({ ...BASE, state: 'listening' }).status).toBe('Ready');
    expect(describePanel({ ...BASE, state: 'disconnected' }).status).toBe('Standby');
    expect(describePanel({ ...BASE, state: 'error', message: 'x' })).toMatchObject({ status: 'No connection', hint: 'Hold A to retry' });
    expect(describePanel({ ...BASE, state: 'unavailable' })).toMatchObject({ status: 'CAPCOM unavailable', hint: '' });
  });

  function mount(snapshot: CapcomSnapshot) {
    let subscribed = 0;
    const app = { eyeHeight: 1.6, rig: { add: vi.fn() }, globalTargets: [] as unknown[], input: { onAButton: () => () => {} } } as unknown as LunarApp;
    const controller = { getSnapshot: () => snapshot, subscribe: () => { subscribed++; return () => {}; }, press: vi.fn(), release: vi.fn() } as unknown as CapcomController;
    return { unmount: mountCapcomVrPanel(app, controller), subscribed: () => subscribed };
  }

  it('draws the English text and the English talk button', () => {
    mount({ ...BASE, state: 'listening' });
    const drawn: string[] = [];
    const g = new Proxy({ measureText: () => ({ width: 10 }), fillText: (text: string) => { drawn.push(text); } } as Record<string, unknown>, {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: () => true,
    });
    const button = vi.fn();
    made[0]!.draw({ frame: vi.fn(), button }, g);
    expect(drawn).toContain('Ready');
    expect(drawn.join(' ')).toContain('Hold A to talk');
    expect(button.mock.calls[0]![6]).toBe('Talk');
  });

  it('invalidates its panel when the language changes and stops listening on unmount', () => {
    const { unmount } = mount(BASE);
    setLang('es', { persist: false });
    expect(made[0]!.invalidate).toHaveBeenCalledTimes(1);
    unmount();
    setLang('en', { persist: false });
    expect(made[0]!.invalidate).toHaveBeenCalledTimes(1);
  });
});
