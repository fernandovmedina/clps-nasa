import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import type { LoopControl } from '../engine/audio';
import { Panel, UI, roundRect, statusColor, textLabel } from '../engine/panel';
import { starField } from '../engine/particles';
import { createMoon } from '../engine/moon';
import { earthTexture, glowTexture } from '../engine/textures';
import { DEG, damp, latLonToVec3, smooth } from '../engine/util';
import { globalDirAt } from '../mission/global-track';
import type { RoomEvent } from '../sync/room-client';
import { evaluateSites, fmtHours, type SiteMetrics } from '../mission/scoring';
import { devFallbackMission, rankingNote, type MissionData, type RankRowExtras } from '../mission/sites';
import { clearSurface } from './surface-world';
import { STATUS_LABELS, STATUS_TONES, fmtPercent, fmtSigned, type HudRankRow, type PhaseHud } from '../engine/hud';

const R = 1000;               // moon radius in scene units (1 u ≈ 1.74 km)
const ORBIT_ALT = 150;
const LAP = 20;               // seconds for the scanning orbit
const STATION_LAT = -70;      // where the spacecraft parks to show the south pole
// Keeps the camera gently swaying after the scan lap instead of freezing (a fully static shot
// reads as "already landed", not orbiting). Bounded, not monotonic: look is pinned at the pole
// and up=radial for the whole parked phase, so a full sweep through ±90°/270° would make up and
// forward momentarily parallel (lookAt singularity → visible horizon snap). Staying within this
// amplitude of STATION_LAT keeps well clear of those angles.
const PARK_DRIFT_AMPLITUDE_DEG = 15;
const PARK_DRIFT_PERIOD_S = 50;
const DELAY_OPTIONS = [7, 14, 21, 30]; // days - matches the delay narrative in CLAUDE.md sec. 3
const SUN_DIST = 5000, SUN_SPRITE_DIST = 150000, EARTHSHINE_DIST = 5000, EARTH_DIST = 60000;

interface Marker {
  m: SiteMetrics; group: THREE.Group; beam: THREE.Mesh; head: THREE.Mesh; ring: THREE.Mesh;
  /** Full label (rank, score/100, name, note) and the rank-only chip that stands in for it. */
  label: THREE.Sprite; chip: THREE.Sprite; shown: number; hover: boolean;
}

export interface PinRect { x: number; y: number; w: number; h: number }
export type PinLabelMode = 'full' | 'chip' | 'hidden';
export interface PinLabelCandidate {
  id: string; rank: number; selected: boolean; hover: boolean;
  /** Screen box (px) the full label would take, and the one the rank chip would take. */
  full: PinRect; chip: PinRect;
}

/** Pins that always show their full label, by rank; the selected and the hovered pin join them. */
const FULL_LABEL_RANKS = 3;
const NAME_MAX_CHARS = 26;

export function rectsOverlap(a: PinRect, b: PinRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Decides what each pin shows: the full label for the top ranks, the selected and the hovered one (the latter
 * two win ties); everything else a rank chip. Whatever would land on something already shown is dropped, the
 * worse rank first, so no two visible boxes ever overlap (an overlapped full label falls back to its chip).
 */
export function planPinLabels(pins: PinLabelCandidate[]): Map<string, PinLabelMode> {
  const modes = new Map<string, PinLabelMode>();
  const shown: PinRect[] = [];
  const free = (r: PinRect) => !shown.some((o) => rectsOverlap(r, o));
  const priority = (p: PinLabelCandidate) => (p.selected || p.hover ? 0 : 1);
  const byPriority = [...pins].sort((a, b) => priority(a) - priority(b) || a.rank - b.rank);

  for (const p of byPriority) {
    if (priority(p) === 1 && p.rank > FULL_LABEL_RANKS) continue;
    if (!free(p.full)) continue;
    modes.set(p.id, 'full');
    shown.push(p.full);
  }
  for (const p of [...pins].sort((a, b) => a.rank - b.rank)) {
    if (modes.has(p.id)) continue;
    if (free(p.chip)) { modes.set(p.id, 'chip'); shown.push(p.chip); } else modes.set(p.id, 'hidden');
  }
  return modes;
}

/** three.js raycasts invisible objects too: a hidden label moves to a layer the pointer ray does not use. */
function setSpriteShown(sprite: THREE.Sprite, shown: boolean) {
  sprite.visible = shown;
  sprite.layers.set(shown ? 0 : 1);
}

const scoreOf100 = (m: SiteMetrics) => `${Math.round(m.score)}/100`;
const shortName = (name: string) => (name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS - 1).trimEnd()}…` : name);

/** Rows of the DOM ranking: HudRankRow plus the note that tells demo and contrast sites apart. */
type OrbitRankRow = HudRankRow & RankRowExtras;

export function defaultMission(): MissionData {
  return devFallbackMission();
}

/** Phase 2 — orbit the Moon, scan the south pole and rank the candidate sites. */
export class OrbitPhase implements Phase {
  readonly name = 'orbit' as const;
  readonly scene = new THREE.Scene();
  targets: THREE.Object3D[] = [];
  private t = 0;
  private markers: Marker[] = [];
  private revealed = 0;
  private analysisDone = false;
  private narratedCriteria = false;
  private list: Panel; private detail: Panel;
  private stars = starField();
  private ranking: SiteMetrics[];
  private baseRanking: SiteMetrics[]; // at the original landing date, for before/after delta
  private date: Date;
  private baseDate: Date;
  private delayDays = 0;
  private maxDelayDays: number;
  private rangeWarning: string | null = null;
  private data: MissionData;
  private sunLight!: THREE.DirectionalLight;
  private sunSprite!: THREE.Sprite;
  private earthshineLight!: THREE.DirectionalLight;
  private earthMesh!: THREE.Mesh;
  private lastRoomStatus: string;
  private ambient: LoopControl | null = null;

  constructor(private app: LunarApp) {
    clearSurface();
    if (app.flags.has('orbit-done')) this.t = LAP + 0.01; // coming back: skip the scan lap
    const data = app.data ?? defaultMission();
    app.data = data;
    this.data = data;
    this.baseDate = data.landingDate;
    this.date = data.landingDate;
    this.maxDelayDays = Math.floor((data.ephemerisRange.end.getTime() - this.baseDate.getTime()) / 86_400_000);
    this.ranking = evaluateSites(data.sites, data.landingDate);
    this.baseRanking = this.ranking;
    app.ranking = this.ranking;
    this.lastRoomStatus = app.room.status;

    const sc = this.scene;
    sc.background = new THREE.Color(0x000003);
    sc.add(this.stars);
    sc.add(new THREE.HemisphereLight(0x8899aa, 0x111111, 0.3));
    this.earthshineLight = new THREE.DirectionalLight(0x9db8e8, 0.9); // fill from the Earth so the dark pole stays readable
    this.earthshineLight.position.copy(globalDirAt(data.global, this.date, 'earth')).multiplyScalar(EARTHSHINE_DIST);
    sc.add(this.earthshineLight);
    const sunDir = globalDirAt(data.global, this.date, 'sun');
    this.sunLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
    this.sunLight.position.copy(sunDir).multiplyScalar(SUN_DIST);
    sc.add(this.sunLight, this.sunLight.target);
    const glow = glowTexture();
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunSprite.position.copy(sunDir).multiplyScalar(SUN_SPRITE_DIST); this.sunSprite.scale.setScalar(12000); sc.add(this.sunSprite);

    sc.add(createMoon(R, app.moonTex, 256));
    // cheap invisible proxy so markers behind the Moon can't be picked
    const blocker = new THREE.Mesh(new THREE.SphereGeometry(R * 0.998, 32, 16), new THREE.MeshBasicMaterial({ visible: false }));
    blocker.userData.blocker = true;
    sc.add(blocker);
    this.targets.push(blocker);

    this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9 }));
    this.earthMesh.position.copy(globalDirAt(data.global, this.date, 'earth')).multiplyScalar(EARTH_DIST);
    sc.add(this.earthMesh);

    // orbit track
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(R + ORBIT_ALT)); }
    sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd97757, transparent: true, opacity: 0.25 })));

    // site markers
    for (const m of this.ranking) this.markers.push(this.makeMarker(m));

    this.list = new Panel(1024, 1300, 0.64, (p, g) => this.drawList(p, g));
    this.detail = new Panel(1024, 1300, 0.64, (p, g) => this.drawDetail(p, g));
    this.targets.push(this.list.mesh, this.detail.mesh);
  }

  private makeMarker(m: SiteMetrics): Marker {
    const group = new THREE.Group();
    const n = latLonToVec3(m.site.lat, m.site.lon).normalize();
    group.position.copy(n).multiplyScalar(R);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const color = new THREE.Color(statusColor(m.status));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 30;
    const head = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color }));
    head.position.y = 62;
    const ring = new THREE.Mesh(new THREE.RingGeometry(7, 9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6;
    const { label, chip } = this.makePinLabels(m);
    // a fat invisible hit target so it's easy to point at in VR
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 100, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 50;
    group.add(beam, head, ring, label, chip, hit);
    group.visible = false;
    group.scale.setScalar(0.001);
    const mk: Marker = { m, group, beam, head, ring, label, chip, shown: 0, hover: false };
    group.userData.onSelect = () => this.select(m);
    group.userData.onHover = (h: boolean) => { mk.hover = h; };
    this.scene.add(group);
    this.targets.push(group);
    return mk;
  }

  private makePinLabels(m: SiteMetrics) {
    const color = statusColor(m.status);
    const demo = !!m.site.crash;
    const note = rankingNote(m.site);
    const lines: Parameters<typeof textLabel>[0] = [
      { text: demo ? `#${m.rank}  ·  DEMO` : `#${m.rank}  ·  ${scoreOf100(m)}`, size: 52, color, mono: true, weight: 800 },
      { text: shortName(m.site.name), size: 34 },
      ...(note ? note.split(' · ').map((part) => ({ text: part, size: 26, color: UI.dim })) : []),
    ];
    const label = textLabel(lines, 46);
    label.position.y = 82;
    const chip = textLabel([{ text: `#${m.rank}`, size: 64, color, mono: true, weight: 800 }], 18);
    chip.position.y = 76;
    setSpriteShown(chip, false);
    return { label, chip };
  }

  /** The label sprites are baked once; after a delay the scores and ranks change, so they are rebuilt. */
  private refreshPinLabels(mk: Marker) {
    mk.group.remove(mk.label, mk.chip);
    for (const sprite of [mk.label, mk.chip]) { (sprite.material.map as THREE.Texture | null)?.dispose(); sprite.material.dispose(); }
    const { label, chip } = this.makePinLabels(mk.m);
    mk.label = label; mk.chip = chip;
    mk.group.add(label, chip);
  }

  private select(m: SiteMetrics, opts: { broadcast?: boolean } = {}) {
    if (m.rank <= this.ranking.length - this.revealed) return; // not evaluated yet
    if (opts.broadcast !== false) this.app.audio.play('ui_select');
    this.app.selected = m;
    this.list.invalidate(); this.detail.invalidate();
    if (opts.broadcast !== false) this.app.room.send({ type: 'set_site', site_id: m.site.id });
  }

  /** set_site/state from another tab/headset in the same room - never re-broadcasts. */
  private applyRemoteSite(siteId: string) {
    const m = this.ranking.find((r) => r.site.id === siteId);
    if (m) this.select(m, { broadcast: false });
  }

  /** set_time/state from another tab/headset in the same room - never re-broadcasts. */
  private applyRemoteTime(iso: string) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return;
    const days = Math.round((ms - this.baseDate.getTime()) / 86_400_000);
    this.applyDelay(days, { broadcast: false });
  }

  private handleRoomEvent(msg: RoomEvent) {
    this.app.applyMarkerEvent(msg);
    switch (msg.type) {
      case 'state':
        this.applyRemoteTime(msg.t);
        this.applyRemoteSite(msg.site_id);
        return;
      case 'set_site':
        this.applyRemoteSite(msg.site_id);
        return;
      case 'set_time':
        this.applyRemoteTime(msg.t);
        return;
      case 'cam_update':
        // Mirror mode: the host only sends cam_update once it's in pov.ts inspecting a site.
        // The monitor would otherwise have to manually click the same site/phase to follow -
        // auto-follow here so handing over the room code is enough to mirror the VR view.
        if (!this.app.isHost && this.analysisDone) {
          this.applyRemoteSite(msg.site_id);
          if (this.app.selected?.site.id === msg.site_id) this.app.goTo('pov', 0.6, 1.0);
        }
        return;
      default:
        return; // hello/ping never relayed; marker_* already applied above (applyMarkerEvent) - no UI to update in this phase
    }
  }

  /**
   * The delay button: recompute the whole ranking at landing date + N days, in
   * place. Never mutates state on failure - computes everything speculatively
   * first, and surfaces a visible warning (not a silent revert) if the
   * requested date falls outside the precomputed ephemeris range.
   */
  private applyDelay(days: number, opts: { broadcast?: boolean } = {}) {
    if (days === this.delayDays) return;
    if (days > this.maxDelayDays || days < 0) {
      this.rangeWarning = `${days >= 0 ? '+' : ''}${days} d fuera de rango · 0 a +${this.maxDelayDays} d con los datos precalculados`;
      this.list.invalidate();
      return;
    }

    const date = new Date(this.baseDate.getTime() + days * 86_400_000);
    let next: SiteMetrics[];
    try {
      next = evaluateSites(this.data.sites, date);
    } catch (e) {
      this.rangeWarning = `No se pudo calcular +${days} d: ${e instanceof Error ? e.message : String(e)}`;
      this.list.invalidate();
      return;
    }

    this.rangeWarning = null;
    this.delayDays = days;
    this.date = date;
    this.data.landingDate = date; // downstream phases (pov.ts) read app.data.landingDate
    this.ranking = next;
    this.app.ranking = next;

    const byId = new Map(next.map((m) => [m.site.id, m]));
    const prevSelectedId = this.app.selected?.site.id;
    this.app.selected = prevSelectedId ? byId.get(prevSelectedId) ?? null : null;
    for (const mk of this.markers) { mk.m = byId.get(mk.m.site.id)!; this.refreshPinLabels(mk); }

    const sunDir = globalDirAt(this.data.global, date, 'sun');
    const earthDir = globalDirAt(this.data.global, date, 'earth');
    this.sunLight.position.copy(sunDir).multiplyScalar(SUN_DIST);
    this.sunSprite.position.copy(sunDir).multiplyScalar(SUN_SPRITE_DIST);
    this.earthshineLight.position.copy(earthDir).multiplyScalar(EARTHSHINE_DIST);
    this.earthMesh.position.copy(earthDir).multiplyScalar(EARTH_DIST);

    this.list.invalidate(); this.detail.invalidate();
    if (opts.broadcast !== false) this.app.room.send({ type: 'set_time', t: date.toISOString() });
  }

  enter() {
    const rig = this.app.rig;
    rig.add(this.list.mesh, this.detail.mesh);
    this.list.place(-0.86, 1.36, -1.5);
    this.detail.place(0.86, 1.36, -1.5);
    if (!this.app.flags.has('orbit-done')) this.app.selected = null;
    this.placeViewer(this.t, true);
    this.app.room.setListener((msg) => this.handleRoomEvent(msg));
    this.ambient = this.app.audio.loop('orbit_ambient');
  }

  exit() {
    this.ambient?.stop();
    this.app.room.setListener(null);
    this.list.dispose(); this.detail.dispose();
  }

  private orbitAngle(t: number) {
    const k = smooth(0, LAP, t);
    const drift = t > LAP ? PARK_DRIFT_AMPLITUDE_DEG * Math.sin((t - LAP) * ((2 * Math.PI) / PARK_DRIFT_PERIOD_S)) : 0;
    return (STATION_LAT + 360 * (1 - k) + drift) * DEG;
  }

  private placeViewer(t: number, snap = false) {
    const a = this.orbitAngle(t);
    const k = smooth(0, LAP, t);
    const r = THREE.MathUtils.lerp(R * 3.2, R + ORBIT_ALT, Math.min(1, k * 1.6));
    const radial = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const eye = radial.clone().multiplyScalar(r);
    const ahead = new THREE.Vector3(Math.cos(a - 0.5), Math.sin(a - 0.5), 0).multiplyScalar(R);
    const pole = new THREE.Vector3(0, -R, 0);
    const look = ahead.lerp(pole, smooth(LAP * 0.7, LAP, t));
    this.app.setView(eye, look, { up: radial, rate: 2.2, snap });
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.placeViewer(t);
    if (this.app.room.status !== this.lastRoomStatus) {
      this.lastRoomStatus = this.app.room.status;
      this.list.invalidate();
    }
    const camPos = new THREE.Vector3().setFromMatrixPosition(this.app.camera.matrixWorld);
    this.stars.position.copy(camPos);

    // t < LAP also guards the "coming back from pov.ts" case, where the constructor starts
    // t at LAP+0.01 to skip the scan lap entirely - no need to re-explain it then.
    if (!this.narratedCriteria && t > 1.5 && t < LAP) {
      this.narratedCriteria = true;
      this.app.narrator.say('siteCriteria');
    }

    // reveal + "compute" sites one by one during the scanning lap (worst → best for drama)
    const target = Math.min(this.ranking.length, Math.floor(smooth(LAP * 0.15, LAP * 0.92, t) * this.ranking.length + 0.0001));
    if (target > this.revealed && t < LAP) this.app.audio.play('scan_blip');
    if (target !== this.revealed) { this.revealed = target; this.list.invalidate(); this.detail.invalidate(); }
    if (!this.analysisDone && t > LAP) {
      this.analysisDone = true;
      this.app.flags.add('orbit-done');
      if (!this.app.selected) this.app.selected = this.ranking.find((m) => m.site.id === this.data.requestedSiteId) ?? this.ranking[0];
      this.list.invalidate(); this.detail.invalidate();
    }

    const order = [...this.markers].sort((a, b) => b.m.rank - a.m.rank); // reveal worst first
    order.forEach((mk, i) => {
      const on = i < this.revealed;
      mk.shown += ((on ? 1 : 0) - mk.shown) * damp(4, dt);
      mk.group.visible = mk.shown > 0.01;
      const sel = this.app.selected === mk.m;
      const s = mk.shown * (sel ? 1.5 : mk.hover ? 1.25 : 1) * (this.analysisDone && mk.m.rank === 1 ? 1.15 : 1);
      mk.group.scale.setScalar(Math.max(0.001, s));
      const pulse = 1 + 0.25 * Math.sin(t * 3 + mk.m.rank);
      mk.ring.scale.setScalar(sel ? pulse * 1.4 : pulse);
      (mk.head.material as THREE.MeshBasicMaterial).color.set(sel ? 0xffffff : statusColor(mk.m.status));
      (mk.beam.material as THREE.MeshBasicMaterial).opacity = sel ? 0.9 : 0.5;
    });
    this.layoutPinLabels();

    this.list.update(); this.detail.update();
  }

  /** Sites evaluated so far and in all, not counting the NO CAER demo case (it is no site). */
  private realCounts() {
    const evaluated = [...this.ranking].sort((a, b) => b.rank - a.rank).slice(0, this.revealed);
    return { revealed: evaluated.filter((m) => !m.site.crash).length, total: this.ranking.filter((m) => !m.site.crash).length };
  }

  /** Screen box of a sprite, in CSS px of the canvas; null when it sits behind the camera. */
  private spriteRect(sprite: THREE.Sprite, width: number, height: number): PinRect | null {
    const cam = this.app.camera;
    const world = sprite.getWorldPosition(new THREE.Vector3());
    const depth = -world.clone().applyMatrix4(cam.matrixWorldInverse).z;
    if (depth <= 0) return null;
    const scale = sprite.getWorldScale(new THREE.Vector3());
    const pxPerUnit = (cam.projectionMatrix.elements[5] * height) / 2 / depth;
    const w = scale.x * pxPerUnit, h = scale.y * pxPerUnit;
    const ndc = world.project(cam);
    return { x: (ndc.x * 0.5 + 0.5) * width - w / 2, y: (-ndc.y * 0.5 + 0.5) * height - h / 2, w, h };
  }

  /** Shows per pin the full label, its rank chip or nothing, from where the labels land on screen. */
  private layoutPinLabels() {
    const canvas = this.app.renderer.domElement;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const cam = new THREE.Vector3().setFromMatrixPosition(this.app.camera.matrixWorld);
    const candidates: PinLabelCandidate[] = [];
    const facing = new Set<Marker>();
    for (const mk of this.markers) {
      setSpriteShown(mk.label, false); setSpriteShown(mk.chip, false);
      if (!mk.group.visible) continue;
      const toCam = cam.clone().sub(mk.group.position);
      if (toCam.dot(mk.group.position) <= 0) continue; // on the far side of the Moon
      mk.group.updateMatrixWorld(true);
      // in the headset there is no single screen to overlap on: the rank rule alone decides
      const full = this.app.isXR || !width ? { x: mk.m.rank * 1e5, y: 0, w: 1, h: 1 } : this.spriteRect(mk.label, width, height);
      const chip = this.app.isXR || !width ? { x: mk.m.rank * 1e5, y: 0, w: 1, h: 1 } : this.spriteRect(mk.chip, width, height);
      if (!full || !chip) continue;
      facing.add(mk);
      candidates.push({ id: mk.m.site.id, rank: mk.m.rank, selected: this.app.selected === mk.m, hover: mk.hover, full, chip });
    }
    const modes = planPinLabels(candidates);
    for (const mk of facing) {
      const mode = modes.get(mk.m.site.id);
      setSpriteShown(mk.label, mode === 'full');
      setSpriteShown(mk.chip, mode === 'chip');
    }
  }

  /* ---------------- panels ---------------- */
  private drawList(p: Panel, g: CanvasRenderingContext2D) {
    p.frame(g);
    g.font = `700 40px ${UI.font}`; g.fillStyle = UI.text; g.fillText('Sitios evaluados', 48, 86);
    this.drawRoomBadge(g);
    g.font = `500 26px ${UI.mono}`; g.fillStyle = this.delayDays ? UI.warn : UI.dim;
    const delayTag = this.delayDays ? `  ·  retraso +${this.delayDays} d` : '';
    g.fillText(`Alunizaje ${this.date.toISOString().slice(0, 16).replace('T', ' ')} UTC${delayTag}`, 48, 128);
    const { revealed, total } = this.realCounts();
    g.font = `500 26px ${UI.mono}`;
    g.fillStyle = this.analysisDone ? UI.ok : UI.accent;
    g.fillText(this.analysisDone ? 'Ranking final · toca un sitio' : `Calculando óptimo… ${revealed}/${total}`, 48, 166);

    if (this.analysisDone) this.drawDelayRow(p, g);

    // provisional ranking among the evaluated sites
    const evaluated = [...this.ranking].sort((a, b) => b.rank - a.rank).slice(0, this.revealed).sort((a, b) => a.rank - b.rank);
    const rowH = 96, y0 = this.analysisDone ? 285 : 200;
    evaluated.forEach((m, i) => {
      const y = y0 + i * rowH;
      const sel = this.app.selected === m, hov = p.hover === `row-${m.site.id}`;
      if (sel || hov) { roundRect(g, 28, y, 968, rowH - 10, 18); g.fillStyle = sel ? 'rgba(217,119,87,.18)' : 'rgba(250,249,245,.07)'; g.fill(); }
      const col = statusColor(m.status);
      roundRect(g, 44, y + 18, 58, 58, 14); g.fillStyle = col; g.fill();
      g.font = `800 30px ${UI.mono}`; g.fillStyle = UI.onAccent; g.textAlign = 'center'; g.fillText(`${i + 1}`, 73, y + 58); g.textAlign = 'left';
      g.font = `600 32px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 124, y + 44);
      const note = rankingNote(m.site);
      g.font = `500 22px ${UI.mono}`; g.fillStyle = m.site.crash ? UI.warn : UI.dim;
      if (m.site.crash) g.fillText(note!, 124, y + 78);
      else if (note) g.fillText(`${note}  ·  SOL ${m.illumPct.toFixed(0)}%  ·  TIERRA ${m.earthPct.toFixed(0)}%`, 124, y + 78);
      else g.fillText(`SOL ${m.illumPct.toFixed(0)}%  ·  TIERRA ${m.earthPct.toFixed(0)}%  ·  AMBOS ${Math.round(m.breakdown.ops * 100)}%`, 124, y + 78);
      g.font = `800 36px ${UI.mono}`; g.fillStyle = col; g.textAlign = 'right'; g.fillText(scoreOf100(m), 972, y + 60); g.textAlign = 'left';
      if (this.delayDays) {
        const base = this.baseRanking.find((r) => r.site.id === m.site.id);
        if (base) {
          const d = Math.round(m.score - base.score);
          g.font = `600 22px ${UI.mono}`; g.fillStyle = d > 0 ? UI.ok : d < 0 ? UI.bad : UI.dim;
          g.textAlign = 'right'; g.fillText(d === 0 ? '± 0' : (d > 0 ? `↑ +${d}` : `↓ ${d}`), 972, y + 86); g.textAlign = 'left';
        }
      }
      p.region(`row-${m.site.id}`, 28, y, 968, rowH - 10, () => this.select(m));
    });
    if (!this.analysisDone) {
      const w = 928 * (revealed / total);
      roundRect(g, 48, 1240, 928, 10, 5); g.fillStyle = 'rgba(250,249,245,.15)'; g.fill();
      if (w > 1) { roundRect(g, 48, 1240, w, 10, 5); g.fillStyle = UI.accent; g.fill(); }
    }
  }

  /** Small "connected to the shared room" badge, top-right of the list panel. */
  private drawRoomBadge(g: CanvasRenderingContext2D) {
    const status = this.app.room.status;
    const color = status === 'open' ? UI.ok : status === 'connecting' ? UI.warn : 'rgba(250,249,245,.35)';
    const label = status === 'open' ? `sincronizado · sala "${this.app.room.room}"` : status === 'connecting' ? 'conectando…' : 'sin conexión (local)';
    g.font = `600 20px ${UI.mono}`; g.textAlign = 'right';
    g.fillStyle = color; g.fillText('●', 968, 82);
    g.fillStyle = UI.dim; g.fillText(label, 950, 82);
    g.textAlign = 'left';
  }

  /** Row of delay buttons: "the mission got delayed N days, what breaks?" */
  private drawDelayRow(p: Panel, g: CanvasRenderingContext2D) {
    g.font = `500 22px ${UI.mono}`; g.fillStyle = UI.dim; g.fillText('SIMULAR RETRASO', 48, 196);
    const y = 206, h = 56, gap = 12, w = (928 - gap * (DELAY_OPTIONS.length + 1)) / (DELAY_OPTIONS.length + 1);
    let x = 48;
    for (const days of DELAY_OPTIONS) {
      const outOfRange = days > this.maxDelayDays;
      if (outOfRange) {
        // Disabled, not clickable - no p.region/p.button, drawn dimmed directly.
        roundRect(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(250,249,245,.03)'; g.fill();
        g.strokeStyle = UI.line; g.lineWidth = 2; g.stroke();
        g.font = `600 ${Math.round(h * 0.34)}px ${UI.font}`; g.fillStyle = 'rgba(250,249,245,.3)';
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`+${days} d`, x + w / 2, y + h / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      } else {
        p.button(g, `delay-${days}`, x, y, w, h, `+${days} d`, () => this.applyDelay(days), this.delayDays === days ? 'primary' : 'ghost');
      }
      x += w + gap;
    }
    p.button(g, 'delay-reset', x, y, w, h, '↺ original', () => this.applyDelay(0), this.delayDays === 0 ? 'primary' : 'ghost');

    if (this.rangeWarning) {
      g.font = `600 20px ${UI.mono}`; g.fillStyle = UI.warn;
      g.fillText(this.rangeWarning, 48, 280);
    }
  }

  private drawDetail(p: Panel, g: CanvasRenderingContext2D) {
    p.frame(g);
    const m = this.app.selected;
    if (!m) {
      g.font = `600 34px ${UI.font}`; g.fillStyle = UI.dim; g.textAlign = 'center';
      g.fillText(this.analysisDone ? 'Toca un punto o una fila' : 'Analizando iluminación y enlace…', 512, 640);
      g.textAlign = 'left';
      return;
    }
    const col = statusColor(m.status);
    g.font = `700 44px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 48, 92);
    g.font = `500 26px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`${Math.abs(m.site.lat).toFixed(2)}°S  ${m.site.lon.toFixed(2)}°${m.site.lon >= 0 ? 'E' : 'W'}  ·  elev. +${m.site.elevationKm.toFixed(1)} km`, 48, 134);
    if (m.site.crash) { this.drawDemoDetail(p, g, m); return; }
    g.font = `800 96px ${UI.mono}`; g.fillStyle = col; g.fillText(`${Math.round(m.score)}`, 48, 250);
    const bigWidth = g.measureText(`${Math.round(m.score)}`).width;
    g.font = `700 36px ${UI.mono}`; g.fillText('/100', 48 + bigWidth + 8, 250);
    g.font = `600 28px ${UI.font}`; g.fillStyle = UI.text; g.fillText(`Viabilidad · puesto #${m.rank} de ${this.realCounts().total}`, 400, 222);
    if (this.delayDays) {
      const base = this.baseRanking.find((r) => r.site.id === m.site.id);
      if (base) {
        const d = Math.round(m.score - base.score);
        g.font = `700 26px ${UI.mono}`; g.fillStyle = d > 0 ? UI.ok : d < 0 ? UI.bad : UI.dim;
        g.fillText(`antes ${scoreOf100(base)} → ahora ${scoreOf100(m)} · +${this.delayDays} d`, 400, 258);
      }
    }

    const rows: [string, string][] = [
      ['Elevación solar', `${m.sun.elevation.toFixed(2)}°`],
      ['Azimut solar', `${m.sun.azimuth.toFixed(0)}°`],
      ['Iluminación (14 d)', `${m.illumPct.toFixed(0)}%`],
      ['Puesta de sol en', m.sun.aboveHorizon > -0.27 ? fmtHours(m.hoursToSunset) : 'en sombra'],
      ['Elevación Tierra', `${m.earth.elevation.toFixed(2)}°`],
      ['Visibilidad Tierra', `${m.earthPct.toFixed(0)}%`],
      ['Ocaso de la Tierra en', m.earth.aboveHorizon > 0 ? fmtHours(m.hoursToEarthset) : 'sin enlace'],
      ['Sol + Tierra a la vez', `${Math.round(m.breakdown.ops * 100)}%`],
      ['Noche más larga', fmtHours(m.longestDarkH)],
      ['Disco solar visible', `${m.powerPct}%`],
    ];
    rows.forEach(([k, v], i) => {
      const x = 48 + (i % 2) * 480, y = 310 + Math.floor(i / 2) * 96;
      g.font = `500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k.toUpperCase(), x, y);
      g.font = `700 38px ${UI.mono}`; g.fillStyle = UI.text; g.fillText(v, x, y + 44);
    });

    const bars: [string, number][] = [
      ['Energía · 30%', m.breakdown.energy], ['Enlace Tierra · 25%', m.breakdown.comms],
      ['Sol + Tierra · 30%', m.breakdown.ops], ['Continuidad · 15%', m.breakdown.continuity],
    ];
    bars.forEach(([k, v], i) => {
      const y = 820 + i * 52;
      g.font = `500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k, 48, y + 18);
      roundRect(g, 300, y, 660, 16, 8); g.fillStyle = 'rgba(250,249,245,.12)'; g.fill();
      if (v > 0.01) { roundRect(g, 300, y, 660 * v, 16, 8); g.fillStyle = col; g.fill(); }
    });
    const contrast = rankingNote(m.site);
    if (contrast) { g.font = `600 24px ${UI.font}`; g.fillStyle = UI.warn; g.fillText(contrast, 48, 1076); }
    if (m.site.note) { g.font = `italic 500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(m.site.note, 48, 1112); }
    this.drawPreconfirm(p, g, m);
  }

  private drawPreconfirm(p: Panel, g: CanvasRenderingContext2D, m: SiteMetrics) {
    if (this.analysisDone) {
      p.button(g, 'preconfirm', 48, 1150, 928, 100, 'Preconfirmar punto', () => {
        this.app.audio.play('ui_confirm');
        this.app.selected = m;
        this.app.room.send({ type: 'set_site', site_id: m.site.id }); // keeps room state in sync even when m was auto-selected (never went through select())
        this.app.goTo('pov', 0.8, 1.2);
      });
    } else {
      g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText('Esperando el ranking final…', 48, 1210);
    }
  }

  /** NO CAER lends its terrain and ephemeris from a real site: no score, readouts or bars of its own are drawn. */
  private drawDemoDetail(p: Panel, g: CanvasRenderingContext2D, m: SiteMetrics) {
    g.font = `800 52px ${UI.font}`; g.fillStyle = statusColor(m.status); g.fillText('Caso de demostración', 48, 250);
    g.font = `600 36px ${UI.font}`; g.fillStyle = UI.text; g.fillText('Falla simulada del motor', 48, 306);
    g.font = `500 28px ${UI.font}`; g.fillStyle = UI.dim;
    ['No es un sitio real: no tiene puntaje ni lecturas propias.', 'El descenso termina en impacto y la misión regresa a órbita.'].forEach((line, i) => g.fillText(line, 48, 380 + i * 42));
    if (m.site.note) { g.font = `italic 500 24px ${UI.font}`; g.fillText(m.site.note, 48, 1112); }
    this.drawPreconfirm(p, g, m);
  }

  controlHud(): PhaseHud {
    const { revealed, total } = this.realCounts();
    const done = this.analysisDone;
    const chosen = this.app.selected;
    const m = chosen ? this.ranking.find((r) => r.site.id === chosen.site.id) ?? chosen : null;
    const base = m ? this.baseRanking.find((r) => r.site.id === m.site.id) : undefined;
    const evaluated = [...this.ranking].sort((a, b) => b.rank - a.rank).slice(0, this.revealed).sort((a, b) => a.rank - b.rank);
    const rows: OrbitRankRow[] = evaluated.map((r) => {
      const was = this.delayDays ? this.baseRanking.find((b) => b.site.id === r.site.id) : undefined;
      return {
        id: `site-${r.site.id}`, rank: r.rank, name: r.site.name, score: Math.round(r.score), status: r.status,
        selected: chosen?.site.id === r.site.id, delta: was ? Math.round(r.score - was.score) : undefined, run: () => this.select(r),
        note: rankingNote(r.site), demo: r.site.crash || undefined,
      };
    });

    let detail = 'Ranking final · elige un sitio de la lista o un pin de la escena';
    if (this.rangeWarning) detail = this.rangeWarning;
    else if (!done) detail = `Calculando óptimo… ${revealed}/${total}`;
    else if (this.delayDays && m && base) detail = `Con +${this.delayDays} d de retraso: antes ${scoreOf100(base)} → ahora ${scoreOf100(m)}`;
    const note = done && m && !this.rangeWarning ? rankingNote(m.site) : undefined;
    if (note) detail = m!.site.crash ? `${note} · no es un sitio real, no tiene puntaje` : `${note} · ${detail}`;

    const delays = [...DELAY_OPTIONS.map((days) => ({
      id: `delay-${days}`, label: `+${days} d`, pressed: this.delayDays === days, disabled: days > this.maxDelayDays, run: () => this.applyDelay(days),
    })), { id: 'delay-reset', label: 'Original', pressed: this.delayDays === 0, run: () => this.applyDelay(0) }];

    return {
      figure: done && m?.site.crash
        ? { value: 'DEMO', caption: `${m.site.name} · falla simulada del motor` }
        : done && m
        ? { value: String(Math.round(m.score)), caption: `de 100 · ${m.site.name}`, badge: { label: STATUS_LABELS[m.status], tone: STATUS_TONES[m.status] } }
        : { value: `${revealed} de ${total}`, caption: 'sitios evaluados' },
      detail,
      progress: done ? undefined : { value: total ? revealed / total : 0, label: 'Evaluación de sitios' },
      facts: done && m && !m.site.crash ? [
        { label: 'Elevación solar', value: `${fmtSigned(m.sun.elevation, 2)}°` },
        { label: 'Iluminación en 14 d', value: fmtPercent(m.illumPct) },
        { label: 'Elevación de la Tierra', value: `${fmtSigned(m.earth.elevation, 2)}°` },
        { label: 'Tierra visible', value: fmtPercent(m.earthPct) },
      ] : undefined,
      toggles: done ? { label: 'Simular retraso', options: delays } : undefined,
      side: { kind: 'ranking', title: 'Sitios evaluados', rows },
      primary: {
        id: 'preconfirm', label: 'Preconfirmar punto', disabled: !done || !m,
        run: () => {
          if (!m) return;
          this.app.audio.play('ui_confirm');
          this.app.selected = m;
          this.app.room.send({ type: 'set_site', site_id: m.site.id });
          this.app.goTo('pov', 0.8, 1.2);
        },
      },
    };
  }
}
