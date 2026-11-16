import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapcomController, CapcomSnapshot } from '@/lib/capcom/controller';
import type { LunarApp } from '@/lib/engine/app';
import { PHASE_LABELS, STATUS_LABELS, type PhaseHud } from '@/lib/engine/hud';
import { setLang } from '@/lib/i18n';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { textIn } from '@/lib/i18n/dict';
import { checkLaunch, formatPlanDate, launchFromLanding } from '@/lib/mission/launch-plan';
import { rankingNote } from '@/lib/mission/sites';
import { realMissionData } from '@/lib/mission/test-data';
import { CapcomButton, CapcomCaption } from './Capcom';
import { EMPTY_LOG, nextLog, seenOf, entryText } from './ControlRoom';
import FollowMissionDialog from './FollowMissionDialog';
import LaunchPlanner from './LaunchPlanner';
import MissionLayer from './MissionLayer';
import { announce, describeMission } from './mission';
import { fmtPlanDate } from './ui-text';
import type { HudSnapshot } from './useHudSnapshot';

afterEach(cleanup);
beforeEach(() => { setLang('en', { persist: false }); window.history.replaceState(null, '', '/'); });

describe('the Spanish dictionary repeats the texts of the library', () => {
  it('has the phase and status labels of hud.ts and the contrast notes of sites.ts', () => {
    setLang('es', { persist: false });
    for (const [id, label] of Object.entries(PHASE_LABELS)) expect(textIn(missionDict, 'es', `phase.${id}` as 'phase.launch')).toBe(label);
    for (const [id, label] of Object.entries(STATUS_LABELS)) expect(textIn(missionDict, 'es', `status.${id}` as 'status.viable')).toBe(label);
    for (const region of ['equatorial', 'mid-latitude', 'far-side'] as const) {
      expect(textIn(missionDict, 'es', `contrast.${region}`)).toBe(rankingNote({ region, crash: false }));
    }
    expect(textIn(missionDict, 'es', 'demo')).toBe('Demo · falla simulada del motor');
  });
});

describe('dates and mission text in English', () => {
  const landing = new Date(Date.UTC(2027, 0, 10, 0, 0));

  it('writes the plan date with the month first, in UTC and 24 h, and keeps Spanish as it was', () => {
    expect(fmtPlanDate(landing)).toBe('Jan 10, 2027 · 00:00 UTC');
    expect(fmtPlanDate(new Date(Date.UTC(2027, 3, 25, 18, 5)))).toBe('Apr 25, 2027 · 18:05 UTC');
    setLang('es', { persist: false });
    expect(fmtPlanDate(landing)).toBe(formatPlanDate(landing));
  });

  it('describes the mission and announces changes in English', () => {
    const mission = describeMission({ data: null, selected: null }, '');
    expect(mission.site).toBe('To be chosen in orbit');
    expect(mission.launch).toBe('Launch Jan 5, 2027 · 12:00 UTC');
    expect(mission.landing).toBe('Landing Jan 10, 2027 · 00:00 UTC');
    expect(announce({ phase: 'launch', mode: 'running' }, { phase: 'launch', mode: 'paused' })).toBe('Simulation paused.');
    expect(announce({ phase: 'launch', mode: 'running' }, { phase: 'orbit', mode: 'running' })).toBe('Phase 2 of 5: Orbit and ranking.');
  });
});

const hud = (waiting: boolean): PhaseHud => ({ figure: { value: 'T − 3', caption: '' }, side: { kind: 'readouts', items: [] }, waiting });

function view(over: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    phase: 'launch', mode: 'running', muted: false, hud: hud(false), mission: describeMission({ data: null, selected: null }, ''),
    roomOpen: true, site: null, ranking: [], moonKm: null, ...over,
  };
}

describe('the event log in English', () => {
  const at = new Date(Date.UTC(2027, 0, 1, 12, 0, 7));

  it('writes the entries in English and says them again when the language changes', () => {
    let s = nextLog(EMPTY_LOG, seenOf(view({ roomOpen: false })), 'ABCD', at);
    s = nextLog(s, seenOf(view()), 'ABCD', at);
    s = nextLog(s, seenOf(view({ phase: 'pov' })), 'ABCD', at);
    const texts = s.entries.map((e) => e.text);
    expect(texts).toContain('Connected to room ABCD');
    expect(texts).toContain('Launch started');
    expect(texts).toContain('Phase 3 of 5: Site view');
    const phase = s.entries.find((e) => e.key === 'log.phase')!;
    setLang('es', { persist: false });
    expect(entryText(phase.key, phase.vars)).toBe('Fase 3 de 5: Vista del sitio');
  });
});

function fakeApp() {
  return {
    get phase() { return { name: 'launch', controlHud: () => hud(true) }; },
    run: { mode: 'running' },
    audio: { muted: false, setMuted: vi.fn() },
    room: { status: 'open', send: vi.fn() },
    selected: null, ranking: [], data: null, setPaused: vi.fn(), stop: vi.fn(), restart: vi.fn(),
  } as unknown as LunarApp;
}

describe('the layers in English', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the crew bar, the phases and the mission block in English, and flips to Spanish with the language', async () => {
    render(<MissionLayer app={fakeApp()} vr="no" onEnterVR={vi.fn()} room={{ code: 'ABCD', isHost: true, onJoin: vi.fn(), onLeave: vi.fn() }} />);
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.getByRole('button', { name: 'Sound' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Follow the mission' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter VR' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Mission phases' })).toBeTruthy();
    const block = screen.getByRole('region', { name: 'Mission' });
    expect(within(block).getByText('Tracking code')).toBeTruthy();
    expect(within(block).getByText('Whoever enters it in “Follow the mission” will see your mission live.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    act(() => setLang('es', { persist: false }));
    expect(screen.getByRole('button', { name: 'Sonido' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });

  it('shows the control room of a follower in English', async () => {
    render(<MissionLayer app={fakeApp()} vr="no" onEnterVR={vi.fn()} room={{ code: 'WXYZ', isHost: false, onJoin: vi.fn(), onLeave: vi.fn() }} />);
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TOUCHDOWNTracking');
    for (const name of ['Mission you follow', 'Live telemetry', 'Landing site', 'Landing site ranking', 'Event log']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByRole('status', { name: 'Mission status' })).toBeTruthy();
    const pairs = screen.getByRole('region', { name: 'Mission you follow' });
    expect(within(pairs).getByText('Launch', { selector: 'dt' })).toBeTruthy();
    expect(within(pairs).getByText('Jan 5, 2027 · 12:00 UTC')).toBeTruthy();
    expect(within(pairs).getByText('4.5 days (assumed)')).toBeTruthy();
    expect(within(pairs).getByText('Earth–Moon distance at landing')).toBeTruthy();
    expect(screen.getByText('Follow mode: the crew holds the mission controls.')).toBeTruthy();
  });
});

describe('the launch planner in English', () => {
  const data = realMissionData();
  const mount = () => {
    const app = { data: { ...data }, room: { send: vi.fn() }, setLanding: vi.fn(() => true) } as unknown as LunarApp;
    render(<LaunchPlanner app={app} code="ABCD" onClose={vi.fn()} />);
  };

  it('has English texts, English dates and a ranked list of landing sites with English statuses', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Plan your launch' });
    expect(within(dialog).getByText('Before the mission')).toBeTruthy();
    expect(within(dialog).getByLabelText('Launch date')).toBeTruthy();
    expect(within(dialog).getByLabelText('Launch time (UTC)')).toBeTruthy();
    expect(within(dialog).getByTestId('planner-arrival').textContent).toBe('Jan 10, 2027 · 00:00 UTC');
    expect(within(dialog).getByText('Direct transit of 4.5 days (assumed)')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Best landing sites for that arrival' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.textContent).toMatch(/(Viable|Marginal|Not viable)$/);
    expect(within(dialog).getByText('Share it now: whoever enters it in “Follow the mission” will see your mission live.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy code' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Confirm launch' })).toBeTruthy();
  });

  it('explains an out-of-range arrival in English, and the Spanish text is the library message word for word', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Launch date'), { target: { value: '2035-01-01' } });
    expect(screen.getByRole('alert').textContent).toMatch(/^The landing \(Jan 6, 2035/);
    expect(screen.getByRole('alert').textContent).toMatch(/Launch between /);
    act(() => setLang('es', { persist: false }));
    const check = checkLaunch(launchFromLanding(new Date(Date.UTC(2035, 0, 6, 0))), data.ephemerisRange);
    expect(check.ok).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe(check.ok ? '' : check.message);
  });
});

describe('the follow dialog in English', () => {
  it('has English texts and errors', () => {
    render(<FollowMissionDialog code="ABCD" onJoin={() => false} onClose={vi.fn()} onExplore={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Follow a mission' })).toBeTruthy();
    expect(screen.getByText('It appears on the launching crew’s screen, in their mission panel, as “Tracking code”.')).toBeTruthy();
    const field = screen.getByLabelText('Tracking code');
    fireEvent.change(field, { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('alert').textContent).toBe('Invalid code');
    fireEvent.change(field, { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('alert').textContent).toBe('You are already in that room');
    expect(screen.getByRole('button', { name: 'Explore the mission yourself' })).toBeTruthy();
    act(() => setLang('es', { persist: false }));
    expect(screen.getByRole('alert').textContent).toBe('Ya estás en esa sala');
  });
});

describe('CAPCOM in English', () => {
  const BASE: CapcomSnapshot = { state: 'disconnected', talking: false, question: '', answer: '', answerFinal: false, message: null, mic: 'unknown' };
  function fake(initial: Partial<CapcomSnapshot>) {
    const snap = { ...BASE, ...initial };
    return { subscribe: () => () => {}, getSnapshot: () => snap, press: vi.fn(), release: vi.fn() } as unknown as CapcomController;
  }

  it('names the button, its hint and its status in English', () => {
    render(<CapcomButton controller={fake({ state: 'thinking' })} />);
    const button = screen.getByRole('button', { name: 'Talk to CAPCOM' });
    expect(button.getAttribute('title')).toBe('Talk to CAPCOM');
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Press and hold to talk. With the keyboard, hold the V key, or Space while the button has focus.');
    expect(screen.getByTestId('capcom-status').textContent).toBe('Thinking…');
  });

  it('translates the controller errors it knows and shows an unknown one as it came', () => {
    render(<CapcomButton controller={fake({ state: 'error', message: 'Permite el micrófono para hablar con CAPCOM.' })} />);
    expect(screen.getByTestId('capcom-status').textContent).toBe('Allow the microphone to talk to CAPCOM.');
    cleanup();
    render(<CapcomButton controller={fake({ state: 'error', message: 'otro' })} />);
    expect(screen.getByTestId('capcom-status').textContent).toBe('otro');
    cleanup();
    render(<CapcomButton controller={fake({ state: 'unavailable' })} />);
    expect(screen.getByRole('button', { name: 'CAPCOM unavailable' })).toBeTruthy();
  });

  it('labels the captions in English', () => {
    render(<CapcomCaption controller={fake({ question: 'hello', answer: 'copy' })} />);
    expect(screen.getByRole('region', { name: 'CAPCOM captions' })).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
  });
});
