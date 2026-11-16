import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const xrState = { presenting: false };
const renders: number[] = [];
let frame: (() => void) | null = null;

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    domElement = document.createElement('canvas');
    shadowMap = {};
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    xr = {
      enabled: false,
      get isPresenting() { return xrState.presenting; },
      setReferenceSpaceType() {},
      setFoveation() {},
      addEventListener() {},
      removeEventListener() {},
      getController: () => new actual.Group(),
      getControllerGrip: () => new actual.Group(),
      getSession: () => null,
      getCamera: () => new actual.ArrayCamera(),
    };
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(fn: (() => void) | null) { frame = fn; }
    render() { renders.push(renders.length); }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

vi.mock('./moon', () => ({ loadMoonTextures: async () => ({}) }));

class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: unknown = null; onmessage: unknown = null; onclose: unknown = null; onerror: unknown = null;
  send() {}
  close() {}
}

import { LunarApp, type AppOptions, type Phase, type PhaseName } from './app';
import { Panel } from './panel';
import { getLang, setLang } from '../i18n';
import type { PhaseHud } from './hud';

interface Probe { updates: { dt: number; t: number }[]; made: number; waiting: boolean; hudPanel: Panel; exited: number }

function register(app: LunarApp, name: PhaseName, probe: Probe, extra: Partial<Phase> = {}) {
  app.register(name, () => {
    probe.made++;
    probe.updates = [];
    const phase: Phase = {
      name,
      scene: new THREE.Scene(),
      targets: [],
      enter() { phase.scene.add(app.rig); app.rig.add(probe.hudPanel.mesh); },
      update(dt, t) { probe.updates.push({ dt, t }); },
      exit() { probe.exited++; },
      controlHud: () => ({ figure: { value: name, caption: '' }, side: { kind: 'readouts', items: [] }, waiting: probe.waiting }) as PhaseHud,
      ...extra,
    };
    return phase;
  });
}

const tick = (ms = 50) => { vi.advanceTimersByTime(ms); frame?.(); };

async function boot(opts: Partial<AppOptions> = {}) {
  const probe: Probe = { updates: [], made: 0, waiting: false, hudPanel: new Panel(64, 64, 0.1, () => undefined), exited: 0 };
  const app = new LunarApp(document.createElement('div'), { loadData: async () => { throw new Error('unused'); }, ...opts });
  register(app, 'launch', probe);
  register(app, 'orbit', probe);
  await app.start();
  tick(0);
  return { app, probe };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  xrState.presenting = false;
  renders.length = 0;
  frame = null;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LunarApp run control', () => {

  it('advances the phase and the simulation clock while running', async () => {
    const { app, probe } = await boot();
    tick(); tick();
    expect(probe.updates.length).toBeGreaterThanOrEqual(2);
    expect(app.time).toBeGreaterThan(0);
  });

  it('pausing stops phase updates and the clock but keeps drawing every frame', async () => {
    const { app, probe } = await boot();
    tick();
    app.setPaused(true);
    expect(app.run.mode).toBe('paused');
    const calls = probe.updates.length, time = app.time, drawn = renders.length;
    for (let i = 0; i < 20; i++) tick();
    expect(probe.updates.length).toBe(calls);
    expect(app.time).toBe(time);
    expect(renders.length).toBe(drawn + 20);

    app.setPaused(false);
    tick();
    expect(probe.updates.length).toBe(calls + 1);
    expect(app.time).toBeGreaterThan(time);
  });

  it('suspends audio on pause and resumes it on resume', async () => {
    const { app } = await boot();
    const pause = vi.spyOn(app.audio, 'pause'), resume = vi.spyOn(app.audio, 'resume');
    app.setPaused(true);
    app.setPaused(true);
    app.setPaused(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('cannot be paused before the phase has started', async () => {
    const { app, probe } = await boot();
    probe.waiting = true;
    expect(app.awaitingStart).toBe(true);
    app.setPaused(true);
    expect(app.run.mode).toBe('running');
    probe.waiting = false;
    app.setPaused(true);
    expect(app.run.mode).toBe('paused');
  });

  it('stop freezes the phase, silences audio and refuses to pause or change phase', async () => {
    const { app, probe } = await boot();
    tick();
    const silence = vi.spyOn(app.audio, 'pause');
    app.stop();
    expect(app.run.mode).toBe('stopped');
    expect(silence).toHaveBeenCalledTimes(1);
    const calls = probe.updates.length;
    for (let i = 0; i < 5; i++) tick();
    expect(probe.updates.length).toBe(calls);
    app.setPaused(true);
    expect(app.run.mode).toBe('stopped');
    await app.goTo('orbit');
    expect(app.phase?.name).toBe('launch');
  });

  it('a transition in flight does not swap the phase after stop', async () => {
    const { app } = await boot();
    for (let i = 0; i < 30; i++) tick();
    const going = app.goTo('orbit', 0.5, 0.5);
    tick(); tick();
    app.stop();
    for (let i = 0; i < 40; i++) tick();
    await going;
    expect(app.phase?.name).toBe('launch');
  });

  it('restart starts the first phase again with a clean session', async () => {
    const { app, probe } = await boot();
    app.flags.add('orbit-done');
    app.selected = { site: { id: 'x' } } as never;
    app.ranking = [{}] as never;
    app.data = {} as never;
    tick();
    app.stop();
    const made = probe.made, resume = vi.spyOn(app.audio, 'resume');

    app.restart();

    expect(app.run.mode).toBe('running');
    expect(resume).toHaveBeenCalled();
    expect(probe.made).toBe(made + 1);
    expect(probe.exited).toBe(1);
    expect(app.phase?.name).toBe('launch');
    expect(app.flags.has('orbit-done')).toBe(false);
    expect(app.selected).toBeNull();
    expect(app.ranking).toEqual([]);
    expect(app.data).toBeNull();
    expect(app.time).toBe(0);
    tick();
    expect(probe.updates.length).toBeGreaterThan(0);
  });

  it('restart brings back a launch that waits for its start button', async () => {
    const { app, probe } = await boot();
    app.stop();
    probe.waiting = true;
    app.restart();
    expect(app.awaitingStart).toBe(true);
    app.setPaused(true);
    expect(app.run.mode).toBe('running');
  });
});

describe('LunarApp panels outside and inside VR', () => {
  it('hides every 3D panel on the desktop and shows them in a headset', async () => {
    xrState.presenting = false;
    const { app, probe } = await boot();
    tick();
    expect(probe.hudPanel.mesh.visible).toBe(false);
    expect(app.runPanel.mesh.visible).toBe(false);
    expect(app.exitPanel.mesh.visible).toBe(false);

    xrState.presenting = true;
    tick();
    expect(probe.hudPanel.mesh.visible).toBe(true);
    expect(app.runPanel.mesh.visible).toBe(true);
    expect(app.exitPanel.mesh.visible).toBe(true);

    xrState.presenting = false;
    tick();
    expect(probe.hudPanel.mesh.visible).toBe(false);
  });

  it('keeps the run panel and the exit button reachable by the controller rays', async () => {
    const { app } = await boot();
    expect(app.globalTargets).toContain(app.runPanel.mesh);
    expect(app.globalTargets).toContain(app.exitPanel.mesh);
  });

  it('places the run panel below the line of sight, centred, about 1.2 m away', async () => {
    const { app } = await boot();
    const eye = new THREE.Vector3(0, app.eyeHeight, 0);
    const offset = app.runPanel.mesh.position.clone().sub(eye);
    const distance = offset.length();
    const below = THREE.MathUtils.radToDeg(Math.asin(-offset.y / distance));
    expect(distance).toBeGreaterThan(1.1);
    expect(distance).toBeLessThan(1.3);
    expect(below).toBeGreaterThanOrEqual(25);
    expect(below).toBeLessThanOrEqual(35);
    expect(app.runPanel.mesh.position.x).toBe(0);
  });

  it('offers Pausar and Detener, never a second exit button', async () => {
    xrState.presenting = true;
    const { app } = await boot();
    tick();
    expect(app.runPanel.buttons.map((b) => b.id)).toEqual(['pause', 'stop']);
  });

  it('draws the pause button dimmed and inert while the phase waits for its start', async () => {
    xrState.presenting = true;
    const { app, probe } = await boot();
    probe.waiting = true;
    app.runPanel.invalidate();
    tick();
    expect(app.runPanel.buttons.map((b) => b.id)).toEqual(['stop']);
  });

  it('switches to a restart button once the mission is stopped', async () => {
    xrState.presenting = true;
    const { app } = await boot();
    tick();
    app.stop();
    tick();
    expect(app.runPanel.buttons.map((b) => b.id)).toEqual(['restart']);
  });

  it('the run panel buttons drive the engine', async () => {
    xrState.presenting = true;
    const { app } = await boot();
    tick();
    const click = (id: string) => app.runPanel.buttons.find((b) => b.id === id)!.onClick();
    click('pause');
    expect(app.run.mode).toBe('paused');
    tick();
    expect(app.runPanel.buttons.map((b) => b.id)).toEqual(['pause', 'stop']);
    click('pause');
    expect(app.run.mode).toBe('running');
    click('stop');
    expect(app.run.mode).toBe('stopped');
  });
});

describe('LunarApp VR preview and phases that own the run controls', () => {
  it('shows the VR interface on the desktop only when the preview is on', async () => {
    xrState.presenting = false;
    const off = await boot();
    tick();
    expect(off.probe.hudPanel.mesh.visible).toBe(false);
    expect(off.app.runPanel.mesh.visible).toBe(false);
    expect(off.app.exitPanel.mesh.visible).toBe(false);
    off.app.dispose();

    const on = await boot({ vrPreview: true });
    tick();
    expect(on.app.isXR).toBe(false);
    expect(on.probe.hudPanel.mesh.visible).toBe(true);
    expect(on.app.runPanel.mesh.visible).toBe(true);
    expect(on.app.exitPanel.mesh.visible).toBe(true);
  });

  it('hides the generic run and exit panels while the phase owns the run controls, and brings them back after', async () => {
    xrState.presenting = true;
    const { app, probe } = await boot();
    register(app, 'orbit', probe, { ownsRunControls: true });
    tick();
    expect(app.runPanel.mesh.visible).toBe(true);
    expect(app.exitPanel.mesh.visible).toBe(true);

    app.setPhase('orbit');
    tick();
    expect(probe.hudPanel.mesh.visible).toBe(true);
    expect(app.runPanel.mesh.visible).toBe(false);
    expect(app.exitPanel.mesh.visible).toBe(false);

    app.setPhase('launch');
    tick();
    expect(app.runPanel.mesh.visible).toBe(true);
    expect(app.exitPanel.mesh.visible).toBe(true);
  });

  it('hides them in the preview too, and the console panels keep the pointer', async () => {
    const { app, probe } = await boot({ vrPreview: true });
    register(app, 'orbit', probe, { ownsRunControls: true });
    app.setPhase('orbit');
    tick();
    expect(app.runPanel.mesh.visible).toBe(false);
    expect(app.exitPanel.mesh.visible).toBe(false);
    expect(probe.hudPanel.mesh.visible).toBe(true);
  });

  it('calls updateUi every frame, also while paused and stopped', async () => {
    const updateUi = vi.fn();
    const { app, probe } = await boot();
    register(app, 'orbit', probe, { updateUi });
    app.setPhase('orbit');
    tick();
    const running = updateUi.mock.calls.length;
    expect(running).toBeGreaterThan(0);
    app.setPaused(true);
    tick(); tick();
    expect(updateUi.mock.calls.length).toBe(running + 2);
    app.stop();
    tick();
    expect(updateUi.mock.calls.length).toBe(running + 3);
  });
});

describe('LunarApp render style and free look per phase', () => {
  const DEFAULT_EXPOSURE = 1.05;

  async function bootWithSite(extra: Partial<Phase>) {
    const { app, probe } = await boot();
    register(app, 'pov', probe, extra);
    register(app, 'landing', probe);
    return { app, renderer: app.renderer as unknown as { toneMapping: number; toneMappingExposure: number } };
  }

  it('a phase can raise the exposure and change the tone mapping, and the next phase gets the defaults back', async () => {
    const { app, renderer } = await bootWithSite({ render: { toneMapping: THREE.NeutralToneMapping, exposure: 1.9 } });
    const base = renderer.toneMapping;
    expect(renderer.toneMappingExposure).toBe(DEFAULT_EXPOSURE);
    app.setPhase('pov');
    expect(renderer.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.9);
    app.setPhase('landing');
    expect(renderer.toneMapping).toBe(base);
    expect(renderer.toneMappingExposure).toBe(DEFAULT_EXPOSURE);
  });

  it('leaving the phase through a restart also restores the defaults', async () => {
    const { app, renderer } = await bootWithSite({ render: { toneMapping: THREE.AgXToneMapping, exposure: 2 } });
    app.setPhase('pov');
    app.restart();
    expect(renderer.toneMappingExposure).toBe(DEFAULT_EXPOSURE);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('a dragged look drifts back after 4 s in an ordinary phase but stays put when the phase holds the look', async () => {
    const { app } = await bootWithSite({ holdsLook: true });
    app.setPhase('landing');
    app.lookDrag(-200, 0);
    for (let i = 0; i < 160; i++) tick();
    expect(Math.abs(app.camera.rotation.y)).toBeLessThan(0.3);

    app.setPhase('pov');
    app.lookDrag(-200, 0);
    tick();
    const dragged = app.camera.rotation.y;
    for (let i = 0; i < 160; i++) tick();
    expect(dragged).toBeCloseTo(0.8, 5);
    expect(app.camera.rotation.y).toBeCloseTo(dragged, 5);
  });

  it('releaseLook eases a dragged look back to the framing even in a phase that holds it', async () => {
    const { app } = await bootWithSite({ holdsLook: true });
    app.setPhase('pov');
    app.lookDrag(-200, 90);
    tick();
    expect(Math.abs(app.camera.rotation.y)).toBeGreaterThan(0.5);
    app.releaseLook();
    for (let i = 0; i < 80; i++) tick();
    expect(app.camera.rotation.y).toBe(0);
    expect(app.camera.rotation.x).toBe(0);
    app.lookDrag(-100, 0);
    tick();
    expect(app.camera.rotation.y).toBeCloseTo(0.4, 5);
  });
});

describe('LunarApp language hook', () => {
  it('tells the current phase through onLangChange and redraws the generic panels', async () => {
    const onLangChange = vi.fn();
    const probe: Probe = { updates: [], made: 0, waiting: false, hudPanel: new Panel(64, 64, 0.1, () => undefined), exited: 0 };
    const app = new LunarApp(document.createElement('div'), { loadData: async () => { throw new Error('unused'); } });
    register(app, 'launch', probe, { onLangChange });
    await app.start();
    tick(0);
    const run = vi.spyOn(app.runPanel, 'invalidate');
    const exit = vi.spyOn(app.exitPanel, 'invalidate');
    setLang('en', { persist: false });
    expect(getLang()).toBe('en');
    expect(onLangChange).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalled();
    expect(exit).toHaveBeenCalled();
    setLang('en', { persist: false });
    expect(onLangChange).toHaveBeenCalledTimes(1);
    app.dispose();
  });

  it('does nothing for phases without onLangChange, and follows the phase that is current after a switch', async () => {
    const onLangChange = vi.fn();
    const probe: Probe = { updates: [], made: 0, waiting: false, hudPanel: new Panel(64, 64, 0.1, () => undefined), exited: 0 };
    const app = new LunarApp(document.createElement('div'), { loadData: async () => { throw new Error('unused'); } });
    register(app, 'launch', probe);
    register(app, 'orbit', probe, { onLangChange });
    await app.start();
    tick(0);
    expect(() => setLang('en', { persist: false })).not.toThrow();
    expect(onLangChange).not.toHaveBeenCalled();
    app.setPhase('orbit');
    setLang('es', { persist: false });
    expect(onLangChange).toHaveBeenCalledTimes(1);
    app.dispose();
  });

  it('stops listening once disposed', async () => {
    const onLangChange = vi.fn();
    const probe: Probe = { updates: [], made: 0, waiting: false, hudPanel: new Panel(64, 64, 0.1, () => undefined), exited: 0 };
    const app = new LunarApp(document.createElement('div'), { loadData: async () => { throw new Error('unused'); } });
    register(app, 'launch', probe, { onLangChange });
    await app.start();
    app.dispose();
    setLang('en', { persist: false });
    expect(onLangChange).not.toHaveBeenCalled();
  });
});
