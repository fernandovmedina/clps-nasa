import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import { Panel, UI, roundRect, textLabel } from '../engine/panel';
import { starField } from '../engine/particles';
import { createMoon } from '../engine/moon';
import { earthTexture, glowTexture } from '../engine/textures';
import { DEG, damp, latLonToVec3, smooth } from '../engine/util';
import { earthDirAt, evaluateSites, fmtHours, scoreColor, sunDirAt, type SiteMetrics } from '../mission/scoring';
import { DEFAULT_SITES } from '../mission/sites';
import { clearSurface } from './surface-world';

const R = 1000;               // moon radius in scene units (1 u ≈ 1.74 km)
const ORBIT_ALT = 150;
const LAP = 20;               // seconds for the scanning orbit
const STATION_LAT = -70;      // where the spacecraft parks to show the south pole

interface Marker { m: SiteMetrics; group: THREE.Group; beam: THREE.Mesh; head: THREE.Mesh; ring: THREE.Mesh; label: THREE.Sprite; shown: number; hover: boolean }

export function defaultMission() {
  return { landingDate: new Date(Date.UTC(2027, 8, 14, 6, 0)), sites: DEFAULT_SITES };
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
  private list: Panel; private detail: Panel;
  private stars = starField();
  private ranking: SiteMetrics[];
  private date: Date;

  constructor(private app: LunarApp) {
    clearSurface();
    if (app.flags.has('orbit-done')) this.t = LAP + 0.01; // coming back: skip the scan lap
    const data = app.data ?? defaultMission();
    app.data = data;
    this.date = data.landingDate;
    this.ranking = evaluateSites(data.sites, data.landingDate);
    app.ranking = this.ranking;

    const sc = this.scene;
    sc.background = new THREE.Color(0x000003);
    sc.add(this.stars);
    sc.add(new THREE.HemisphereLight(0x8899aa, 0x111111, 0.3));
    const earthshine = new THREE.DirectionalLight(0x9db8e8, 0.9); // fill from the Earth so the dark pole stays readable
    earthshine.position.copy(earthDirAt(this.date)).multiplyScalar(5000);
    sc.add(earthshine);
    const sunDir = sunDirAt(this.date);
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
    sun.position.copy(sunDir).multiplyScalar(5000);
    sc.add(sun, sun.target);
    const glow = glowTexture();
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunSprite.position.copy(sunDir).multiplyScalar(150000); sunSprite.scale.setScalar(12000); sc.add(sunSprite);

    sc.add(createMoon(R, app.moonTex, 256));
    // cheap invisible proxy so markers behind the Moon can't be picked
    const blocker = new THREE.Mesh(new THREE.SphereGeometry(R * 0.998, 32, 16), new THREE.MeshBasicMaterial({ visible: false }));
    blocker.userData.blocker = true;
    sc.add(blocker);
    this.targets.push(blocker);

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9 }));
    earth.position.copy(earthDirAt(this.date)).multiplyScalar(60000);
    sc.add(earth);

    // orbit track
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(R + ORBIT_ALT)); }
    sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.25 })));

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
    const color = new THREE.Color(scoreColor(m.score));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 30;
    const head = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color }));
    head.position.y = 62;
    const ring = new THREE.Mesh(new THREE.RingGeometry(7, 9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6;
    const label = textLabel([
      { text: `#${m.rank}  ·  ${Math.round(m.score)}%`, size: 54, color: scoreColor(m.score), mono: true, weight: 800 },
      { text: m.site.name, size: 38 },
    ], 46);
    label.position.y = 82;
    // a fat invisible hit target so it's easy to point at in VR
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 100, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 50;
    group.add(beam, head, ring, label, hit);
    group.visible = false;
    group.scale.setScalar(0.001);
    const mk: Marker = { m, group, beam, head, ring, label, shown: 0, hover: false };
    group.userData.onSelect = () => this.select(m);
    group.userData.onHover = (h: boolean) => { mk.hover = h; };
    this.scene.add(group);
    this.targets.push(group);
    return mk;
  }

  private select(m: SiteMetrics) {
    if (m.rank <= this.ranking.length - this.revealed) return; // not evaluated yet
    this.app.selected = m;
    this.list.invalidate(); this.detail.invalidate();
  }

  enter() {
    const rig = this.app.rig;
    rig.add(this.list.mesh, this.detail.mesh);
    this.list.place(-0.86, 1.36, -1.5);
    this.detail.place(0.86, 1.36, -1.5);
    if (!this.app.flags.has('orbit-done')) this.app.selected = null;
    this.placeViewer(this.t, true);
  }

  exit() { this.list.dispose(); this.detail.dispose(); }

  private orbitAngle(t: number) {
    const k = smooth(0, LAP, t);
    return (STATION_LAT + 360 * (1 - k)) * DEG;
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
    const camPos = new THREE.Vector3().setFromMatrixPosition(this.app.camera.matrixWorld);
    this.stars.position.copy(camPos);

    // reveal + "compute" sites one by one during the scanning lap (worst → best for drama)
    const target = Math.min(this.ranking.length, Math.floor(smooth(LAP * 0.15, LAP * 0.92, t) * this.ranking.length + 0.0001));
    if (target !== this.revealed) { this.revealed = target; this.list.invalidate(); this.detail.invalidate(); }
    if (!this.analysisDone && t > LAP) {
      this.analysisDone = true;
      this.app.flags.add('orbit-done');
      if (!this.app.selected) this.app.selected = this.ranking[0];
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
      (mk.head.material as THREE.MeshBasicMaterial).color.set(sel ? 0xffffff : scoreColor(mk.m.score));
      (mk.beam.material as THREE.MeshBasicMaterial).opacity = sel ? 0.9 : 0.5;
    });

    this.list.update(); this.detail.update();
  }

  /* ---------------- panels ---------------- */
  private drawList(p: Panel, g: CanvasRenderingContext2D) {
    p.frame(g);
    g.font = `700 40px ${UI.font}`; g.fillStyle = UI.text; g.fillText('Sitios candidatos · Polo Sur', 48, 86);
    g.font = `500 26px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`Alunizaje ${this.date.toISOString().slice(0, 16).replace('T', ' ')} UTC`, 48, 128);
    const total = this.ranking.length;
    g.fillStyle = this.analysisDone ? '#7be38a' : UI.accent;
    g.fillText(this.analysisDone ? 'Ranking final · toca un sitio' : `Calculando óptimo… ${this.revealed}/${total}`, 48, 166);

    // provisional ranking among the evaluated sites
    const evaluated = [...this.ranking].sort((a, b) => b.rank - a.rank).slice(0, this.revealed).sort((a, b) => a.rank - b.rank);
    const rowH = 104, y0 = 200;
    evaluated.forEach((m, i) => {
      const y = y0 + i * rowH;
      const sel = this.app.selected === m, hov = p.hover === `row-${m.site.id}`;
      if (sel || hov) { roundRect(g, 28, y, 968, rowH - 10, 18); g.fillStyle = sel ? 'rgba(255,154,60,.18)' : 'rgba(255,255,255,.07)'; g.fill(); }
      const col = scoreColor(m.score);
      roundRect(g, 44, y + 18, 58, 58, 14); g.fillStyle = col; g.fill();
      g.font = `800 30px ${UI.mono}`; g.fillStyle = '#111'; g.textAlign = 'center'; g.fillText(`${i + 1}`, 73, y + 58); g.textAlign = 'left';
      g.font = `600 32px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 124, y + 44);
      g.font = `500 22px ${UI.mono}`; g.fillStyle = UI.dim;
      g.fillText(`SOL ${m.illumPct.toFixed(0)}%  ·  TIERRA ${m.earthPct.toFixed(0)}%  ·  PEND ${m.site.slopeDeg.toFixed(1)}°`, 124, y + 78);
      g.font = `800 40px ${UI.mono}`; g.fillStyle = col; g.textAlign = 'right'; g.fillText(`${Math.round(m.score)}%`, 972, y + 60); g.textAlign = 'left';
      p.region(`row-${m.site.id}`, 28, y, 968, rowH - 10, () => this.select(m));
    });
    if (!this.analysisDone) {
      const w = 928 * (this.revealed / total);
      roundRect(g, 48, 1240, 928, 10, 5); g.fillStyle = 'rgba(255,255,255,.15)'; g.fill();
      if (w > 1) { roundRect(g, 48, 1240, w, 10, 5); g.fillStyle = UI.accent; g.fill(); }
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
    const col = scoreColor(m.score);
    g.font = `700 44px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 48, 92);
    g.font = `500 26px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`${Math.abs(m.site.lat).toFixed(2)}°S  ${m.site.lon.toFixed(2)}°${m.site.lon >= 0 ? 'E' : 'W'}  ·  elev. +${m.site.elevationKm.toFixed(1)} km`, 48, 134);
    g.font = `800 96px ${UI.mono}`; g.fillStyle = col; g.fillText(`${Math.round(m.score)}%`, 48, 250);
    g.font = `600 28px ${UI.font}`; g.fillStyle = UI.text; g.fillText(`Viabilidad · puesto #${m.rank} de ${this.ranking.length}`, 340, 222);

    const rows: [string, string][] = [
      ['Elevación solar', `${m.sun.elevation.toFixed(2)}°`],
      ['Azimut solar', `${m.sun.azimuth.toFixed(0)}°`],
      ['Iluminación (14 d)', `${m.illumPct.toFixed(0)}%`],
      ['Puesta de sol en', m.sun.aboveHorizon > -0.27 ? fmtHours(m.hoursToSunset) : 'en sombra'],
      ['Elevación Tierra', `${m.earth.elevation.toFixed(2)}°`],
      ['Visibilidad Tierra', `${m.earthPct.toFixed(0)}%`],
      ['Ocaso de la Tierra en', m.earth.aboveHorizon > 0 ? fmtHours(m.hoursToEarthset) : 'sin enlace'],
      ['Pendiente media', `${m.site.slopeDeg.toFixed(1)}°`],
      ['Noche más larga', fmtHours(m.longestDarkH)],
      ['Potencia solar ahora', `${m.powerPct}%`],
    ];
    rows.forEach(([k, v], i) => {
      const x = 48 + (i % 2) * 480, y = 310 + Math.floor(i / 2) * 96;
      g.font = `500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k.toUpperCase(), x, y);
      g.font = `700 38px ${UI.mono}`; g.fillStyle = UI.text; g.fillText(v, x, y + 44);
    });

    const bars: [string, number][] = [
      ['Iluminación', m.breakdown.illum], ['Enlace Tierra', m.breakdown.earth], ['Pendiente', m.breakdown.slope],
      ['Potencia', m.breakdown.power], ['Noche corta', m.breakdown.dark],
    ];
    bars.forEach(([k, v], i) => {
      const y = 820 + i * 52;
      g.font = `500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k, 48, y + 18);
      roundRect(g, 300, y, 660, 16, 8); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
      if (v > 0.01) { roundRect(g, 300, y, 660 * v, 16, 8); g.fillStyle = col; g.fill(); }
    });
    if (m.site.note) { g.font = `italic 500 24px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(m.site.note, 48, 1112); }

    if (this.analysisDone) {
      p.button(g, 'preconfirm', 48, 1150, 928, 100, 'Preconfirmar punto', () => {
        this.app.selected = m;
        this.app.goTo('pov', 0.8, 1.2);
      });
    } else {
      g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText('Esperando el ranking final…', 48, 1210);
    }
  }
}
