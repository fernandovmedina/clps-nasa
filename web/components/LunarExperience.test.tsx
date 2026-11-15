import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import LunarExperience from './LunarExperience';

const h = vi.hoisted(() => ({
  apps: [] as { isHost: boolean; enterVR: Mock }[],
  capcom: [] as { prepareForVR: Mock }[],
  enterVR: (() => Promise.resolve()) as () => Promise<void>,
}));

vi.mock('@/lib/engine/app', () => ({
  LunarApp: class {
    isHost = false;
    renderer = { xr: { addEventListener() {}, removeEventListener() {} } };
    room = { setRoom: () => true };
    enterVR = vi.fn(() => h.enterVR());
    constructor() { h.apps.push(this); }
    register() {}
    start() { return Promise.resolve(); }
    dispose() {}
  },
}));
vi.mock('@/lib/phases/launch', () => ({ LaunchPhase: class {} }));
vi.mock('@/lib/phases/orbit', () => ({ OrbitPhase: class {} }));
vi.mock('@/lib/phases/pov', () => ({ PovPhase: class {} }));
vi.mock('@/lib/phases/landing', () => ({ LandingPhase: class {} }));
vi.mock('@/lib/phases/transmit', () => ({ TransmitPhase: class {} }));
vi.mock('@/lib/mission/sites', () => ({ loadMissionData: vi.fn() }));
vi.mock('@/lib/capcom/debug', () => ({ installCapcomDebug: () => undefined }));
vi.mock('@/lib/capcom/vr-panel', () => ({ mountCapcomVrPanel: () => () => {} }));
vi.mock('@/lib/capcom/controller', () => ({
  CapcomController: class {
    prepareForVR = vi.fn(() => Promise.resolve());
    constructor() { h.capcom.push(this); }
    dispose() {}
  },
}));
vi.mock('./experience/MissionLayer', () => ({
  default: ({ planning }: { planning: boolean }) => <div data-testid="layer" data-planning={String(planning)} />,
}));
vi.mock('./experience/WelcomeGuide', () => ({
  default: ({ onChoose }: { onChoose: (role: 'vr' | 'monitor') => void }) => (
    <>
      <button onClick={() => onChoose('vr')}>Voy en VR</button>
      <button onClick={() => onChoose('monitor')}>Monitor</button>
    </>
  ),
}));

const setXr = (supported: Promise<boolean> | undefined) => {
  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: supported && { isSessionSupported: () => supported },
  });
};
const flush = () => act(async () => { await Promise.resolve(); });
const planning = () => screen.getByTestId('layer').getAttribute('data-planning');

async function mountWith(supported: Promise<boolean> | undefined) {
  setXr(supported);
  render(<LunarExperience />);
  await flush();
}

beforeEach(() => {
  h.apps.length = 0;
  h.capcom.length = 0;
  h.enterVR = () => Promise.resolve();
});
afterEach(() => {
  cleanup();
  setXr(undefined);
  window.localStorage.clear();
});

describe('LunarExperience: answering "Voy en VR"', () => {
  it('with a headset, goes straight to the session from the click, without opening the planner', async () => {
    await mountWith(Promise.resolve(true));
    fireEvent.click(screen.getByRole('button', { name: 'Voy en VR' }));
    expect(h.capcom[0]!.prepareForVR).toHaveBeenCalledTimes(1);
    expect(h.apps[0]!.isHost).toBe(true);
    expect(planning()).toBe('false');
    await flush();
    expect(h.apps[0]!.enterVR).toHaveBeenCalledTimes(1);
    await flush();
    expect(planning()).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to the planner, with the error shown, when the session does not start', async () => {
    h.enterVR = () => Promise.reject(new Error('refused'));
    await mountWith(Promise.resolve(true));
    fireEvent.click(screen.getByRole('button', { name: 'Voy en VR' }));
    await flush();
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo iniciar VR');
    expect(planning()).toBe('true');
  });

  it('opens the planner when there is no headset', async () => {
    await mountWith(Promise.resolve(false));
    fireEvent.click(screen.getByRole('button', { name: 'Voy en VR' }));
    await flush();
    expect(planning()).toBe('true');
    expect(h.apps[0]!.enterVR).not.toHaveBeenCalled();
    expect(h.apps[0]!.isHost).toBe(true);
  });

  it('opens the planner when WebXR does not exist or has not answered yet', async () => {
    await mountWith(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Voy en VR' }));
    expect(planning()).toBe('true');
    expect(h.apps[0]!.enterVR).not.toHaveBeenCalled();
    cleanup();
    await mountWith(new Promise<boolean>(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Voy en VR' }));
    expect(planning()).toBe('true');
    expect(h.apps[1]!.enterVR).not.toHaveBeenCalled();
  });

  it('leaves Monitor as it was: no planner, no headset', async () => {
    await mountWith(Promise.resolve(true));
    fireEvent.click(screen.getByRole('button', { name: 'Monitor' }));
    await flush();
    expect(planning()).toBe('false');
    expect(h.apps[0]!.enterVR).not.toHaveBeenCalled();
  });
});
