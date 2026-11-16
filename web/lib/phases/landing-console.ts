import * as THREE from 'three';
import type { RunMode, PhaseHud } from '../engine/hud';
import { PHASE_ORDER, fmtLatLon } from '../engine/hud';
import { t } from '@/lib/i18n';
import { phasesCommonDict as C } from '@/lib/i18n/dicts/phases-common';
import { phasesLandingDict as D } from '@/lib/i18n/dicts/phases-landing';
import { isEn, landingDate, phaseLabel, statusLabel } from './phases-format';
import { Panel, UI, roundRect, statusColor } from '../engine/panel';
import { fmtHours, type SiteMetrics } from '../mission/scoring';

/** Distance from the eye: just inside the 3 m cockpit sphere, so the panels read as part of the cabin. */
export const PANEL_RADIUS = 2.8;
/** The console redraws at most this often: the telemetry changes every frame, nobody can read it that fast. */
export const REFRESH_MS = 100;

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

export interface PanelPose { position: THREE.Vector3; quaternion: THREE.Quaternion }

/**
 * Where a panel centred at (azimuth, elevation) as seen from the eye goes, in rig space (forward −Z,
 * azimuth positive to the right, elevation positive up), and the rotation that makes it face the eye.
 */
export function cabinPose(azimuthDeg: number, elevationDeg: number, radius: number, eyeHeight: number): PanelPose {
  const az = azimuthDeg * DEG, el = elevationDeg * DEG;
  const eye = new THREE.Vector3(0, eyeHeight, 0);
  const position = new THREE.Vector3(radius * Math.cos(el) * Math.sin(az), eyeHeight + radius * Math.sin(el), -radius * Math.cos(el) * Math.cos(az));
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, position, UP));
  return { position, quaternion };
}

export type ConsoleId = 'control' | 'mission' | 'telemetry' | 'phases' | 'site';

export interface ConsoleSlot {
  azimuth: number;
  elevation: number;
  /** Canvas size in pixels. */
  px: [number, number];
  /** Width of the plane in metres at PANEL_RADIUS. */
  widthM: number;
}

/**
 * The three painted screens of the console (below the line of sight) and the two wall screens (76° to each side).
 * The side console panels sit ~6° further out than the middle of their measured zone so they cover the button
 * cluster and the painted screen next to it instead of leaving half a screen showing.
 */
export const CONSOLE_SLOTS: Record<ConsoleId, ConsoleSlot> = {
  control: { azimuth: -38, elevation: -38.5, px: [520, 480], widthM: 1 },
  mission: { azimuth: 0, elevation: -41.5, px: [864, 512], widthM: 1.46 },
  telemetry: { azimuth: 39, elevation: -38.5, px: [520, 480], widthM: 1 },
  phases: { azimuth: -76, elevation: 17.5, px: [380, 512], widthM: 1 },
  site: { azimuth: 76, elevation: 17.5, px: [380, 512], widthM: 1 },
};

const CONSOLE_IDS = Object.keys(CONSOLE_SLOTS) as ConsoleId[];
const LIVE_IDS = ['mission', 'telemetry', 'phases', 'site'] as const;
/** Posición, en `hud.side.items` de la fase, de la velocidad de descenso, el combustible y la luz de contacto (no se buscan por rótulo: el rótulo cambia con el idioma). */
const TELEMETRY_ITEMS = [0, 2, 3];

/** What the console needs from the engine; LunarApp satisfies it. */
export interface ConsoleHost {
  readonly eyeHeight: number;
  readonly run: { readonly mode: RunMode };
  readonly selected: SiteMetrics | null;
  readonly data: { readonly landingDate: Date } | null;
  readonly globalTargets: THREE.Object3D[];
  setPaused(paused: boolean): void;
  stop(): void;
  restart(): void;
  exitVR(): void;
}

interface MissionView {
  index: number;
  total: number;
  label: string;
  figure: { value: string; caption: string };
  progress: { value: number; text: string } | null;
  site: string;
  landing: string;
}
interface TelemetryView { items: { label: string; value: string }[] }
interface PhasesView { current: number; labels: string[]; site: string; landing: string }
interface SiteView { name: string; coords: string; rows: { label: string; value: string; color?: string }[] }
interface Views { mission: MissionView; telemetry: TelemetryView; phases: PhasesView; site: SiteView }

const round2 = (n: number) => Math.round(n * 100) / 100;

function readViews(host: ConsoleHost, hud: PhaseHud): Views {
  const m = host.selected;
  const landing = host.data ? landingDate(host.data.landingDate) : '';
  const index = PHASE_ORDER.indexOf('landing');
  const items = hud.side.kind === 'readouts' ? hud.side.items : [];
  return {
    mission: {
      index,
      total: PHASE_ORDER.length,
      label: phaseLabel('landing'),
      figure: { value: hud.figure.value, caption: hud.figure.caption },
      progress: hud.progress ? { value: round2(hud.progress.value), text: hud.progress.text ?? '' } : null,
      site: m?.site.name ?? '',
      landing: landing ? t(D, 'con.landing', { date: landing }) : '',
    },
    telemetry: {
      items: TELEMETRY_ITEMS.flatMap((at) => {
        const it = items[at];
        return it ? [{ label: it.label, value: it.value }] : [];
      }),
    },
    phases: { current: index, labels: PHASE_ORDER.map((p) => phaseLabel(p)), site: m?.site.name ?? '', landing },
    site: siteView(m),
  };
}

function siteView(m: SiteMetrics | null): SiteView {
  if (!m) return { name: '', coords: '', rows: [] };
  return {
    name: m.site.name,
    coords: fmtLatLon(m.site.lat, m.site.lon),
    rows: [
      { label: t(D, 'con.sun'), value: `${m.sun.elevation.toFixed(1)}° / ${m.sun.azimuth.toFixed(0)}°` },
      { label: t(D, 'con.sunset'), value: m.sun.aboveHorizon > -0.27 ? fmtHours(m.hoursToSunset) : t(C, 'shadow') },
      { label: t(D, 'con.earthset'), value: m.earth.aboveHorizon > 0 ? fmtHours(m.hoursToEarthset) : t(C, 'noLink') },
      { label: t(D, 'con.disk'), value: isEn() ? `${m.powerPct}%` : `${m.powerPct} %` },
      { label: t(D, 'con.viability'), value: `${Math.round(m.score)}/100 · ${statusLabel(m.status)}`, color: statusColor(m.status) },
    ],
  };
}

type Ctx = CanvasRenderingContext2D;

function text(g: Ctx, s: string, x: number, y: number, weight: number, px: number, color: string, align: CanvasTextAlign = 'left') {
  g.font = `${weight} ${px}px ${UI.font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
  g.textAlign = 'left';
}

function width(g: Ctx, s: string, weight: number, px: number) {
  g.font = `${weight} ${px}px ${UI.font}`;
  return g.measureText(s).width;
}

/** Greedy word wrap into at most `maxLines` lines; whatever does not fit ends in an ellipsis. */
function wrap(g: Ctx, s: string, weight: number, px: number, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || width(g, next, weight, px) <= maxW) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  let last = lines.slice(maxLines - 1).join(' ');
  while (last.length > 1 && width(g, `${last}…`, weight, px) > maxW) last = last.slice(0, -1);
  return [...lines.slice(0, maxLines - 1), `${last}…`];
}

function surface(g: Ctx, w: number, h: number) {
  roundRect(g, 2, 2, w - 4, h - 4, 26);
  g.fillStyle = UI.bg; g.fill();
  g.strokeStyle = UI.line; g.lineWidth = 2; g.stroke();
}

function hairline(g: Ctx, x: number, y: number, w: number) {
  g.fillStyle = UI.line; g.fillRect(x, y, w, 2);
}

function dot(g: Ctx, x: number, y: number, r: number, color: string, ring = false) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (ring) { g.strokeStyle = color; g.lineWidth = 3; g.stroke(); }
  else { g.fillStyle = color; g.fill(); }
}

type Icon = 'pause' | 'stop' | 'play';

function icon(g: Ctx, kind: Icon, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color;
  if (kind === 'pause') {
    roundRect(g, cx - s * 0.42, cy - s * 0.5, s * 0.3, s, 3); g.fill();
    roundRect(g, cx + s * 0.12, cy - s * 0.5, s * 0.3, s, 3); g.fill();
  } else if (kind === 'stop') {
    roundRect(g, cx - s * 0.46, cy - s * 0.46, s * 0.92, s * 0.92, 4); g.fill();
  } else {
    g.beginPath(); g.moveTo(cx - s * 0.36, cy - s * 0.5); g.lineTo(cx + s * 0.5, cy); g.lineTo(cx - s * 0.36, cy + s * 0.5); g.closePath(); g.fill();
  }
}

/** `cta` pinta la acción principal de la pantalla en arcilla; sin él el botón es secundario (papel y borde fino). */
interface ButtonOpts { cta?: boolean; icon?: Icon }

function button(p: Panel, g: Ctx, id: string, x: number, y: number, w: number, h: number, label: string, onClick: () => void, o: ButtonOpts = {}) {
  const hot = p.hover === id;
  roundRect(g, x, y, w, h, 20);
  if (o.cta) {
    g.fillStyle = UI.accent; g.fill();
    if (hot) { g.strokeStyle = UI.text; g.lineWidth = 3; g.stroke(); }
  } else {
    g.fillStyle = hot ? UI.selected : UI.bg; g.fill();
    g.strokeStyle = UI.control; g.lineWidth = 3; g.stroke();
  }
  const color = o.cta ? UI.onAccent : UI.text;
  const lines = wrap(g, label, 600, 36, w - 28, 2);
  const block = lines.length * 42;
  const top = o.icon ? y + (h - block - 46) / 2 + 46 : y + (h - block) / 2;
  if (o.icon) icon(g, o.icon, x + w / 2, y + (h - block - 46) / 2 + 20, 34, color);
  lines.forEach((l, i) => text(g, l, x + w / 2, top + 31 + i * 42, 600, 36, color, 'center'));
  p.region(id, x, y, w, h, onClick);
}

function drawControl(p: Panel, g: Ctx, host: ConsoleHost) {
  const { px: [W, H] } = CONSOLE_SLOTS.control;
  surface(g, W, H);
  const pad = 24, inner = W - pad * 2, mode = host.run.mode;
  if (mode === 'stopped') {
    text(g, t(D, 'con.stopped'), pad, 70, 600, 40, UI.text);
    button(p, g, 'restart', pad, 104, inner, 180, t(D, 'con.restart'), () => host.restart(), { cta: true });
    button(p, g, 'exit', pad, 308, inner, 140, t(D, 'con.exit'), () => host.exitVR());
    return;
  }
  const paused = mode === 'paused';
  text(g, t(D, 'con.title'), pad, 62, 500, 36, UI.dim);
  const half = (inner - 14) / 2;
  button(p, g, 'pause', pad, 90, half, 164, t(D, paused ? 'con.resume' : 'con.pause'), () => host.setPaused(!paused), { cta: paused, icon: paused ? 'play' : 'pause' });
  button(p, g, 'stop', pad + half + 14, 90, half, 164, t(D, 'con.stop'), () => host.stop(), { icon: 'stop' });
  button(p, g, 'exit', pad, 276, inner, 150, t(D, 'con.exit'), () => host.exitVR());
}

function drawMission(g: Ctx, v: MissionView) {
  const { px: [W, H] } = CONSOLE_SLOTS.mission;
  surface(g, W, H);
  const pad = 34, inner = W - pad * 2;
  text(g, t(D, 'con.phase', { n: v.index + 1, total: v.total, label: v.label }), pad, 84, 600, 40, UI.text);
  let x = W - pad;
  for (let i = v.total - 1; i >= 0; i--) {
    const r = i === v.index ? 15 : 11;
    x -= r;
    if (i < v.index) dot(g, x, 70, r, UI.ok);
    else if (i === v.index) dot(g, x, 70, r, UI.accent);
    else dot(g, x, 70, r, UI.control, true);
    x -= r + 14;
  }
  text(g, v.figure.value, pad - 4, 248, 300, 150, UI.text);
  text(g, v.figure.caption, pad, 304, 400, 40, UI.dim);
  if (v.progress) {
    const barW = inner - 120, y = 338;
    roundRect(g, pad, y, barW, 16, 8); g.fillStyle = UI.selected; g.fill();
    const fill = Math.max(0, Math.min(1, v.progress.value)) * barW;
    if (fill > 1) { roundRect(g, pad, y, Math.max(fill, 16), 16, 8); g.fillStyle = UI.accent; g.fill(); }
    text(g, v.progress.text, W - pad, y + 22, 500, 40, UI.text, 'right');
  }
  const [site] = wrap(g, v.site, 500, 40, inner, 1);
  if (site) text(g, site, pad, 424, 500, 40, UI.dim);
  if (v.landing) text(g, v.landing, pad, 470, 500, 40, UI.dim);
}

function drawTelemetry(g: Ctx, v: TelemetryView) {
  const { px: [W, H] } = CONSOLE_SLOTS.telemetry;
  surface(g, W, H);
  const pad = 28, pitch = 148;
  v.items.forEach((it, i) => {
    const y = 38 + i * pitch;
    text(g, it.label, pad, y + 34, 500, 36, UI.dim);
    text(g, it.value, pad, y + 100, 600, 56, UI.text);
  });
}

function drawPhases(g: Ctx, v: PhasesView) {
  const { px: [W, H] } = CONSOLE_SLOTS.phases;
  surface(g, W, H);
  const pad = 26;
  text(g, t(D, 'con.phases'), pad, 54, 500, 26, UI.dim);
  v.labels.forEach((label, i) => {
    const cy = 92 + i * 44;
    if (i < v.current) dot(g, pad + 12, cy, 10, UI.ok);
    else if (i === v.current) dot(g, pad + 12, cy, 13, UI.accent);
    else dot(g, pad + 12, cy, 10, UI.control, true);
    text(g, label, pad + 42, cy + 9, i === v.current ? 700 : 500, 28, i > v.current ? UI.dim : UI.text);
  });
  hairline(g, pad, 322, W - pad * 2);
  text(g, t(D, 'con.mission'), pad, 362, 500, 26, UI.dim);
  const lines = wrap(g, v.site, 600, 28, W - pad * 2, 2);
  lines.forEach((l, i) => text(g, l, pad, 398 + i * 34, 600, 28, UI.text));
  if (v.landing) text(g, v.landing, pad, 398 + lines.length * 34 + 4, 500, 26, UI.dim);
}

function drawSite(g: Ctx, v: SiteView) {
  const { px: [W, H] } = CONSOLE_SLOTS.site;
  surface(g, W, H);
  const pad = 26;
  text(g, t(D, 'con.siteData'), pad, 54, 500, 26, UI.dim);
  const lines = wrap(g, v.name, 600, 30, W - pad * 2, 2);
  lines.forEach((l, i) => text(g, l, pad, 94 + i * 36, 600, 30, UI.text));
  let y = 94 + lines.length * 36 - 2;
  text(g, v.coords, pad, y, 500, 26, UI.dim);
  y += 14;
  for (const row of v.rows) {
    hairline(g, pad, y, W - pad * 2);
    text(g, row.label, pad, y + 28, 500, 24, UI.dim);
    // El estado se marca con un punto de la paleta y el texto queda en tinta (contraste AA).
    if (row.color) dot(g, pad + 8, y + 49, 8, row.color);
    text(g, row.value, row.color ? pad + 28 : pad, y + 58, 600, 30, UI.text);
    y += 62;
  }
}

/**
 * The cabin's own instruments for the landing: three panels over the painted console screens and two
 * wall screens. They replace the head-locked pause / exit panels while the landing is current.
 */
export class CabinConsole {
  readonly panels: Record<ConsoleId, Panel>;
  private views: Views;
  private keys: Record<(typeof LIVE_IDS)[number], string>;
  private mode: RunMode;
  private lastRefresh = -Infinity;
  private mounted = false;
  private disposed = false;

  constructor(private host: ConsoleHost, private readHud: () => PhaseHud) {
    this.views = readViews(host, readHud());
    this.mode = host.run.mode;
    const draw = (id: ConsoleId) => (p: Panel, g: Ctx) => {
      g.save();
      if (id === 'control') drawControl(p, g, host);
      else if (id === 'mission') drawMission(g, this.views.mission);
      else if (id === 'telemetry') drawTelemetry(g, this.views.telemetry);
      else if (id === 'phases') drawPhases(g, this.views.phases);
      else drawSite(g, this.views.site);
      g.restore();
    };
    this.panels = {} as Record<ConsoleId, Panel>;
    for (const id of CONSOLE_IDS) {
      const s = CONSOLE_SLOTS[id];
      this.panels[id] = new Panel(s.px[0], s.px[1], s.widthM, draw(id));
    }
    this.keys = this.keysOf(this.views);
  }

  private keysOf(v: Views) {
    return { mission: JSON.stringify(v.mission), telemetry: JSON.stringify(v.telemetry), phases: JSON.stringify(v.phases), site: JSON.stringify(v.site) };
  }

  /** El idioma cambió: las vistas se leen de nuevo (el HUD de la fase ya viene en el idioma nuevo) y los cinco paneles se repintan. */
  onLangChange() {
    if (this.disposed) return;
    this.views = readViews(this.host, this.readHud());
    this.keys = this.keysOf(this.views);
    this.lastRefresh = performance.now();
    for (const id of CONSOLE_IDS) this.panels[id].invalidate();
  }

  /** Puts the panels on the cabin wall and makes the control panel reachable by the rays even while paused. */
  mount(parent: THREE.Object3D) {
    for (const id of CONSOLE_IDS) {
      const s = CONSOLE_SLOTS[id], pose = cabinPose(s.azimuth, s.elevation, PANEL_RADIUS, this.host.eyeHeight);
      const mesh = this.panels[id].mesh;
      mesh.position.copy(pose.position);
      mesh.quaternion.copy(pose.quaternion);
      parent.add(mesh);
    }
    this.host.globalTargets.push(this.panels.control.mesh);
    this.mounted = true;
  }

  /** Every frame, running or not: redraws what changed, at most REFRESH_MS apart for the live readouts. */
  update() {
    if (!this.panels.control.mesh.visible) return;
    const mode = this.host.run.mode;
    if (mode !== this.mode) { this.mode = mode; this.panels.control.invalidate(); }
    const now = performance.now();
    if (now - this.lastRefresh >= REFRESH_MS) {
      this.lastRefresh = now;
      this.views = readViews(this.host, this.readHud());
      const keys = this.keysOf(this.views);
      for (const id of LIVE_IDS) {
        if (keys[id] !== this.keys[id]) { this.keys[id] = keys[id]; this.panels[id].invalidate(); }
      }
    }
    for (const id of CONSOLE_IDS) this.panels[id].update();
  }

  dispose() {
    this.disposed = true;
    if (this.mounted) {
      const at = this.host.globalTargets.indexOf(this.panels.control.mesh);
      if (at >= 0) this.host.globalTargets.splice(at, 1);
    }
    for (const id of CONSOLE_IDS) this.panels[id].dispose();
  }
}
