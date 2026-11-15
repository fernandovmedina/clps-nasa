import { describe, expect, it } from 'vitest';
import {
  RunState, collectActions, countdownFigure, fmtInt, fmtLanding, fmtLatLon, fmtPercent, fmtSigned, groupThousands, signalDelayS,
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
