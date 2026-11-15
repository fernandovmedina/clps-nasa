import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import type { RoomStatus } from '@/lib/sync/room-client';
import MissionLayer from './MissionLayer';

const NBSP = String.fromCharCode(160);

afterEach(cleanup);

interface Fake {
  app: LunarApp;
  state: { phase: PhaseName; mode: RunMode; hud: PhaseHud; muted: boolean; room: RoomStatus };
  ran: string[];
}

function fakeApp(hud: PhaseHud, phase: PhaseName = 'launch'): Fake {
  const state = { phase, mode: 'running' as RunMode, hud, muted: false, room: 'open' as RoomStatus };
  const ran: string[] = [];
  const app = {
    get phase() { return { name: state.phase, controlHud: () => state.hud }; },
    run: { get mode() { return state.mode; } },
    audio: { get muted() { return state.muted; }, setMuted: (v: boolean) => { state.muted = v; } },
    room: { get status() { return state.room; }, send: vi.fn() },
    data: null,
    selected: null,
    ranking: [],
    setPaused: vi.fn((v: boolean) => { state.mode = v ? 'paused' : 'running'; }),
    stop: vi.fn(() => { state.mode = 'stopped'; }),
    restart: vi.fn(() => { state.mode = 'running'; state.phase = 'launch'; ran.push('restart'); }),
  } as unknown as LunarApp;
  return { app, state, ran };
}

const room = { code: 'ABCD', isHost: true, onJoin: vi.fn(), onLeave: vi.fn() };
const mount = (fake: Fake, vr: 'checking' | 'yes' | 'no' = 'no', over: Partial<React.ComponentProps<typeof MissionLayer>> = {}) =>
  render(<MissionLayer app={fake.app} vr={vr} onEnterVR={vi.fn()} room={room} {...over} />);
const tick = (ms = 150) => act(() => { vi.advanceTimersByTime(ms); });

const launchHud = (over: Partial<PhaseHud> = {}): PhaseHud => ({
  figure: { value: `64${NBSP}%`, caption: 'de los datos de la misión cargados' },
  progress: { value: 0.64, label: 'Carga de datos' },
  detail: 'Cargando topografía LOLA',
  side: { kind: 'readouts', items: [{ label: 'Altitud', value: '0.0 km' }, { label: 'Velocidad', value: '0.00 km/s' }] },
  ...over,
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('MissionLayer', () => {
  it('lists the five phases with the active one marked as the current step', async () => {
    const fake = fakeApp(launchHud(), 'pov');
    mount(fake);
    await tick();
    const list = screen.getByRole('list', { name: 'Fases de la misión' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null]);
    expect(items[2]!.textContent).toContain('Vista del sitio');
    expect(items[0]!.textContent).toContain('(completada)');
  });

  it('drops the visible brand but keeps TOUCHDOWN as the page heading for screen readers', async () => {
    mount(fakeApp(launchHud()));
    await tick();
    const h1 = screen.getByRole('heading', { level: 1, name: 'TOUCHDOWN' });
    expect(h1.className).toContain('sr');
    expect(screen.queryByText('La misión, paso a paso')).toBeNull();
  });

  it('makes Mission Control a button, not a link, and keeps a link to the analysis in the mission block', async () => {
    mount(fakeApp(launchHud()));
    await tick();
    expect(screen.queryByRole('link', { name: 'Mission Control' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mission Control' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Análisis de sitios y fechas' }).getAttribute('href')).toBe('/mission-control/');
    expect(screen.queryByRole('link', { name: 'Cambiar fecha o sitio' })).toBeNull();
  });

  it('shows the real plan in the mission block: launch, arrival and the room code in a box', async () => {
    mount(fakeApp(launchHud()));
    await tick();
    const block = screen.getByRole('region', { name: 'Misión' });
    expect(within(block).getByText('Despegue 5 ene 2027 · 12:00 UTC')).toBeTruthy();
    expect(within(block).getByText('Llegada 10 ene 2027 · 00:00 UTC')).toBeTruthy();
    expect(within(block).getByText('Código Mission Control')).toBeTruthy();
    expect(within(block).getByTestId('room-code').textContent).toBe('ABCD');
    expect(screen.queryByText('Unirse a otra sala')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Código de sala' })).toBeNull();
  });

  it('before the launch starts: Cambiar lanzamiento reopens the planner and the analysis link is hidden', async () => {
    const onPlanning = vi.fn();
    mount(fakeApp(launchHud({ waiting: true, primary: { id: 'start', label: 'Comenzar despegue', run: vi.fn() } })), 'no', { onPlanning });
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar lanzamiento' }));
    expect(onPlanning).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('link', { name: 'Análisis de sitios y fechas' })).toBeNull();
  });

  it('after the launch has started Cambiar lanzamiento is gone and the analysis link is back', async () => {
    const fake = fakeApp(launchHud({ waiting: true }));
    mount(fake);
    await tick();
    expect(screen.getByRole('button', { name: 'Cambiar lanzamiento' })).toBeTruthy();
    fake.state.hud = launchHud({ waiting: false });
    await tick();
    expect(screen.queryByRole('button', { name: 'Cambiar lanzamiento' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Análisis de sitios y fechas' })).toBeTruthy();
  });

  it('never offers Cambiar lanzamiento outside the launch', async () => {
    mount(fakeApp(launchHud({ waiting: true }), 'orbit'));
    await tick();
    expect(screen.queryByRole('button', { name: 'Cambiar lanzamiento' })).toBeNull();
  });

  it('shows the phase figure, caption, progress and readouts', async () => {
    mount(fakeApp(launchHud()));
    await tick();
    expect(screen.getByText(/^64\s%$/)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Carga de datos' }).getAttribute('aria-valuenow')).toBe('64');
    expect(screen.getByText('Altitud')).toBeTruthy();
  });

  it('pauses from the button: the label becomes Reanudar, the pill shows and phase actions lock', async () => {
    const fake = fakeApp(launchHud({ primary: { id: 'go', label: 'Hacer algo', run: vi.fn() } }), 'orbit');
    mount(fake);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await tick();
    expect(fake.app.setPaused).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy();
    expect(screen.getByText('En pausa')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Hacer algo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Simulación pausada.');

    fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
    await tick();
    expect(fake.app.setPaused).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    expect(screen.queryByText('En pausa')).toBeNull();
  });

  it('stops: shows the stopped card, drops the controls and restarts on demand', async () => {
    const fake = fakeApp(launchHud(), 'orbit');
    mount(fake);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Detener' }));
    await tick();
    expect(fake.app.stop).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Misión detenida' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    expect(screen.getByText('fase de órbita y ranking')).toBeTruthy();
    const items = within(screen.getByRole('list', { name: 'Fases de la misión' })).getAllByRole('listitem');
    expect(items.some((li) => li.getAttribute('aria-current') === 'step')).toBe(false);
    const card = screen.getByRole('region', { name: 'Misión detenida' });
    expect(within(card).getByRole('link', { name: 'Análisis de sitios y fechas' }).getAttribute('href')).toBe('/mission-control/');

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar desde el despegue' }));
    await tick();
    expect(fake.app.restart).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Misión detenida' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });

  it('waits for the start button: Comenzar despegue is the primary action and Pausar is disabled', async () => {
    const start = vi.fn();
    const fake = fakeApp(launchHud({ waiting: true, primary: { id: 'start', label: 'Comenzar despegue', run: start } }));
    mount(fake);
    await tick();
    expect((screen.getByRole('button', { name: 'Pausar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar despegue' }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('moves the focus to Pausar once the start button has gone', async () => {
    const fake = fakeApp(launchHud({ waiting: true, primary: { id: 'start', label: 'Comenzar despegue', run: vi.fn() } }));
    mount(fake);
    await tick();
    screen.getByRole('button', { name: 'Comenzar despegue' }).focus();
    fake.state.hud = launchHud({ waiting: false });
    await tick();
    expect(screen.queryByRole('button', { name: 'Comenzar despegue' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pausar' }));
  });

  it('selects a site from the ranking and keeps the pressed state in sync', async () => {
    const select = vi.fn();
    const rows = [
      { id: 'site-a', rank: 1, name: 'Shackleton Connecting Ridge', score: 95, status: 'viable' as const, selected: true, run: select },
      { id: 'site-b', rank: 2, name: 'Malapert A (IM-1 Odysseus)', score: 74, status: 'marginal' as const, selected: false, run: select },
    ];
    const fake = fakeApp(launchHud({ side: { kind: 'ranking', title: 'Sitios candidatos', rows } }), 'orbit');
    mount(fake);
    await tick();
    const buttons = within(screen.getByRole('list', { name: 'Ranking de sitios' })).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    fireEvent.click(buttons[1]!);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('toggles the sound with aria-pressed', async () => {
    const fake = fakeApp(launchHud());
    mount(fake);
    await tick();
    const sound = screen.getByRole('button', { name: 'Sonido' });
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sound);
    await tick();
    expect(screen.getByRole('button', { name: 'Sonido' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('announces a phase change politely and never the changing figures', async () => {
    const fake = fakeApp(launchHud());
    mount(fake);
    await tick();
    expect(screen.getByRole('status').textContent).toBe('');
    fake.state.phase = 'orbit';
    await tick();
    expect(screen.getByRole('status').textContent).toBe('Fase 2 de 5: Órbita y ranking.');
    fake.state.hud = launchHud({ figure: { value: `70${NBSP}%`, caption: '' } });
    await tick();
    expect(screen.getByRole('status').textContent).toBe('Fase 2 de 5: Órbita y ranking.');
  });

  it('keeps Entrar en VR inert and explained when the browser has no VR', async () => {
    mount(fakeApp(launchHud()), 'no');
    await tick();
    const vr = screen.getByRole('button', { name: 'Entrar en VR' });
    expect(vr.getAttribute('aria-disabled')).toBe('true');
    expect(vr.getAttribute('aria-describedby')).toBe('vr-unavailable');
  });
});

describe('MissionLayer rendering cost', () => {
  it('does not re-render when the socket flips between connecting and closed, as it does with no server', async () => {
    const fake = fakeApp(launchHud());
    let commits = 0;
    render(
      <Profiler id="layer" onRender={() => { commits++; }}>
        <MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room} />
      </Profiler>,
    );
    fake.state.room = 'closed';
    await tick();
    const settled = commits;
    for (const status of ['connecting', 'closed', 'connecting', 'closed'] as const) {
      fake.state.room = status;
      await tick(2000);
    }
    expect(commits).toBe(settled);
    fake.state.room = 'open';
    await tick();
    expect(commits).toBe(settled + 1);
  });

  it('does not re-render while nothing it paints changes, however often it polls', async () => {
    const fake = fakeApp(launchHud());
    let commits = 0;
    render(
      <Profiler id="layer" onRender={() => { commits++; }}>
        <MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room} />
      </Profiler>,
    );
    await tick();
    const settled = commits;
    expect(settled).toBeGreaterThanOrEqual(1);
    await tick(5000);
    expect(commits).toBe(settled);
  });

  it('re-renders once per painted change, not once per poll', async () => {
    const fake = fakeApp(launchHud());
    let commits = 0;
    render(
      <Profiler id="layer" onRender={() => { commits++; }}>
        <MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room} />
      </Profiler>,
    );
    await tick();
    const settled = commits;
    fake.state.hud = launchHud({ figure: { value: `65${NBSP}%`, caption: 'de los datos de la misión cargados' } });
    await tick(1000);
    expect(commits).toBe(settled + 1);
  });
});
