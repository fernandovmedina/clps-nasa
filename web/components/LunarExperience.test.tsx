import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LunarExperience from './LunarExperience';

interface FakeLunarApp {
  isHost: boolean;
  begun: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  enterVR: ReturnType<typeof vi.fn>;
  launches: number;
}
const harness = vi.hoisted(() => ({
  app: null as FakeLunarApp | null,
  apps: [] as FakeLunarApp[],
  capcom: [] as { prepareForVR: ReturnType<typeof vi.fn> }[],
  enterVR: (() => Promise.resolve()) as () => Promise<void>,
}));

// The engine needs WebGL: this stand-in keeps what chooseRole depends on (isHost, a real RoomClient and a
// LaunchSync wired like LaunchPhase wires it, restart() entering a fresh launch, enterVR()) and what the welcome
// needs from the narrator (it waits for the clips, then asks for the line and lets the visitor cut it).
vi.mock('@/lib/engine/app', async () => {
  const { RoomClient } = await import('@/lib/sync/room-client');
  const { LaunchSync } = await import('@/lib/phases/launch-sync');
  class LunarApp {
    isHost: boolean;
    room: InstanceType<typeof RoomClient>;
    phase: object | null = null;
    launches = 0;
    begun = vi.fn();
    narrator = { say: vi.fn(), ready: Promise.resolve(), setMuted: vi.fn(), stop: vi.fn(), sayAndWait: vi.fn(() => new Promise<never>(() => {})) };
    audio = { muted: false };
    enterVR = vi.fn(() => harness.enterVR());
    renderer = { xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() } };

    constructor(readonly container: HTMLElement, readonly opts: { room?: string; isHost?: boolean }) {
      this.isHost = opts.isHost ?? true;
      this.room = new RoomClient(opts.room ?? 'touchdown');
      harness.app = this;
      harness.apps.push(this);
    }

    register() {}
    async start() { this.enterLaunch(); }
    restart = vi.fn(() => this.enterLaunch());
    dispose() { this.room.close(); }

    private enterLaunch() {
      const isHost = () => this.isHost;
      const sync = new LaunchSync({
        get isHost() { return isHost(); },
        landing: () => new Date('2027-01-10T00:00:00Z'),
        applyLanding: () => {},
        send: (msg) => this.room.send(msg),
        applyMarkerEvent: () => {},
      }, this.begun);
      this.launches++;
      this.phase = {};
      this.room.setListener((msg) => sync.handle(msg));
    }
  }
  return { LunarApp };
});
vi.mock('@/lib/phases/launch', () => ({ LaunchPhase: class {} }));
vi.mock('@/lib/phases/orbit', () => ({ OrbitPhase: class {} }));
vi.mock('@/lib/phases/pov', () => ({ PovPhase: class {} }));
vi.mock('@/lib/phases/landing', () => ({ LandingPhase: class {} }));
vi.mock('@/lib/phases/transmit', () => ({ TransmitPhase: class {} }));
vi.mock('@/lib/mission/sites', () => ({ loadMissionData: vi.fn() }));
vi.mock('@/lib/capcom/controller', () => ({
  CapcomController: class {
    prepareForVR = vi.fn(() => Promise.resolve());
    constructor() { harness.capcom.push(this); }
    dispose() {}
  },
}));
vi.mock('@/lib/capcom/donkey-stage', () => ({ DonkeyStage: class { ok = true; setMood() {} dispose() {} } }));
vi.mock('@/lib/capcom/debug', () => ({ installCapcomDebug: () => ({}) }));
vi.mock('@/lib/capcom/vr-panel', () => ({ mountCapcomVrPanel: () => () => {} }));
vi.mock('./experience/MissionLayer', () => ({
  default: ({ planning }: { planning: boolean }) => <div data-testid="layer" data-planning={String(planning)} />,
}));

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: { type: string; [key: string]: unknown }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const STALE_PLAYING = { type: 'state', site_id: 'malapert-a', t: '2026-11-01T00:00:00.000Z', playing: true, speed: 1, markers: [] };

const setXr = (supported: Promise<boolean> | undefined) => {
  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: supported && { isSessionSupported: () => supported },
  });
};
const flush = () => act(async () => { await Promise.resolve(); });
const planning = () => screen.getByTestId('layer').getAttribute('data-planning');

/** The welcome greets before it asks: Saltar, there from the first render, goes straight to the two role buttons. */
function choose(name: 'Voy en VR' | 'Sigo la misión (Monitor)') {
  fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
  fireEvent.click(screen.getByRole('button', { name }));
}

async function mounted(xr?: Promise<boolean>) {
  setXr(xr);
  render(<LunarExperience />);
  await waitFor(() => expect(harness.app?.launches).toBe(1));
  const socket = FakeSocket.instances.at(-1)!;
  socket.open();
  await flush();
  return { app: harness.app!, socket };
}

beforeEach(() => {
  harness.app = null;
  harness.apps.length = 0;
  harness.capcom.length = 0;
  harness.enterVR = () => Promise.resolve();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/?room=ABCD');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setXr(undefined);
});

describe('LunarExperience: choosing VR in the welcome', () => {
  it('turns a monitor that loaded a shared link into the host and restarts from the launch, announcing not playing', async () => {
    const { app, socket } = await mounted();
    expect(app.isHost).toBe(false);
    socket.receive(STALE_PLAYING);
    expect(app.begun).toHaveBeenCalledTimes(1);

    choose('Voy en VR');

    expect(app.isHost).toBe(true);
    expect(app.restart).toHaveBeenCalledTimes(1);
    expect(app.launches).toBe(2);
    expect(app.begun).toHaveBeenCalledTimes(1);
    expect(socket.sent.filter((m) => m.type === 'set_time')).toEqual([
      { type: 'set_time', t: '2027-01-10T00:00:00.000Z', playing: false },
    ]);
  });

  it('does nothing new for a client that already was the host', async () => {
    window.sessionStorage.setItem('touchdown:room', JSON.stringify({ room: 'ABCD', isHost: true }));
    const { app, socket } = await mounted();
    expect(app.isHost).toBe(true);
    socket.receive({ ...STALE_PLAYING, playing: false });
    const sentBefore = socket.sent.length;

    choose('Voy en VR');

    expect(app.isHost).toBe(true);
    expect(app.restart).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(sentBefore);
  });

  it('leaves the mission alone when a monitor picks Monitor', async () => {
    const { app } = await mounted();

    choose('Sigo la misión (Monitor)');

    expect(app.isHost).toBe(false);
    expect(app.restart).not.toHaveBeenCalled();
  });
});

describe('LunarExperience: answering "Voy en VR" with or without a headset', () => {
  it('with a headset, goes straight to the session from the click, without opening the planner', async () => {
    const { app } = await mounted(Promise.resolve(true));
    choose('Voy en VR');
    expect(harness.capcom[0]!.prepareForVR).toHaveBeenCalledTimes(1);
    expect(app.isHost).toBe(true);
    expect(planning()).toBe('false');
    await flush();
    expect(app.enterVR).toHaveBeenCalledTimes(1);
    await flush();
    expect(planning()).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to the planner, with the error shown, when the session does not start', async () => {
    harness.enterVR = () => Promise.reject(new Error('refused'));
    await mounted(Promise.resolve(true));
    choose('Voy en VR');
    await flush();
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo iniciar VR');
    expect(planning()).toBe('true');
  });

  it('opens the planner when there is no headset', async () => {
    const { app } = await mounted(Promise.resolve(false));
    choose('Voy en VR');
    await flush();
    expect(planning()).toBe('true');
    expect(app.enterVR).not.toHaveBeenCalled();
    expect(app.isHost).toBe(true);
  });

  it('opens the planner when WebXR does not exist or has not answered yet', async () => {
    const first = await mounted(undefined);
    choose('Voy en VR');
    expect(planning()).toBe('true');
    expect(first.app.enterVR).not.toHaveBeenCalled();
    cleanup();
    harness.app = null;
    const second = await mounted(new Promise<boolean>(() => {}));
    choose('Voy en VR');
    expect(planning()).toBe('true');
    expect(second.app.enterVR).not.toHaveBeenCalled();
  });

  it('leaves Monitor as it was: no planner, no headset', async () => {
    const { app } = await mounted(Promise.resolve(true));
    choose('Sigo la misión (Monitor)');
    await flush();
    expect(planning()).toBe('false');
    expect(app.enterVR).not.toHaveBeenCalled();
  });
});
