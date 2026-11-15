import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import InspectorFrame, { showsInspector } from './InspectorFrame';
import MissionLayer from './MissionLayer';

afterEach(cleanup);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const hud: PhaseHud = { figure: { value: '80', caption: 'de 100' }, side: { kind: 'readouts', items: [] } };

function fakeApp(phase: PhaseName, mode: RunMode = 'running') {
  const state = { phase, mode, live: false };
  const pip = { host: null as unknown, get live() { return state.live; }, setHost(el: unknown) { this.host = el; } };
  const app = {
    get phase() { return { name: state.phase, controlHud: () => hud }; },
    run: { get mode() { return state.mode; } },
    audio: { muted: false, setMuted: vi.fn() },
    room: { status: 'open', send: vi.fn() },
    pip,
    data: null,
    selected: null,
    setPaused: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  } as unknown as LunarApp;
  return { app, state, pip };
}

const room = (isHost: boolean) => ({ code: 'ABCD', isHost, onJoin: vi.fn(), onLeave: vi.fn() });
const tick = () => act(() => { vi.advanceTimersByTime(150); });

describe('showsInspector', () => {
  it('is for the monitor, in pov, landing and transmit only', () => {
    expect(showsInspector('pov', true, false)).toBe(true);
    expect(showsInspector('landing', true, false)).toBe(true);
    expect(showsInspector('transmit', true, false)).toBe(true);
    expect(showsInspector('launch', true, false)).toBe(false);
    expect(showsInspector('orbit', true, false)).toBe(false);
  });

  it('is never for the host, and not while the mission is stopped', () => {
    expect(showsInspector('pov', false, false)).toBe(false);
    expect(showsInspector('landing', false, false)).toBe(false);
    expect(showsInspector('pov', true, true)).toBe(false);
  });
});

describe('InspectorFrame in the layer', () => {
  it.each(['pov', 'landing', 'transmit'] as const)('appears for the monitor in %s with its label', async (phase) => {
    const { app } = fakeApp(phase);
    render(<MissionLayer app={app} vr="no" onEnterVR={vi.fn()} room={room(false)} />);
    await tick();
    const frame = screen.getByRole('complementary', { name: 'Vista del inspector VR' });
    expect(frame.textContent).toContain('Vista del inspector VR');
  });

  it.each(['launch', 'orbit'] as const)('does not appear for the monitor in %s', async (phase) => {
    render(<MissionLayer app={fakeApp(phase).app} vr="no" onEnterVR={vi.fn()} room={room(false)} />);
    await tick();
    expect(screen.queryByRole('complementary', { name: 'Vista del inspector VR' })).toBeNull();
  });

  it.each(['pov', 'landing', 'transmit'] as const)('does not appear for the host in %s', async (phase) => {
    render(<MissionLayer app={fakeApp(phase).app} vr="no" onEnterVR={vi.fn()} room={room(true)} />);
    await tick();
    expect(screen.queryByRole('complementary', { name: 'Vista del inspector VR' })).toBeNull();
  });

  it('says En vivo or Sin señal following the capture', async () => {
    const fake = fakeApp('pov');
    render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room(false)} />);
    await tick();
    const frame = screen.getByRole('complementary', { name: 'Vista del inspector VR' });
    expect(frame.textContent).toContain('● Sin señal · esperando al inspector');
    expect(frame.textContent).not.toContain('En vivo');

    fake.state.live = true;
    await tick();
    expect(frame.textContent).toContain('● En vivo');
    expect(frame.textContent).not.toContain('Sin señal');
    expect(frame.hasAttribute('data-live')).toBe(true);

    fake.state.live = false;
    await tick();
    expect(frame.textContent).toContain('● Sin señal · esperando al inspector');
  });

  it('goes away when the mission is stopped', async () => {
    const fake = fakeApp('landing');
    render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room(false)} />);
    await tick();
    fake.state.mode = 'stopped';
    await tick();
    expect(screen.queryByRole('complementary', { name: 'Vista del inspector VR' })).toBeNull();
  });
});

describe('InspectorFrame placement', () => {
  it('hands its transparent window to the engine and takes it back when it goes', () => {
    const { app, pip } = fakeApp('pov');
    const { unmount, container } = render(<InspectorFrame app={app} live />);
    const view = container.querySelector('aside > div');
    expect(view).not.toBeNull();
    expect(pip.host).toBe(view);
    unmount();
    expect(pip.host).toBeNull();
  });
});
