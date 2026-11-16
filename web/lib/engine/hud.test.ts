import { describe, expect, it } from 'vitest';
import { setLang } from '@/lib/i18n';
import {
  PHASE_LABELS, PHASE_ORDER, RunState, STATUS_LABELS, collectActions, countdownFigure, fmtInt, fmtLanding, fmtLatLon, fmtPercent, fmtSigned, groupThousands, signalDelayS,
  type PhaseHud,
} from './hud';

const NBSP = String.fromCharCode(160);

describe('RunState', () => {
  it('starts running and only simulates while running', () => {
    const run = new RunState();
    expect(run.mode).toBe('running');
    expect(run.step(0.05)).toBe(0.05);
    expect(run.simulating).toBe(true);
  });

  it('pausing freezes the step and resuming brings it back', () => {
    const run = new RunState();
    expect(run.pause()).toBe(true);
    expect(run.paused).toBe(true);
    expect(run.step(0.05)).toBe(0);
    expect(run.pause()).toBe(false);
    expect(run.resume()).toBe(true);
    expect(run.step(0.05)).toBe(0.05);
    expect(run.resume()).toBe(false);
  });

  it('stop works from running and from paused, and cannot be paused or resumed afterwards', () => {
    const fromRunning = new RunState();
    expect(fromRunning.stop()).toBe(true);
    expect(fromRunning.stopped).toBe(true);
    expect(fromRunning.pause()).toBe(false);
    expect(fromRunning.resume()).toBe(false);
    expect(fromRunning.step(1)).toBe(0);
    expect(fromRunning.stop()).toBe(false);

    const fromPaused = new RunState();
    fromPaused.pause();
    expect(fromPaused.stop()).toBe(true);
    expect(fromPaused.mode).toBe('stopped');
  });

  it('restart goes back to running from any mode', () => {
    for (const setup of [(r: RunState) => r.pause(), (r: RunState) => r.stop(), () => undefined]) {
      const run = new RunState();
      setup(run);
      run.restart();
      expect(run.mode).toBe('running');
      expect(run.step(0.1)).toBe(0.1);
    }
  });
});

describe('number formatting', () => {
  it('groups thousands with a non-breaking space and leaves decimals alone', () => {
    expect(groupThousands('384,400 km')).toBe(`384${NBSP}400 km`);
    expect(groupThousands('1,234,567 km')).toBe(`1${NBSP}234${NBSP}567 km`);
    expect(groupThousands('12.5 km')).toBe('12.5 km');
    expect(fmtInt(404378.4)).toBe(`404${NBSP}378`);
    expect(fmtInt(999)).toBe('999');
  });

  it('uses a real minus sign and never prints negative zero', () => {
    expect(fmtSigned(-7.854, 2)).toBe('−7.85');
    expect(fmtSigned(8.591, 2)).toBe('8.59');
    expect(fmtSigned(-0.001, 2)).toBe('0.00');
    expect(fmtSigned(0, 1)).toBe('0.0');
  });

  it('formats percentages, dates and coordinates the way the interface shows them', () => {
    expect(fmtPercent(63.6)).toBe(`64${NBSP}%`);
    expect(fmtLanding(new Date(Date.UTC(2027, 0, 10, 0, 0)))).toBe('10 ene 2027 · 00:00 UTC');
    expect(fmtLanding(new Date(Date.UTC(2026, 10, 1, 9, 5)))).toBe('1 nov 2026 · 09:05 UTC');
    expect(fmtLatLon(-80.13, 1.44)).toBe('−80.13°, 1.44° E');
    expect(fmtLatLon(-84.79, -29.2)).toBe('−84.79°, 29.20° W');
  });

  it('turns the launch countdown labels into a headline figure', () => {
    expect(countdownFigure('T-3')).toEqual({ value: 'T − 3', caption: 'segundos para la ignición' });
    expect(countdownFigure('IGNICIÓN')?.value).toBe('Ignición');
    expect(countdownFigure('DESPEGUE')?.value).toBe('Despegue');
    expect(countdownFigure('')).toBeNull();
  });
});

describe('signalDelayS', () => {
  it('is the distance over the speed of light', () => {
    expect(signalDelayS(299792.458)).toBeCloseTo(1, 10);
    expect(signalDelayS(404378)).toBeCloseTo(1.349, 3);
  });
});

describe('collectActions', () => {
  const noop = () => undefined;
  const hud: PhaseHud = {
    figure: { value: '74', caption: '' },
    side: { kind: 'ranking', title: 'Sitios', rows: [{ id: 'site-a', rank: 1, name: 'A', score: 90, status: 'viable', selected: false, run: noop }] },
    toggles: { label: 'Retraso', options: [{ id: 'delay-7', label: '+7 d', pressed: false, run: noop }, { id: 'delay-off', label: 'x', pressed: false }] },
    secondary: [{ id: 'back', label: 'Atrás', run: noop }],
    primary: { id: 'go', label: 'Ir', run: noop },
  };

  it('finds every callable by id and skips entries without a run', () => {
    expect([...collectActions(hud).keys()].sort()).toEqual(['back', 'delay-7', 'go', 'site-a']);
  });

  it('also finds the risk-marking buttons of the site view', () => {
    const sky: PhaseHud = {
      figure: { value: 'Iluminado', caption: '' },
      side: { kind: 'sky', blocks: [], marks: { label: 'Marcar riesgo', options: [{ id: 'mark-rock', label: 'Roca', run: noop }, { id: 'mark-slope', label: 'Pendiente' }] } },
    };
    expect([...collectActions(sky).keys()]).toEqual(['mark-rock']);
  });

  it('serializes without the functions, so the painted data is what gets compared', () => {
    const text = JSON.stringify(hud);
    expect(text).toContain('"id":"go"');
    expect(text).not.toContain('run');
  });
});

describe('shared labels in Spanish and English', () => {
  it('PHASE_LABELS and STATUS_LABELS read in Spanish by default, with the same shape as before', () => {
    expect(PHASE_ORDER.map((id) => PHASE_LABELS[id])).toEqual(['Despegue', 'Órbita y ranking', 'Vista del sitio', 'Alunizaje', 'Transmisión']);
    expect(STATUS_LABELS).toEqual({ viable: 'Viable', marginal: 'Marginal', not_viable: 'No viable' });
    expect(Object.keys(PHASE_LABELS)).toEqual(PHASE_ORDER);
  });

  it('resolve the language when read, so a held reference follows a language change', () => {
    const labels = PHASE_LABELS;
    expect(labels.landing).toBe('Alunizaje');
    setLang('en', { persist: false });
    expect(labels.landing).toBe('Landing');
    expect(PHASE_ORDER.map((id) => PHASE_LABELS[id])).toEqual(['Launch', 'Orbit & ranking', 'Site view', 'Landing', 'Transmission']);
    expect(STATUS_LABELS).toEqual({ viable: 'Viable', marginal: 'Marginal', not_viable: 'Not viable' });
    expect(STATUS_LABELS.not_viable.toLowerCase()).toBe('not viable');
  });

  it('countdownFigure speaks both languages and accepts either phase label', () => {
    expect(countdownFigure('T-3')).toEqual({ value: 'T − 3', caption: 'segundos para la ignición' });
    expect(countdownFigure('IGNICIÓN')).toEqual({ value: 'Ignición', caption: 'encendido de motores' });
    expect(countdownFigure('DESPEGUE')).toEqual({ value: 'Despegue', caption: 'rumbo a la Luna' });
    setLang('en', { persist: false });
    expect(countdownFigure('T-3')).toEqual({ value: 'T − 3', caption: 'seconds to ignition' });
    expect(countdownFigure('IGNICIÓN')).toEqual({ value: 'Ignition', caption: 'engine start' });
    expect(countdownFigure('IGNITION')).toEqual({ value: 'Ignition', caption: 'engine start' });
    expect(countdownFigure('DESPEGUE')).toEqual({ value: 'Liftoff', caption: 'bound for the Moon' });
    expect(countdownFigure('LIFTOFF')).toEqual({ value: 'Liftoff', caption: 'bound for the Moon' });
    expect(countdownFigure('otra cosa')).toBeNull();
  });

  it('formats numbers, percentages and the landing date with the language in use', () => {
    const date = new Date('2027-01-10T00:00:00Z');
    expect(fmtInt(404378.4)).toBe(`404${NBSP}378`);
    expect(fmtPercent(58.4)).toBe(`58${NBSP}%`);
    expect(fmtLanding(date)).toBe('10 ene 2027 · 00:00 UTC');
    setLang('en', { persist: false });
    expect(fmtInt(404378.4)).toBe('404,378');
    expect(fmtInt(999)).toBe('999');
    expect(groupThousands('384,400 km')).toBe('384,400 km');
    expect(fmtPercent(58.4)).toBe('58%');
    expect(fmtLanding(date)).toBe('Jan 10, 2027 · 00:00 UTC');
    expect(fmtLanding(new Date('2027-12-03T07:05:00Z'))).toBe('Dec 3, 2027 · 07:05 UTC');
    expect(fmtLatLon(-89.5, -12.25)).toBe('−89.50°, 12.25° W');
  });
});
