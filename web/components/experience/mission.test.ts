import { describe, expect, it } from 'vitest';
import type { SiteMetrics } from '@/lib/mission/scoring';
import type { MissionData } from '@/lib/mission/sites';
import type { PhaseHud } from '@/lib/engine/hud';
import { announce, describeMission, paintedHud } from './mission';

const data = (over: Partial<MissionData> = {}): MissionData => ({
  landingDate: new Date(Date.UTC(2027, 0, 10, 0, 0)),
  sites: [{ id: 'malapert-a', name: 'Malapert A (IM-1 Odysseus)' }] as MissionData['sites'],
  global: {} as MissionData['global'],
  ephemerisRange: { start: new Date(Date.UTC(2026, 10, 1)), end: new Date(Date.UTC(2027, 11, 31)) },
  ...over,
});
const picked = (name: string) => ({ site: { name } }) as unknown as SiteMetrics;

describe('describeMission', () => {
  it('reads the landing date and the site from the URL before the data has loaded', () => {
    const info = describeMission({ data: null, selected: null }, '?landing=2027-01-24T12:00:00Z&site=malapert-a&room=ABCD');
    expect(info.launch).toBe('Despegue 20 ene 2027 · 00:00 UTC');
    expect(info.landing).toBe('Llegada 24 ene 2027 · 12:00 UTC');
    expect(info.site).toBe('Cargando sitio…');
  });

  it('asks for a site in the orbit when the URL names none', () => {
    const info = describeMission({ data: null, selected: null }, '');
    expect(info.site).toBe('Por elegir en la órbita');
  });

  it('shows the default plan, launching 4.5 days before, while nothing says otherwise', () => {
    const info = describeMission({ data: null, selected: null }, '');
    expect(info.launch).toBe('Despegue 5 ene 2027 · 12:00 UTC');
    expect(info.landing).toBe('Llegada 10 ene 2027 · 00:00 UTC');
  });

  it('ignores a malformed landing parameter', () => {
    expect(describeMission({ data: null, selected: null }, '?landing=mañana').landing).toBe('Llegada 10 ene 2027 · 00:00 UTC');
  });

  it('shows the requested catalog site and the loaded landing date once the data is in', () => {
    const info = describeMission({ data: data({ requestedSiteId: 'malapert-a' }), selected: null }, '?site=malapert-a');
    expect(info).toEqual({ site: 'Malapert A (IM-1 Odysseus)', launch: 'Despegue 5 ene 2027 · 12:00 UTC', landing: 'Llegada 10 ene 2027 · 00:00 UTC' });
  });

  it('prefers the site picked in the ranking and follows a delayed landing date', () => {
    const delayed = data({ requestedSiteId: 'malapert-a', landingDate: new Date(Date.UTC(2027, 0, 31, 0, 0)) });
    const info = describeMission({ data: delayed, selected: picked('Mons Mouton (IM-2 Athena)') }, '');
    expect(info.site).toBe('Mons Mouton (IM-2 Athena)');
    expect(info.launch).toBe('Despegue 26 ene 2027 · 12:00 UTC');
    expect(info.landing).toBe('Llegada 31 ene 2027 · 00:00 UTC');
  });
});

describe('announce', () => {
  const at = (phase: Parameters<typeof announce>[0]['phase'], mode: Parameters<typeof announce>[0]['mode']) => ({ phase, mode });

  it('says nothing when nothing changed', () => {
    expect(announce(at('launch', 'running'), at('launch', 'running'))).toBe('');
  });

  it('announces pause, resume, stop and restart', () => {
    expect(announce(at('launch', 'running'), at('launch', 'paused'))).toBe('Simulación pausada.');
    expect(announce(at('launch', 'paused'), at('launch', 'running'))).toBe('Simulación reanudada.');
    expect(announce(at('orbit', 'running'), at('orbit', 'stopped'))).toBe('La misión se detuvo.');
    expect(announce(at('orbit', 'stopped'), at('launch', 'running'))).toBe('Misión reiniciada desde el despegue.');
  });

  it('announces a phase change with its position and name', () => {
    expect(announce(at('launch', 'running'), at('orbit', 'running'))).toBe('Fase 2 de 5: Órbita y ranking.');
    expect(announce(at('landing', 'running'), at('transmit', 'running'))).toBe('Fase 5 de 5: Transmisión.');
  });
});

describe('paintedHud', () => {
  const hud: PhaseHud = {
    figure: { value: '64', caption: '' },
    progress: { value: 0.64, label: 'Carga' },
    detail: 'Cargando',
    side: { kind: 'readouts', items: [] },
    waiting: false,
  };

  it('keeps everything while the mission runs', () => {
    expect(paintedHud('running', hud)).toEqual(hud);
  });

  it('cuts bar values to the whole percent, so a float creeping toward 1 does not repaint', () => {
    const at = (value: number) => JSON.stringify(paintedHud('running', { ...hud, progress: { value, label: 'Carga' } }));
    expect(at(0.9981)).toBe(at(0.9987));
    expect(at(0.99)).not.toBe(at(0.98));
    const fuel = (value: number): PhaseHud => ({ ...hud, side: { kind: 'readouts', items: [{ label: 'Combustible', value: '94 %', meter: { value, label: 'x' } }] } });
    expect(JSON.stringify(paintedHud('running', fuel(0.9412)))).toBe(JSON.stringify(paintedHud('running', fuel(0.9449))));
    const sky = (share: number): PhaseHud => ({ ...hud, side: { kind: 'sky', blocks: [{ kind: 'sun', label: 'Sol', value: '1°', detail: '', share, shareLabel: '' }] } });
    expect(JSON.stringify(paintedHud('running', sky(0.4801)))).toBe(JSON.stringify(paintedHud('running', sky(0.4849))));
  });

  it('drops what is hidden while paused, so background loading does not repaint', () => {
    const paused = paintedHud('paused', hud)!;
    expect(paused.figure).toEqual(hud.figure);
    expect(paused.progress).toBeUndefined();
    expect(paused.detail).toBeUndefined();
    expect(JSON.stringify(paintedHud('paused', { ...hud, detail: 'Otro mensaje', progress: { value: 0.9, label: 'Carga' } }))).toBe(JSON.stringify(paused));
  });

  it('paints nothing of the phase when stopped or before there is a HUD', () => {
    expect(paintedHud('stopped', hud)).toBeNull();
    expect(paintedHud('running', null)).toBeNull();
  });
});
