import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Panel, showPanels } from '../engine/panel';
import type { PhaseHud, RunMode } from '../engine/hud';
import type { SiteMetrics } from '../mission/scoring';
import { CONSOLE_SLOTS, CabinConsole, PANEL_RADIUS, REFRESH_MS, cabinPose, type ConsoleHost, type ConsoleId } from './landing-console';

const DEG = Math.PI / 180;
const COCKPIT_RADIUS = 3;
const EYE = 1.6;

/** Zones measured on the cockpit photo: azimuth (+ right) and elevation (+ up) ranges, in degrees. */
const ZONES: Record<ConsoleId, { az: [number, number]; el: [number, number] }> = {
  control: { az: [-44, -21], el: [-50, -31] },
  mission: { az: [-19, 19], el: [-50, -33] },
  telemetry: { az: [22, 44], el: [-50, -31] },
  phases: { az: [-87, -67], el: [3, 30] },
  site: { az: [65, 87], el: [3, 30] },
};
const mid = ([a, b]: [number, number]) => (a + b) / 2;

const azimuthOf = (v: THREE.Vector3) => Math.atan2(v.x, -v.z) / DEG;
const elevationOf = (v: THREE.Vector3) => Math.asin(v.y / v.length()) / DEG;

describe('cabinPose', () => {
  it.each(Object.entries(ZONES))('puts the centre of %s at its azimuth and elevation, 2.8 m from the eye', (_id, zone) => {
    const az = mid(zone.az), el = mid(zone.el);
    const { position } = cabinPose(az, el, PANEL_RADIUS, EYE);
    const fromEye = position.clone().sub(new THREE.Vector3(0, EYE, 0));
    expect(fromEye.length()).toBeCloseTo(2.8, 6);
    expect(Math.abs(azimuthOf(fromEye) - az)).toBeLessThan(0.5);
    expect(Math.abs(elevationOf(fromEye) - el)).toBeLessThan(0.5);
  });

  it.each(Object.entries(ZONES))('turns the %s panel to face the eye without rolling it', (_id, zone) => {
    const { position, quaternion } = cabinPose(mid(zone.az), mid(zone.el), PANEL_RADIUS, EYE);
    const toEye = new THREE.Vector3(0, EYE, 0).sub(position).normalize();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    expect(normal.angleTo(toEye) / DEG).toBeLessThan(0.01);
    expect(Math.abs(right.y)).toBeLessThan(1e-9);
  });

  it('follows the eye height and the sign conventions of the rig (forward −Z, right +X, up +Y)', () => {
    const front = cabinPose(0, 0, 2.8, 1.2).position;
    expect(front.x).toBeCloseTo(0, 9);
    expect(front.y).toBeCloseTo(1.2, 9);
    expect(front.z).toBeCloseTo(-2.8, 9);
    expect(cabinPose(90, 0, 2.8, EYE).position.x).toBeCloseTo(2.8, 9);
    expect(cabinPose(-90, 0, 2.8, EYE).position.x).toBeCloseTo(-2.8, 9);
    expect(cabinPose(0, -45, 2.8, EYE).position.y).toBeLessThan(EYE);
    expect(cabinPose(0, 45, 2.8, EYE).position.y).toBeGreaterThan(EYE);
  });
});

describe('console layout', () => {
  const planeOf = (id: ConsoleId) => {
    const s = CONSOLE_SLOTS[id];
    return { w: s.widthM, h: (s.widthM * s.px[1]) / s.px[0] };
  };

  it('keeps every panel inside the 3 m cockpit sphere, corners included', () => {
    for (const id of Object.keys(CONSOLE_SLOTS) as ConsoleId[]) {
      const s = CONSOLE_SLOTS[id], { w, h } = planeOf(id);
      expect(Math.hypot(PANEL_RADIUS, w / 2, h / 2), id).toBeLessThan(COCKPIT_RADIUS - 0.05);
      expect(s.px[0], id).toBeLessThanOrEqual(1024);
      expect(s.px[1], id).toBeLessThanOrEqual(512);
    }
  });

  it('sits close to the measured zones (the wall screens on the mark, the console wings pulled over their painted screens)', () => {
    for (const id of Object.keys(CONSOLE_SLOTS) as ConsoleId[]) {
      const s = CONSOLE_SLOTS[id], zone = ZONES[id];
      const wing = id === 'control' || id === 'telemetry';
      expect(Math.abs(s.azimuth - mid(zone.az)), `${id} azimuth`).toBeLessThanOrEqual(wing ? 7 : 1.5);
      expect(Math.abs(s.elevation - mid(zone.el)), `${id} elevation`).toBeLessThanOrEqual(wing ? 3 : 1.5);
    }
  });

  it('covers the zone: the panel spans roughly the angles of the zone it is drawn over', () => {
    for (const id of Object.keys(CONSOLE_SLOTS) as ConsoleId[]) {
      const s = CONSOLE_SLOTS[id], zone = ZONES[id], { w, h } = planeOf(id);
      const spanAz = 2 * Math.atan(w / 2 / PANEL_RADIUS) / DEG, spanEl = 2 * Math.atan(h / 2 / PANEL_RADIUS) / DEG;
      const zoneAz = (zone.az[1] - zone.az[0]) * Math.cos(mid(zone.el) * DEG), zoneEl = zone.el[1] - zone.el[0];
      expect(spanAz / zoneAz, `${id} width`).toBeGreaterThan(0.8);
      expect(spanAz / zoneAz, `${id} width`).toBeLessThan(1.4);
      expect(spanEl / zoneEl, `${id} height`).toBeGreaterThan(0.8);
      expect(spanEl / zoneEl, `${id} height`).toBeLessThan(1.4);
      expect(s.widthM).toBeGreaterThan(0);
    }
  });

  it('does not overlap the three console panels', () => {
    const edge = (id: ConsoleId, side: -1 | 1) => {
      const s = CONSOLE_SLOTS[id];
      const half = Math.atan(s.widthM / 2 / PANEL_RADIUS) / DEG / Math.cos(s.elevation * DEG);
      return s.azimuth + side * half;
    };
    expect(edge('control', 1)).toBeLessThan(edge('mission', -1));
    expect(edge('mission', 1)).toBeLessThan(edge('telemetry', -1));
  });
});

interface Rec { draws: number; texts: { text: string; px: number; x: number; align: string }[] }
const recs = new Map<HTMLCanvasElement, Rec>();

function fakeContext(rec: Rec) {
  const state: Record<string | symbol, unknown> = { font: '10px x', textAlign: 'left', globalAlpha: 1 };
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  return new Proxy(state, {
    get(t, k) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * size() * 0.55 });
      if (k === 'clearRect') return () => { rec.draws++; rec.texts = []; };
      if (k === 'fillText') return (text: string, x: number) => { rec.texts.push({ text, px: size(), x, align: String(state.textAlign) }); };
      return k in t ? t[k] : () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const rec = (p: Panel) => recs.get(p.canvas)!;
const labels = (p: Panel) => rec(p).texts.map((t) => t.text);

function hudWith(tick: () => number): () => PhaseHud {
  return () => {
    const n = tick();
    return {
      figure: { value: `${(1250 - n).toFixed(1)} m`, caption: 'sobre la superficie' },
      progress: { value: 0.58 + n / 1e4, label: 'Avance del descenso', text: '58 %' },
      side: {
        kind: 'readouts',
        items: [
          { label: 'Velocidad de descenso', value: `${(18 + n / 10).toFixed(1)} m/s` },
          { label: 'Velocidad horizontal', value: '2.1 m/s' },
          { label: 'Combustible', value: '74 %' },
          { label: 'Luz de contacto', value: 'Apagada' },
          { label: 'Zona de alunizaje', value: '−80.13°, 1.44° E', size: 'md' },
        ],
      },
    };
  };
}

const SITE = {
  site: { name: 'Malapert A (IM-1 Odysseus)', lat: -80.13, lon: 1.44 },
  sun: { elevation: 1.8, azimuth: 123.4, aboveHorizon: 0.6 },
  earth: { aboveHorizon: 2.5 },
  hoursToSunset: 210, hoursToEarthset: 60, powerPct: 71, score: 72, status: 'marginal',
} as unknown as SiteMetrics;

function makeHost() {
  const calls: string[] = [];
  const host: ConsoleHost & { run: { mode: RunMode } } = {
    eyeHeight: EYE,
    run: { mode: 'running' },
    selected: SITE,
    data: { landingDate: new Date('2027-01-10T00:00:00Z') },
    globalTargets: [],
    setPaused(paused) { calls.push(`paused:${paused}`); host.run.mode = paused ? 'paused' : 'running'; },
    stop() { calls.push('stop'); host.run.mode = 'stopped'; },
    restart() { calls.push('restart'); host.run.mode = 'running'; },
    exitVR() { calls.push('exit'); },
  };
  return { host, calls };
}

let cabin: CabinConsole | null = null;
const IDS = Object.keys(CONSOLE_SLOTS) as ConsoleId[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
  recs.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const r: Rec = { draws: 0, texts: [] };
    recs.set(this, r);
    return fakeContext(r);
  } as never);
});
afterEach(() => {
  cabin?.dispose();
  cabin = null;
  showPanels(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function open(tick = () => 0) {
  const { host, calls } = makeHost();
  cabin = new CabinConsole(host, hudWith(tick));
  const rig = new THREE.Group();
  cabin.mount(rig);
  showPanels(true);
  cabin.update();
  return { host, calls, rig, cabin };
}

const angleOf = (px: number, id: ConsoleId) => {
  const s = CONSOLE_SLOTS[id];
  return Math.atan(((px * s.widthM) / s.px[0]) / PANEL_RADIUS) / DEG;
};
const tallOf = (px: number, id: ConsoleId) => {
  const s = CONSOLE_SLOTS[id];
  return (2 * Math.atan(((px * s.widthM) / s.px[0]) / 2 / PANEL_RADIUS)) / DEG;
};

describe('CabinConsole content', () => {
  it('shows the phase, the figure, the progress and the mission on the central panel', () => {
    const { cabin } = open();
    expect(labels(cabin.panels.mission)).toEqual([
      'Fase 4 de 5 · Alunizaje', '1250.0 m', 'sobre la superficie', '58 %',
      'Malapert A (IM-1 Odysseus)', 'Aterrizaje 10 ene 2027 · 00:00 UTC',
    ]);
  });

  it('shows descent speed, fuel and contact light on the telemetry panel, as the DOM layer reads them', () => {
    const { cabin } = open();
    expect(labels(cabin.panels.telemetry)).toEqual([
      'Velocidad de descenso', '18.0 m/s', 'Combustible', '74 %', 'Luz de contacto', 'Apagada',
    ]);
  });

  it('lists the five phases (three done, the current one, one pending) and the mission on the left wall', () => {
    const { cabin } = open();
    expect(labels(cabin.panels.phases)).toEqual([
      'Fases de la misión', 'Despegue', 'Órbita y ranking', 'Vista del sitio', 'Alunizaje', 'Transmisión',
      'Misión', 'Malapert A (IM-1', 'Odysseus)', '10 ene 2027 · 00:00 UTC',
    ]);
  });

  it('shows the data of the chosen site on the right wall', () => {
    const { cabin } = open();
    const t = labels(cabin.panels.site);
    expect(t).toContain('Datos del sitio');
    expect(t).toContain('−80.13°, 1.44° E');
    expect(t).toContain('1.8° / 123°');
    expect(t).toContain('8.8 d');
    expect(t).toContain('2.5 d');
    expect(t).toContain('71 %');
    expect(t).toContain('72 · Marginal');
  });
});

describe('CabinConsole controls', () => {
  it('offers Pausar, Detener and Salir de VR, and each drives the engine', () => {
    const { cabin, calls } = open();
    const control = cabin.panels.control;
    expect(control.buttons.map((b) => b.id)).toEqual(['pause', 'stop', 'exit']);
    expect(labels(control)).toEqual(['Control de la misión', 'Pausar', 'Detener', 'Salir de VR']);
    const click = (id: string) => control.buttons.find((b) => b.id === id)!.onClick();
    click('exit');
    click('pause');
    expect(calls).toEqual(['exit', 'paused:true']);
  });

  it('turns Pausar into Reanudar while paused and resumes on click', () => {
    const { cabin, host, calls } = open();
    cabin.panels.control.buttons.find((b) => b.id === 'pause')!.onClick();
    expect(host.run.mode).toBe('paused');
    cabin.update();
    expect(labels(cabin.panels.control)).toEqual(['Control de la misión', 'Reanudar', 'Detener', 'Salir de VR']);
    cabin.panels.control.buttons.find((b) => b.id === 'pause')!.onClick();
    expect(calls).toEqual(['paused:true', 'paused:false']);
  });

  it('shows «Misión detenida» with the restart and exit buttons once stopped', () => {
    const { cabin, host, calls } = open();
    cabin.panels.control.buttons.find((b) => b.id === 'stop')!.onClick();
    expect(host.run.mode).toBe('stopped');
    cabin.update();
    const control = cabin.panels.control;
    expect(control.buttons.map((b) => b.id)).toEqual(['restart', 'exit']);
    expect(labels(control)).toContain('Misión detenida');
    expect(labels(control).join(' ')).toContain('Reiniciar desde el');
    control.buttons.find((b) => b.id === 'restart')!.onClick();
    expect(calls).toEqual(['stop', 'restart']);
  });

  it('only the control panel is a ray target, and it stops being one when released', () => {
    const { cabin, host, rig } = open();
    expect(rig.children).toHaveLength(5);
    expect(host.globalTargets).toEqual([cabin.panels.control.mesh]);
    cabin.dispose();
    expect(host.globalTargets).toEqual([]);
    expect(rig.children).toHaveLength(0);
  });

  it('places each panel where cabinPose says, 2.8 m from the eye and facing it', () => {
    const { cabin } = open();
    const eye = new THREE.Vector3(0, EYE, 0);
    for (const id of IDS) {
      const s = CONSOLE_SLOTS[id], mesh = cabin.panels[id].mesh;
      const want = cabinPose(s.azimuth, s.elevation, PANEL_RADIUS, EYE);
      expect(mesh.position.distanceTo(want.position)).toBeLessThan(1e-9);
      expect(mesh.position.distanceTo(eye)).toBeCloseTo(PANEL_RADIUS, 6);
    }
  });
});

describe('CabinConsole legibility', () => {
  const stateOf = (mode: RunMode) => {
    const o = open();
    if (mode === 'paused') o.cabin.panels.control.buttons.find((b) => b.id === 'pause')!.onClick();
    if (mode === 'stopped') o.cabin.panels.control.buttons.find((b) => b.id === 'stop')!.onClick();
    o.cabin.update();
    return o.cabin;
  };

  it.each(['running', 'paused', 'stopped'] as RunMode[])('draws every text at 1.3° or more on the console (%s), 1.1° or more on the walls', (mode) => {
    const c = stateOf(mode);
    for (const id of IDS) {
      const floor = id === 'phases' || id === 'site' ? 1.1 : 1.3;
      for (const t of rec(c.panels[id]).texts) expect(angleOf(t.px, id), `${id}: «${t.text}» ${t.px}px`).toBeGreaterThanOrEqual(floor);
    }
  });

  it.each(['running', 'paused', 'stopped'] as RunMode[])('keeps every text inside its canvas (%s)', (mode) => {
    const c = stateOf(mode);
    for (const id of IDS) {
      const W = CONSOLE_SLOTS[id].px[0];
      for (const t of rec(c.panels[id]).texts) {
        const w = t.text.length * t.px * 0.55;
        const [from, to] = t.align === 'right' ? [t.x - w, t.x] : t.align === 'center' ? [t.x - w / 2, t.x + w / 2] : [t.x, t.x + w];
        expect(from, `${id}: «${t.text}»`).toBeGreaterThanOrEqual(8);
        expect(to, `${id}: «${t.text}»`).toBeLessThanOrEqual(W - 8);
      }
    }
  });

  it.each(['running', 'paused', 'stopped'] as RunMode[])('makes every button 4° tall or more (%s)', (mode) => {
    const c = stateOf(mode);
    for (const b of c.panels.control.buttons) expect(tallOf(b.h, 'control'), b.id).toBeGreaterThanOrEqual(4);
  });
});

describe('CabinConsole redraw rate', () => {
  const runFrames = (c: CabinConsole, frames: number, step = 1000 / 60) => {
    for (let i = 0; i < frames; i++) { vi.advanceTimersByTime(step); c.update(); }
  };
  const draws = (c: CabinConsole) => Object.fromEntries(IDS.map((id) => [id, rec(c.panels[id]).draws])) as Record<ConsoleId, number>;

  it('draws every panel once on its first visible frame', () => {
    const { cabin } = open();
    expect(draws(cabin)).toEqual({ control: 1, mission: 1, telemetry: 1, phases: 1, site: 1 });
  });

  it('redraws the live readouts at most about 10 times a second while the telemetry changes every frame', () => {
    let n = 0;
    const { cabin } = open(() => n++);
    const before = draws(cabin);
    runFrames(cabin, 60);
    const after = draws(cabin);
    const rate = (id: ConsoleId) => after[id] - before[id];
    expect(rate('telemetry')).toBeGreaterThanOrEqual(8);
    expect(rate('telemetry')).toBeLessThanOrEqual(1000 / REFRESH_MS + 1);
    expect(rate('mission')).toBeLessThanOrEqual(1000 / REFRESH_MS + 1);
    expect(rate('control')).toBe(0);
    expect(rate('phases')).toBe(0);
    expect(rate('site')).toBe(0);
  });

  it('does not redraw anything while what it shows stays the same', () => {
    const { cabin } = open(() => 0);
    const before = draws(cabin);
    runFrames(cabin, 180);
    expect(draws(cabin)).toEqual(before);
  });

  it('redraws the control panel as soon as the run mode changes, even though the simulation is frozen', () => {
    const { cabin, host } = open(() => 0);
    const before = draws(cabin).control;
    host.run.mode = 'paused';
    cabin.update();
    expect(draws(cabin).control).toBe(before + 1);
    expect(draws(cabin).mission).toBe(1);
  });

  it('does no work while the panels are hidden (outside a headset)', () => {
    const { host } = makeHost();
    cabin = new CabinConsole(host, hudWith(() => 0));
    showPanels(false);
    runFrames(cabin, 30);
    expect(draws(cabin)).toEqual({ control: 0, mission: 0, telemetry: 0, phases: 0, site: 0 });
  });
});
