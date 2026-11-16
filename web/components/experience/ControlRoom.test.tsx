import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import type { RoomStatus } from '@/lib/sync/room-client';
import { EMPTY_LOG, nextLog, readingsOf, seenOf } from './ControlRoom';
import MissionLayer from './MissionLayer';
import type { HudSnapshot } from './useHudSnapshot';

afterEach(cleanup);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const WAITING = 'Conectado. El despegue empezará aquí en cuanto la tripulación pulse «Comenzar despegue».';

const metrics = (id: string, rank: number, name: string, score: number, status: 'viable' | 'marginal' | 'not_viable') => ({
  site: { id, name }, rank, score, status,
  sun: { elevation: 1.84, aboveHorizon: 1.2 }, earth: { elevation: 4.52, aboveHorizon: 3 },
  hoursToSunset: 120, hoursToEarthset: 30,
});

interface State { phase: PhaseName; mode: RunMode; hud: PhaseHud; room: RoomStatus; selected: unknown; ranking: unknown[] }

function fakeApp(hud: PhaseHud, phase: PhaseName = 'launch') {
  const state: State = { phase, mode: 'running', hud, room: 'open', selected: null, ranking: [] };
  const app = {
    get phase() { return { name: state.phase, controlHud: () => state.hud }; },
    run: { get mode() { return state.mode; } },
    audio: { muted: false, setMuted: vi.fn() },
    room: { get status() { return state.room; }, send: vi.fn() },
    get selected() { return state.selected; },
    get ranking() { return state.ranking; },
    data: null,
    setPaused: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  } as unknown as LunarApp;
  return { app, state };
}

const monitor = (onLeave = vi.fn()) => ({ code: 'WXYZ', isHost: false, onJoin: vi.fn(), onLeave });
const tick = (ms = 150) => act(() => { vi.advanceTimersByTime(ms); });
const mount = (fake: ReturnType<typeof fakeApp>, room = monitor()) => render(<MissionLayer app={fake.app} vr="no" onEnterVR={vi.fn()} room={room} />);

const waitingHud = (): PhaseHud => ({
  figure: { value: 'En espera', caption: '' }, detail: WAITING, side: { kind: 'readouts', items: [] }, waiting: true,
});
const flyingHud = (alt: string): PhaseHud => ({
  figure: { value: 'T − 3', caption: 'segundos para la ignición' },
  progress: { value: 0.4, label: 'Carga de datos', text: '40 %' },
  detail: 'Datos listos',
  side: { kind: 'readouts', items: [{ label: 'Altitud', value: alt }, { label: 'Velocidad', value: '0.00 km/s' }, { label: 'Distancia a la Luna', value: '384 400 km' }] },
  waiting: false,
});

describe('ControlRoom', () => {
  it('replaces the floating panels for the monitor, and is not there for the crew', async () => {
    mount(fakeApp(waitingHud()));
    await tick();
    expect(screen.getByRole('status', { name: 'Estado de la misión' })).toBeTruthy();
    for (const name of ['Misión que sigues', 'Telemetría en vivo', 'Sitio', 'Ranking de sitios', 'Registro de eventos']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TOUCHDOWNMission Control');
    expect(screen.getByText('Datos: NASA LOLA · JPL Horizons')).toBeTruthy();
    expect(screen.queryByLabelText('Datos de la fase')).toBeNull();
    cleanup();

    mount(fakeApp(waitingHud()), { code: 'ABCD', isHost: true, onJoin: vi.fn(), onLeave: vi.fn() });
    await tick();
    expect(screen.queryByRole('region', { name: 'Telemetría en vivo' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Registro de eventos' })).toBeNull();
  });

  it('shows En espera in a status region before the launch and offers no local controls', async () => {
    mount(fakeApp(waitingHud()));
    await tick();
    const panel = screen.getByRole('status', { name: 'Estado de la misión' });
    expect(within(panel).getByTestId('figure').textContent).toBe('En espera');
    expect(within(panel).getByText(WAITING)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Control local' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
  });

  it('shows the readings of the phase as chips and follows the snapshot', async () => {
    const fake = fakeApp(flyingHud('12.0 km'));
    mount(fake);
    await tick();
    const telemetry = screen.getByRole('region', { name: 'Telemetría en vivo' });
    expect(within(telemetry).getByText('Altitud').nextSibling?.textContent).toBe('12.0 km');
    expect(within(telemetry).getByText('Velocidad').nextSibling?.textContent).toBe('0.00 km/s');
    expect(within(telemetry).getByText('Distancia a la Luna').nextSibling?.textContent).toBe('384 400 km');

    fake.state.hud = flyingHud('48.5 km');
    await tick();
    expect(within(screen.getByRole('region', { name: 'Telemetría en vivo' })).getByText('Altitud').nextSibling?.textContent).toBe('48.5 km');
  });

  it('keeps the local controls, as before, once the launch has started', async () => {
    const fake = fakeApp(flyingHud('1.0 km'));
    mount(fake);
    await tick();
    const local = screen.getByRole('region', { name: 'Control local' });
    fireEvent.click(within(local).getByRole('button', { name: 'Pausar' }));
    expect(fake.app.setPaused).toHaveBeenCalledWith(true);
    expect(within(local).getByRole('button', { name: 'Detener' })).toBeTruthy();
  });

  it('shows the site, its score and badge, and the top five of the ranking', async () => {
    const fake = fakeApp(flyingHud('1.0 km'), 'orbit');
    fake.state.selected = metrics('a', 2, 'Malapert A (IM-1 Odysseus)', 74.4, 'marginal');
    fake.state.ranking = [
      metrics('s', 1, 'Shackleton Connecting Ridge', 95, 'viable'), metrics('a', 2, 'Malapert A (IM-1 Odysseus)', 74.4, 'marginal'),
      metrics('c', 3, 'C', 60, 'marginal'), metrics('d', 4, 'D', 50, 'not_viable'), metrics('e', 5, 'E', 40, 'not_viable'), metrics('f', 6, 'F', 30, 'not_viable'),
    ];
    mount(fake);
    await tick();
    const site = screen.getByRole('region', { name: 'Sitio' });
    expect(within(site).getByText('Malapert A (IM-1 Odysseus)')).toBeTruthy();
    expect(within(site).getByText('74')).toBeTruthy();
    expect(within(site).getByText('Marginal')).toBeTruthy();
    expect(within(site).getByText('1.84°')).toBeTruthy();
    expect(within(site).getByText('Sí')).toBeTruthy();
    const rows = within(screen.getByRole('region', { name: 'Ranking de sitios' })).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.textContent).toContain('Shackleton Connecting Ridge');
    expect(rows[0]!.textContent).toContain('Viable');
  });

  it('shows NO CAER as a demo, with no score and no status, in the site card and in the ranking', async () => {
    const demo = { ...metrics('no-caer', 3, 'NO CAER', 0, 'not_viable'), site: { id: 'no-caer', name: 'NO CAER', crash: true, region: undefined } };
    const contrast = { ...metrics('equ', 2, 'Sitio ecuatorial', 40, 'marginal'), site: { id: 'equ', name: 'Sitio ecuatorial', region: 'equatorial' } };
    const fake = fakeApp(flyingHud('1.0 km'), 'orbit');
    fake.state.selected = demo;
    fake.state.ranking = [metrics('s', 1, 'Shackleton Connecting Ridge', 95, 'viable'), contrast, demo];
    mount(fake);
    await tick();
    const site = screen.getByRole('region', { name: 'Sitio' });
    expect(within(site).getByText('NO CAER')).toBeTruthy();
    expect(within(site).getByText('Demo · falla simulada del motor')).toBeTruthy();
    expect(within(site).queryByText('No viable')).toBeNull();
    expect(within(site).queryByText('de 100')).toBeNull();
    expect(within(site).queryByText('0')).toBeNull();
    const rows = within(screen.getByRole('region', { name: 'Ranking de sitios' })).getAllByRole('listitem');
    expect(rows[2]!.textContent).toContain('NO CAER');
    expect(rows[2]!.textContent).toContain('Demo · falla simulada del motor');
    expect(rows[2]!.textContent).not.toContain('No viable');
    expect(rows[2]!.textContent).not.toMatch(/\b0\b/);
    expect(rows[1]!.textContent).toContain('Contraste · ecuatorial');
    expect(rows[1]!.textContent).toContain('Marginal');
  });

  it('says the site is still to choose before the orbit', async () => {
    mount(fakeApp(waitingHud()));
    await tick();
    expect(within(screen.getByRole('region', { name: 'Sitio' })).getByText('Por elegir en la órbita')).toBeTruthy();
  });

  it('adds a log entry when the phase changes, and when the mission pauses', async () => {
    const fake = fakeApp(waitingHud());
    mount(fake);
    await tick();
    const log = screen.getByRole('log');
    expect(within(log).getByText('Conectado a la sala WXYZ')).toBeTruthy();
    expect(within(log).queryByText(/Fase 2 de 5/)).toBeNull();

    fake.state.hud = flyingHud('1.0 km');
    await tick();
    expect(within(screen.getByRole('log')).getByText('Despegue iniciado')).toBeTruthy();

    fake.state.phase = 'orbit';
    await tick();
    expect(within(screen.getByRole('log')).getByText('Fase 2 de 5: Órbita y ranking')).toBeTruthy();

    fake.state.mode = 'paused';
    await tick();
    expect(within(screen.getByRole('log')).getByText('Misión en pausa')).toBeTruthy();
  });

  it('Salir calls onLeave', async () => {
    const onLeave = vi.fn();
    mount(fakeApp(waitingHud()), monitor(onLeave));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('nextLog', () => {
  const view = (over: Partial<HudSnapshot> = {}): HudSnapshot => ({
    phase: 'launch', mode: 'running', muted: false, hud: waitingHud(),
    mission: { site: 'Por elegir en la órbita', launch: 'Despegue 5 ene 2027 · 12:00 UTC', landing: 'Llegada 10 ene 2027 · 00:00 UTC' },
    roomOpen: false, site: null, ranking: [], moonKm: null, ...over,
  });
  const at = new Date('2027-01-05T12:00:07Z');

  it('stays quiet until the room opens, then logs the connection and the plan with a UTC time', () => {
    const quiet = nextLog(EMPTY_LOG, seenOf(view()), 'ABCD', at);
    expect(quiet.entries).toEqual([]);
    const open = nextLog(quiet, seenOf(view({ roomOpen: true })), 'ABCD', at);
    expect(open.entries.map((e) => e.text)).toEqual([
      'Plan recibido · Despegue 5 ene 2027 · 12:00 UTC · Llegada 10 ene 2027 · 00:00 UTC',
      'Conectado a la sala ABCD',
    ]);
    expect(open.entries[0]!.at).toBe('12:00:07 UTC');
  });

  it('returns the same state when nothing changed, so it never loops', () => {
    const first = nextLog(EMPTY_LOG, seenOf(view({ roomOpen: true })), 'ABCD', at);
    expect(nextLog(first, seenOf(view({ roomOpen: true })), 'ABCD', at)).toBe(first);
  });

  it('logs a new plan, the start once, the site, and the pause and stop', () => {
    let s = nextLog(EMPTY_LOG, seenOf(view({ roomOpen: true })), 'ABCD', at);
    s = nextLog(s, seenOf(view({ roomOpen: true, mission: { site: '', launch: 'Despegue 20 ene 2027 · 12:00 UTC', landing: 'Llegada 25 ene 2027 · 00:00 UTC' } })), 'ABCD', at);
    expect(s.entries[0]!.text).toContain('Plan recibido · Despegue 20 ene 2027');
    s = nextLog(s, seenOf(view({ roomOpen: true, hud: { ...waitingHud(), waiting: false } })), 'ABCD', at);
    expect(s.entries[0]!.text).toBe('Despegue iniciado');
    s = nextLog(s, seenOf(view({ roomOpen: true, phase: 'pov', hud: { ...waitingHud(), waiting: false }, site: { name: 'Malapert A', score: 70, status: 'marginal', sunElevation: 1, earthElevation: 2, earthVisible: true, sunHours: '4 h', earthHours: '3 h' } })), 'ABCD', at);
    expect(s.entries.slice(0, 2).map((e) => e.text)).toEqual(['Sitio elegido: Malapert A', 'Fase 3 de 5: Vista del sitio']);
    s = nextLog(s, seenOf(view({ roomOpen: true, phase: 'pov', mode: 'stopped', hud: null })), 'ABCD', at);
    expect(s.entries[0]!.text).toBe('Misión detenida');
    expect(s.entries.filter((e) => e.text === 'Despegue iniciado')).toHaveLength(1);
  });

  it('keeps the last eight entries, newest first', () => {
    let s = nextLog(EMPTY_LOG, seenOf(view({ roomOpen: true })), 'ABCD', at);
    for (let i = 0; i < 12; i++) s = nextLog(s, seenOf(view({ roomOpen: true, mode: i % 2 ? 'running' : 'paused' })), 'ABCD', at);
    expect(s.entries).toHaveLength(8);
    expect(s.entries[0]!.id).toBeGreaterThan(s.entries[7]!.id);
  });

  it('logs the start for a monitor that arrives after the launch', () => {
    const s = nextLog(EMPTY_LOG, seenOf(view({ roomOpen: true, phase: 'orbit', hud: { ...waitingHud(), waiting: false } })), 'ABCD', at);
    expect(s.entries.map((e) => e.text)).toContain('Despegue iniciado');
  });
});

describe('readingsOf', () => {
  it('lists readouts, sky blocks with their extras, and the facts', () => {
    expect(readingsOf(null)).toEqual([]);
    const hud: PhaseHud = {
      figure: { value: '1', caption: '' }, facts: [{ label: 'Tierra visible', value: '60 %' }],
      side: { kind: 'sky', blocks: [{ kind: 'sun', label: 'Sol · energía', value: '3.00°', detail: 'sobre el horizonte', share: 1, shareLabel: '' }], extras: [{ label: 'Potencia solar', value: '100 %' }] },
    };
    expect(readingsOf(hud)).toEqual([
      { label: 'Sol · energía', value: '3.00° sobre el horizonte' }, { label: 'Potencia solar', value: '100 %' }, { label: 'Tierra visible', value: '60 %' },
    ]);
  });
});
