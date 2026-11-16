import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import type { RoomStatus } from '@/lib/sync/room-client';
import MissionLayer from './MissionLayer';

afterEach(cleanup);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const WAITING = 'Conectado. El despegue empezará aquí en cuanto la tripulación pulse «Comenzar despegue».';

const waitingHud = (over: Partial<PhaseHud> = {}): PhaseHud => ({
  figure: { value: 'En espera', caption: '' },
  progress: { value: 1, label: 'Carga de datos' },
  detail: WAITING,
  side: { kind: 'readouts', items: [{ label: 'Altitud', value: '0.0 km' }] },
  waiting: true,
  ...over,
});

function fakeApp(hud: PhaseHud, phase: PhaseName = 'launch') {
  const state = { phase, mode: 'running' as RunMode, hud, room: 'open' as RoomStatus };
  const app = {
    get phase() { return { name: state.phase, controlHud: () => state.hud }; },
    run: { get mode() { return state.mode; } },
    audio: { muted: false, setMuted: vi.fn() },
    room: { get status() { return state.room; }, send: vi.fn() },
    data: null,
    selected: null,
    ranking: [],
    setPaused: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  } as unknown as LunarApp;
  return { app, state };
}

const monitor = (over: Partial<{ code: string; onLeave: () => void; onJoin: (c: string) => boolean }> = {}) =>
  ({ code: 'WXYZ', isHost: false, onJoin: vi.fn(), onLeave: vi.fn(), ...over });
const crew = (over: Partial<{ onJoin: (c: string) => boolean }> = {}) => ({ code: 'ABCD', isHost: true, onJoin: vi.fn(() => true), onLeave: vi.fn(), ...over });
const tick = (ms = 150) => act(() => { vi.advanceTimersByTime(ms); });

describe('Follow mode', () => {
  it('shows the pill with the mission code and a green dot while the room is open, grey while connecting', async () => {
    const fake = fakeApp(waitingHud());
    render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    const pill = screen.getByText(/siguiendo la misión/).closest('p')!;
    expect(pill.textContent).toBe('Seguimiento · siguiendo la misión WXYZ');
    expect(within(pill).getByText('WXYZ').tagName).toBe('STRONG');
    const dot = within(pill).getByRole('img');
    expect(dot.getAttribute('aria-label')).toBe('Conectado');
    expect(dot.getAttribute('data-state')).toBe('open');

    fake.state.room = 'connecting';
    await tick();
    expect(within(pill).getByRole('img').getAttribute('aria-label')).toBe('Conectando');
    expect(within(pill).getByRole('img').getAttribute('data-state')).toBe('wait');
  });

  it('keeps only the sound and Salir at the top right: no Seguir la misión button, no VR', async () => {
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="yes" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    expect(screen.getByRole('button', { name: 'Sonido' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Seguir la misión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar en VR' })).toBeNull();
  });

  it('Salir hands control to the parent, which forgets the room and goes back to /', async () => {
    const onLeave = vi.fn();
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="no" onEnterVR={vi.fn()} room={monitor({ onLeave })} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('waits with En espera in a status region, and with no Comenzar, Pausar or Detener', async () => {
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    const panel = screen.getByRole('status', { name: 'Estado de la misión' });
    expect(within(panel).getByTestId('figure').textContent).toBe('En espera');
    expect(within(panel).getByText(WAITING)).toBeTruthy();
    expect(within(panel).getByText('Modo seguimiento: los controles de la misión los tiene la tripulación.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comenzar despegue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detener' })).toBeNull();
  });

  it('never opens the planner for a monitor, even when asked to', async () => {
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="no" onEnterVR={vi.fn()} room={monitor()} planning onPlanning={vi.fn()} />);
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('describes the followed mission in "Misión que sigues" and offers no way to change it', async () => {
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    const block = screen.getByRole('region', { name: 'Misión que sigues' });
    expect(within(block).getByText('5 ene 2027 · 12:00 UTC')).toBeTruthy();
    expect(within(block).getByText('10 ene 2027 · 00:00 UTC')).toBeTruthy();
    expect(within(block).getByText('4.5 días (supuesto)')).toBeTruthy();
    expect(screen.queryByText('Código de seguimiento')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambiar lanzamiento' })).toBeNull();
  });

  it('shows no dates until the room answers', async () => {
    const fake = fakeApp(waitingHud());
    fake.state.room = 'connecting';
    render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    const block = screen.getByRole('region', { name: 'Misión que sigues' });
    expect(within(block).getByText('Conectando con la misión…')).toBeTruthy();
    expect(within(block).queryByText('Despegue')).toBeNull();
  });

  it('after the crew launches the controls come back and behave as in any other mission', async () => {
    const fake = fakeApp(waitingHud());
    render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    fake.state.hud = { figure: { value: 'T − 3', caption: 'segundos para la ignición' }, side: { kind: 'readouts', items: [] }, waiting: false };
    await tick();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Detener' })).toBeTruthy();
    expect(screen.queryByText('Modo seguimiento: los controles de la misión los tiene la tripulación.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(fake.app.setPaused).toHaveBeenCalledWith(true);
  });

  it('keeps the controls in the other phases, where a click may be what moves the monitor on', async () => {
    const onAct = vi.fn();
    const hud: PhaseHud = {
      figure: { value: '80', caption: 'de 100' }, side: { kind: 'readouts', items: [] },
      primary: { id: 'preconfirm', label: 'Preconfirmar punto', run: onAct },
    };
    render(<MissionLayer app={fakeApp(hud, 'orbit').app} vr="no" onEnterVR={vi.fn()} room={monitor()} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Preconfirmar punto' }));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Detener' })).toBeTruthy();
  });
});

describe('follow dialog from the crew side', () => {
  it('opens from the header button and joins a valid code through joinRoom', async () => {
    const onJoin = vi.fn(() => true);
    render(<MissionLayer app={fakeApp(waitingHud({ detail: 'x' })).app} vr="no" onEnterVR={vi.fn()} room={crew({ onJoin })} />);
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir la misión' }));
    const dialog = screen.getByRole('dialog', { name: 'Seguir una misión' });
    fireEvent.change(within(dialog).getByLabelText('Código de seguimiento'), { target: { value: 'qrst' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
    expect(onJoin).toHaveBeenCalledWith('QRST');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('before launch, «Explora la misión tú mismo» closes the dialog and opens the planner', async () => {
    const onPlanning = vi.fn();
    render(<MissionLayer app={fakeApp(waitingHud({ detail: 'x' })).app} vr="no" onEnterVR={vi.fn()} room={crew()} onPlanning={onPlanning} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir la misión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explora la misión tú mismo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onPlanning).toHaveBeenCalledWith(true);
  });

  it('reports an invalid code and keeps the dialog open', async () => {
    const onJoin = vi.fn(() => false);
    render(<MissionLayer app={fakeApp(waitingHud()).app} vr="no" onEnterVR={vi.fn()} room={crew({ onJoin })} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir la misión' }));
    fireEvent.change(screen.getByLabelText('Código de seguimiento'), { target: { value: 'no valido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(screen.getByRole('alert').textContent).toBe('Código no válido');
    expect(screen.getByRole('dialog', { name: 'Seguir una misión' })).toBeTruthy();
  });
});

describe('the planner in the layer', () => {
  const launching = () => fakeApp(waitingHud({
    figure: { value: 'Listo', caption: 'para despegar' },
    detail: 'Quien te siga puede conectarse con el código ABCD antes de iniciar.',
    primary: { id: 'start', label: 'Comenzar despegue', run: vi.fn() },
  }));

  it('opens for the crew and disables Comenzar despegue and Entrar en VR while it is open', async () => {
    render(<MissionLayer app={launching().app} vr="yes" onEnterVR={vi.fn()} room={crew()} planning onPlanning={vi.fn()} />);
    await tick();
    expect(screen.getByRole('dialog', { name: 'Planifica tu lanzamiento' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Comenzar despegue' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Entrar en VR' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Seguir la misión' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('is not there when nobody asked for it, and the buttons are enabled', async () => {
    render(<MissionLayer app={launching().app} vr="yes" onEnterVR={vi.fn()} room={crew()} />);
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByRole('button', { name: 'Comenzar despegue' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Entrar en VR' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows Listo with the room code under it when the data is in', async () => {
    render(<MissionLayer app={launching().app} vr="no" onEnterVR={vi.fn()} room={crew()} />);
    await tick();
    expect(screen.getByTestId('figure').textContent).toBe('Listo');
    expect(screen.getByText('para despegar')).toBeTruthy();
    expect(screen.getByText('Quien te siga puede conectarse con el código ABCD antes de iniciar.')).toBeTruthy();
  });
});
