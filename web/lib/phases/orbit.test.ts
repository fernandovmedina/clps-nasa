import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '../engine/app';
import type { HudRankRow, PhaseHud } from '../engine/hud';
import type { SiteMetrics } from '../mission/scoring';
import { DEMO_CRASH_NOTE, NO_CAER_SITE_ID, type MissionData, type SiteInput } from '../mission/sites';
import { realMissionData } from '../mission/test-data';
import { OrbitPhase, planPinLabels, rectsOverlap, type PinLabelCandidate, type PinRect } from './orbit';

const rect = (x: number, y = 0, w = 100, h = 40): PinRect => ({ x, y, w, h });

/** A pin whose full label sits at `x` and whose rank chip is a small box under it. */
function pin(rank: number, x: number, over: Partial<PinLabelCandidate> = {}): PinLabelCandidate {
  return { id: `p${rank}`, rank, selected: false, hover: false, full: rect(x), chip: rect(x + 40, 0, 20, 14), ...over };
}

const modes = (pins: PinLabelCandidate[]) => Object.fromEntries([...planPinLabels(pins)].map(([id, m]) => [id, m]));

describe('rectsOverlap', () => {
  it('is true only when the boxes share area; touching edges do not count', () => {
    expect(rectsOverlap(rect(0), rect(50))).toBe(true);
    expect(rectsOverlap(rect(0), rect(100))).toBe(false);
    expect(rectsOverlap(rect(0), rect(0, 40))).toBe(false);
    expect(rectsOverlap(rect(0), rect(0, 39))).toBe(true);
  });
});

describe('planPinLabels', () => {
  it('gives the full label to the top three only; the rest carry just the rank number', () => {
    const pins = [1, 2, 3, 4, 5].map((r) => pin(r, r * 300));
    expect(modes(pins)).toEqual({ p1: 'full', p2: 'full', p3: 'full', p4: 'chip', p5: 'chip' });
  });

  it('also gives it to the selected pin and the hovered one, wherever they rank', () => {
    const pins = [1, 2, 3, 4, 5, 6].map((r) => pin(r, r * 300, { selected: r === 5, hover: r === 6 }));
    expect(modes(pins)).toMatchObject({ p4: 'chip', p5: 'full', p6: 'full' });
  });

  it('hides the label of the lower rank when two full labels overlap, keeping its rank chip', () => {
    const pins = [pin(1, 0), pin(2, 60), pin(3, 600)];
    expect(modes(pins)).toEqual({ p1: 'full', p2: 'chip', p3: 'full' });
  });

  it('lets the selected or hovered pin win an overlap against a better rank', () => {
    expect(modes([pin(1, 0), pin(5, 60, { selected: true })])).toEqual({ p1: 'chip', p5: 'full' });
    expect(modes([pin(1, 0), pin(5, 60, { hover: true })])).toEqual({ p1: 'chip', p5: 'full' });
  });

  it('hides a rank chip that would sit on a shown label or on a better chip', () => {
    const pins = [pin(1, 0), pin(4, 10), pin(5, 15), pin(6, 900)];
    expect(modes(pins)).toEqual({ p1: 'full', p4: 'hidden', p5: 'hidden', p6: 'chip' });
  });

  it('never leaves two visible boxes overlapping, whatever the layout', () => {
    const pins = Array.from({ length: 11 }, (_, i) => pin(i + 1, (i * 37) % 180, { selected: i === 7 }));
    const result = planPinLabels(pins);
    const boxes = pins.flatMap((p) => (result.get(p.id) === 'full' ? [p.full] : result.get(p.id) === 'chip' ? [p.chip] : []));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(rectsOverlap(boxes[i]!, boxes[j]!)).toBe(false);
  });
});

const REGIONS: Record<string, SiteInput['region']> = {
  'apollo-11': 'equatorial', 'apollo-17': 'equatorial', 'chandrayaan-3': 'mid-latitude', 'change-4': 'far-side',
};

/** The real catalog with its regions, plus the NO CAER demo case the loader appends (cloned from Malapert Massif). */
function missionWithDemo(): MissionData {
  const data = realMissionData();
  const sites: SiteInput[] = data.sites.map((s) => ({ ...s, region: REGIONS[s.id] ?? 'south-pole' }));
  const src = sites.find((s) => s.id === 'malapert-massif')!;
  sites.push({ ...src, id: NO_CAER_SITE_ID, name: 'NO CAER', note: 'Caso de demostración, no es un sitio real.', crash: true });
  return { ...data, sites };
}

function fakeApp(width = 1440, height = 900) {
  const camera = new THREE.PerspectiveCamera(60, width / height, 1, 500_000);
  const app = {
    flags: new Set<string>(['orbit-done']),
    data: missionWithDemo(),
    ranking: [] as SiteMetrics[],
    selected: null as SiteMetrics | null,
    isXR: false,
    isHost: true,
    camera,
    rig: new THREE.Group(),
    renderer: { domElement: { clientWidth: width, clientHeight: height } },
    moonTex: { general: new THREE.Texture(), north: null, south: null },
    room: { status: 'closed', room: 'test', setListener: vi.fn(), send: vi.fn() },
    audio: { play: vi.fn(), loop: vi.fn(() => ({ stop: vi.fn() })) },
    narrator: { say: vi.fn() },
    setView: vi.fn(),
    goTo: vi.fn(),
    applyMarkerEvent: vi.fn(),
  };
  return app as unknown as LunarApp & typeof app;
}

/** No canvas backend in jsdom: every 2D call is a no-op and measureText answers a fixed width. */
function stubCanvas() {
  const ctx: object = new Proxy({}, {
    get: (_t, key) => (key === 'measureText' ? () => ({ width: 100 }) : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
}

function openOrbit(app: ReturnType<typeof fakeApp>) {
  const phase = new OrbitPhase(app);
  for (let i = 0; i < 30; i++) phase.update(0.5);
  return phase;
}

const rows = (hud: PhaseHud) => (hud.side.kind === 'ranking' ? (hud.side.rows as (HudRankRow & { note?: string; demo?: boolean })[]) : []);
const row = (hud: PhaseHud, id: string) => rows(hud).find((r) => r.id === `site-${id}`)!;
const metricsOf = (app: LunarApp, id: string) => app.ranking.find((m) => m.site.id === id)!;

describe('OrbitPhase ranking data', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.restoreAllMocks());

  it('is headed «Sitios evaluados» and keeps every site, ranking and score as they were', () => {
    const app = fakeApp();
    const hud = openOrbit(app).controlHud();
    expect(hud.side).toMatchObject({ kind: 'ranking', title: 'Sitios evaluados' });
    expect(rows(hud)).toHaveLength(11);
    expect(rows(hud).map((r) => r.rank)).toEqual([...Array(11).keys()].map((i) => i + 1));
  });

  it('marks NO CAER as a demonstration case in its row and tags non-polar sites as contrast', () => {
    const app = fakeApp();
    const hud = openOrbit(app).controlHud();
    expect(row(hud, NO_CAER_SITE_ID)).toMatchObject({ demo: true, note: DEMO_CRASH_NOTE });
    expect(row(hud, 'apollo-11').note).toBe('Contraste · ecuatorial');
    expect(row(hud, 'chandrayaan-3').note).toBe('Contraste · latitud media');
    expect(row(hud, 'change-4').note).toBe('Contraste · lado oculto');
    expect(row(hud, 'malapert-a').note).toBeUndefined();
    expect(row(hud, 'malapert-a').demo).toBeUndefined();
  });

  it('shows NO CAER as a demo, with no borrowed readings, when it is the chosen site', () => {
    const app = fakeApp();
    const phase = openOrbit(app);
    app.selected = metricsOf(app, NO_CAER_SITE_ID);
    const hud = phase.controlHud();
    expect(hud.figure.value).toBe('DEMO');
    expect(hud.figure.badge).toBeUndefined();
    expect(hud.detail).toContain(DEMO_CRASH_NOTE);
    expect(hud.facts).toBeUndefined();
  });

  it('puts the contrast label in front of the detail of a non-polar site and keeps its readings', () => {
    const app = fakeApp();
    const phase = openOrbit(app);
    app.selected = metricsOf(app, 'apollo-11');
    const hud = phase.controlHud();
    expect(hud.detail).toMatch(/^Contraste · ecuatorial · /);
    expect(hud.figure.caption).toBe(`de 100 · ${metricsOf(app, 'apollo-11').site.name}`);
    expect(hud.facts).toHaveLength(4);
  });

  it('writes scores out of 100, never as a percentage', () => {
    const app = fakeApp();
    const phase = openOrbit(app);
    app.selected = metricsOf(app, 'malapert-a');
    const delay = phase.controlHud().toggles!.options.find((o) => o.id === 'delay-7')!;
    delay.run!();
    const hud = phase.controlHud();
    expect(hud.detail).toMatch(/^Con \+7 d de retraso: antes \d+\/100 → ahora \d+\/100$/);
  });
});

describe('OrbitPhase pin labels', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.restoreAllMocks());

  /** A camera hovering over the south pole, looking at it: where every pin crowds together. */
  function lookAtPole(app: ReturnType<typeof fakeApp>) {
    const a = (-70 * Math.PI) / 180;
    app.camera.position.set(Math.cos(a) * 1150, Math.sin(a) * 1150, 0);
    app.camera.up.set(Math.cos(a), Math.sin(a), 0);
    app.camera.lookAt(0, -1000, 0);
    app.camera.updateMatrixWorld(true);
  }

  type Pin = { m: SiteMetrics; label: THREE.Sprite; chip: THREE.Sprite; hover: boolean };
  const pinsOf = (phase: OrbitPhase) => (phase as unknown as { markers: Pin[] }).markers;

  it('shows the full label only for the top three and the selected pin; the rest wear their rank number', () => {
    const app = fakeApp();
    lookAtPole(app);
    const phase = openOrbit(app);
    app.selected = metricsOf(app, 'malapert-a');
    phase.update(0.016);
    const shown = pinsOf(phase).filter((p) => p.label.visible).map((p) => p.m.site.id);
    for (const id of shown) expect([1, 2, 3, metricsOf(app, 'malapert-a').rank]).toContain(metricsOf(app, id).rank);
    expect(pinsOf(phase).filter((p) => p.label.visible && p.chip.visible)).toHaveLength(0);
    expect(pinsOf(phase).filter((p) => p.chip.visible).length).toBeGreaterThan(0);
  });

  it('never leaves two visible labels or chips overlapping on screen', () => {
    const app = fakeApp();
    lookAtPole(app);
    const phase = openOrbit(app);
    const priv = phase as unknown as { spriteRect: (s: THREE.Sprite, w: number, h: number) => PinRect | null };
    for (const hovered of [null, 'apollo-11']) {
      for (const p of pinsOf(phase)) p.hover = p.m.site.id === hovered;
      phase.update(0.016);
      const boxes = pinsOf(phase).flatMap((p) => [p.label, p.chip].filter((sp) => sp.visible).map((sp) => priv.spriteRect(sp, 1440, 900)!));
      expect(boxes.length).toBeGreaterThan(1);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(rectsOverlap(boxes[i]!, boxes[j]!)).toBe(false);
    }
  });

  it('hides the labels of pins on the far side of the Moon', () => {
    const app = fakeApp();
    const phase = openOrbit(app);
    app.camera.position.set(0, 1150, 0); // over the north pole: the south pins are behind the limb
    app.camera.lookAt(0, 0, 0);
    app.camera.updateMatrixWorld(true);
    phase.update(0.016);
    expect(pinsOf(phase).some((p) => p.label.visible || p.chip.visible)).toBe(false);
  });
});
