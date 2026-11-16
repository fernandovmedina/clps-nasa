import * as THREE from 'three';
import type { ClientMessage, MarkerKind } from '@touchdown/core';
import type { LunarApp, Phase, RenderStyle } from '../engine/app';
import { Panel, UI, roundRect, statusColor } from '../engine/panel';
import { evaluateSites, fmtHours, skyPosAt, type SiteMetrics, type SkyPos } from '../mission/scoring';
import type { RoomEvent } from '../sync/room-client';
import { MarkerField } from './markers';
import { defaultMission } from './orbit';
import { SpyView } from './spy-view';
import { horizonName, surfaceFor, type SurfaceWorld } from './surface-world';
import { STATUS_LABELS, fmtPercent, fmtSigned, type PhaseHud } from '../engine/hud';

const MARKER_KINDS: [MarkerKind, string][] = [
  ['rock', '🪨 Roca'], ['slope', '⛰ Pendiente'], ['shadow', '🌑 Sombra'], ['other', '⚠ Otro'],
];

const CAM_SEND_INTERVAL_S = 1 / 10; // 10 Hz - tiny payload (7 numbers), see core/src/room.ts cam_update

export function ensureSelection(app: LunarApp): SiteMetrics {
  if (!app.data) app.data = defaultMission();
  if (!app.ranking.length) app.ranking = evaluateSites(app.data.sites, app.data.landingDate);
  if (!app.selected) app.selected = app.ranking[0];
  return app.selected;
}

/** Elevación geométrica y posición respecto al horizonte LOLA, con las mismas cifras en el HUD y en el panel 3D. */
export function skyElevationText(sky: SkyPos, site: { horizonSource: string } = { horizonSource: 'lola' }) {
  const value = `${fmtSigned(sky.elevation, 2)}°`;
  const horizon = sky.elevation - sky.aboveHorizon;
  const side = sky.aboveHorizon >= 0 ? 'sobre' : 'bajo';
  const detail = `de elevación · ${fmtSigned(Math.abs(sky.aboveHorizon), 2)}° ${side} el horizonte ${horizonName(site)} (${fmtSigned(horizon, 2)}°)`;
  return { value, detail, full: `${value} ${detail}` };
}

/** «Tierra sobre el horizonte LOLA», o «geométrico» si el sitio solo tiene horizonte esférico. */
export const skyHorizonLabel = (body: 'Sol' | 'Tierra', site: { horizonSource: string }) => `${body} sobre el horizonte ${horizonName(site)}`;

/** Etiqueta corta de la temperatura, la misma en el panel 3D y en el HUD. */
export const TEMPERATURE_LABEL = 'Temperatura aprox.';

/** La Tierra «oculta» lo está vista desde la superficie; desde la altura (el descenso) todavía puede verse. */
export const earthLinkText = (earthUp: boolean) => (earthUp ? 'enlace directo' : 'oculta desde la superficie · requiere relevo');

/** El puntaje siempre como «94/100», igual que en el resto de la experiencia. */
export const scoreText = (score: number) => `${Math.round(score)}/100`;

/** Aviso para sitios sin heightmap RAW: el relieve cercano es de relleno, el horizonte sí es el real. */
export function nearReliefNote(site: SiteMetrics['site']) {
  if (site.hasTerrain) return null;
  return `Relieve cercano ilustrativo · horizonte ${site.horizonSource === 'lola' ? 'real LOLA' : 'esférico (aproximado)'}`;
}

export interface LookAngles { az: number; el: number }
const LOOK_MIN_EL = 2, LOOK_MAX_EL = 12;
/** Un arco Sol-Tierra más ancho que esto no cabe en el cuadro (~87° de ancho a 1440×900). */
const MAX_FRAMED_ARC_DEG = 70;
const clampLook = (el: number) => Math.min(LOOK_MAX_EL, Math.max(LOOK_MIN_EL, el));

/** Hacia dónde mirar para ver un cuerpo; si el relieve tapa a la Tierra, apunta al cerro que la tapa, a media altura entre ambos. */
export function lookAtBody(m: SiteMetrics, body: 'sun' | 'earth'): LookAngles {
  const sky = body === 'sun' ? m.sun : m.earth;
  if (sky.elevation > 0 && sky.aboveHorizon < 0) {
    const horizon = sky.elevation - sky.aboveHorizon;
    return { az: sky.azimuth, el: clampLook((sky.elevation + horizon) / 2) };
  }
  return { az: sky.azimuth, el: clampLook(sky.elevation) };
}

/**
 * La mirada con la que abre la vista: el punto medio del arco Sol-Tierra si cabe en el cuadro; si no, el cerro
 * que tapa a la Tierra, y si tampoco, el cuerpo que esté sobre el horizonte geométrico (la Tierra primero).
 */
export function initialLook(m: SiteMetrics): LookAngles {
  const sunUp = m.sun.elevation > 0, earthUp = m.earth.elevation > 0;
  if (sunUp && earthUp) {
    const arc = Math.abs(((m.sun.azimuth - m.earth.azimuth + 540) % 360) - 180);
    if (arc <= MAX_FRAMED_ARC_DEG) {
      const mid = m.sun.local.clone().add(m.earth.local).normalize();
      return { az: (Math.atan2(mid.x, -mid.z) * 180 / Math.PI + 360) % 360, el: clampLook(Math.asin(mid.y) * 180 / Math.PI) };
    }
  }
  if (earthUp) return lookAtBody(m, 'earth');
  if (sunUp) return lookAtBody(m, 'sun');
  return { az: m.earth.azimuth, el: LOOK_MIN_EL };
}

const lookDirection = ({ az, el }: LookAngles) => {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};

/**
 * Con el Sol a ~1° el suelo recibe una fracción mínima de la luz: la exposición sube de 1.05 a 1.9 solo aquí y app.ts
 * la restaura al salir. AgX en vez de ACES: grises lunares sin viraje de tono y una rodilla de brillos más suave,
 * así las laderas iluminadas no se queman y el relieve conserva gradientes.
 */
export const POV_RENDER: RenderStyle = { toneMapping: THREE.AgXToneMapping, exposure: 1.9 };

interface Sample { sun: number; earth: number; hSun: number; hEarth: number }

/** Phase 3 — stand on the candidate site, see the landing zone, Sun/Earth and the 14-day outlook. */
export class PovPhase implements Phase {
  readonly name = 'pov' as const;
  /** El visitante manda: la cámara no vuelve sola a la zona de alunizaje tras arrastrar (ver app.ts). */
  readonly holdsLook = true;
  readonly render = POV_RENDER;
  readonly scene: THREE.Scene;
  targets: THREE.Object3D[] = [];
  private world: SurfaceWorld;
  private m: SiteMetrics;
  private info: Panel; private actions: Panel;
  /** Only the monitor role watches - the VR/host doesn't need a mirror of itself. */
  private spy: SpyView | null;
  private series: Sample[] = [];
  private eye: THREE.Vector3;
  private look: LookAngles;
  private lastCamSentAt = -Infinity;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private camScale = new THREE.Vector3();
  private markerField: MarkerField;
  /** Host-only: where they're currently looking on the ground, for "mark risk here". */
  private groundRay = new THREE.Raycaster();
  private aimPoint: THREE.Vector3 | null = null;
  private reticle: THREE.Mesh;

  constructor(private app: LunarApp) {
    this.m = ensureSelection(app);
    this.world = surfaceFor(app, this.m);
    this.scene = this.world.scene;
    this.eye = new THREE.Vector3(0, this.world.heightAt(0, 0) + app.eyeHeight, 0);
    this.look = initialLook(this.m);
    // Created/destroyed live in syncSpy() (not just here) - isHost can flip mid-phase
    // if the user switches rooms via "Cambiar" while already standing at the site.
    this.spy = null;

    const start = app.data!.landingDate.getTime();
    for (let h = 0; h <= 14 * 24; h += 2) {
      const d = new Date(start + h * 3600000);
      const { sun: s, earth: e } = skyPosAt(this.m.site, d);
      this.series.push({ sun: s.elevation, earth: e.elevation, hSun: s.elevation - s.aboveHorizon, hEarth: e.elevation - e.aboveHorizon });
    }

    this.info = new Panel(1024, 1240, 0.66, (p, g) => this.drawInfo(p, g));
    // Taller for the host: an extra row of "mark risk" buttons below the usual actions.
    this.actions = new Panel(1024, app.isHost ? 960 : 760, 0.56, (p, g) => this.drawActions(p, g));
    this.targets.push(this.info.mesh, this.actions.mesh);

    this.markerField = new MarkerField(this.scene, this.m.site.id, (x, z) => this.world.heightAt(x, z));
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 28),
      new THREE.MeshBasicMaterial({ color: UI.ok, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
  }

  enter() {
    this.world.lander.visible = false;
    this.world.lzMarker.visible = true;
    this.world.setSiteViewLabels(true);
    this.world.showAstronaut('wave', this.eye);
    this.app.rig.add(this.info.mesh, this.actions.mesh);
    this.info.place(-0.86, 1.4, -1.45);
    this.actions.place(0.84, 1.28, -1.45);
    this.app.setView(this.eye, this.lookTarget(), { snap: true, rate: 3 });
    this.app.room.setListener((msg: RoomEvent) => this.handleRoom(msg));
    this.syncSpy();
    this.markerField.sync(this.app.markers);
  }

  exit() {
    this.app.room.setListener(null);
    this.world.setSiteViewLabels(false);
    this.world.hideAstronaut();
    this.info.dispose(); this.actions.dispose(); this.spy?.dispose();
    this.markerField.dispose();
    this.reticle.removeFromParent();
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
  }

  private lookTarget() { return lookDirection(this.look).multiplyScalar(100).add(this.eye); }

  private lookAtBody(body: 'sun' | 'earth') {
    this.look = lookAtBody(this.m, body);
    this.app.releaseLook();
  }

  /** Faces the rig's eye point, same convention as Panel.place(). */
  private placeSpy(spy: SpyView) {
    spy.mesh.position.set(0, 1.98, -1.55);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 1.6, 0), spy.mesh.position, new THREE.Vector3(0, 1, 0));
    spy.mesh.quaternion.setFromRotationMatrix(m);
  }

  /** Creates/destroys the spy-view PiP to track the live role - isHost can change after this phase already entered. */
  private syncSpy() {
    if (!this.app.isHost && !this.spy) {
      this.spy = new SpyView(this.world.scene, this.m.site.id);
      this.app.rig.add(this.spy.mesh);
      this.placeSpy(this.spy);
    } else if (this.app.isHost && this.spy) {
      this.spy.dispose();
      this.spy = null;
    }
  }

  /**
   * Monitor-only: cam_update for a site other than the one shown here means the host moved on
   * to a different site without the monitor following via orbit.ts (which the monitor isn't in
   * right now) - jump straight to that site instead of being stuck watching a stale/frozen view.
   */
  private handleRoom(msg: RoomEvent) {
    this.app.applyMarkerEvent(msg);
    if (msg.type === 'state' || msg.type === 'marker_add' || msg.type === 'marker_remove') {
      this.markerField.sync(this.app.markers);
    }
    if (msg.type === 'cam_update' && !this.app.isHost && msg.site_id !== this.m.site.id) {
      const target = this.app.ranking.find((r) => r.site.id === msg.site_id);
      if (target) { this.app.selected = target; this.app.goTo('pov', 0.5, 0.8); }
      return;
    }
    this.spy?.handleRoomEvent(msg, this.app.time);
  }

  /** Host-only: drops a marker at the current aim point and applies it locally right
   *  away - the Worker never echoes a message back to the socket that sent it. */
  private placeMarker(kind: MarkerKind) {
    if (!this.app.isHost || !this.aimPoint) return;
    const msg: ClientMessage = {
      type: 'marker_add',
      id: crypto.randomUUID(),
      site_id: this.m.site.id,
      x_m: this.aimPoint.x,
      y_m: -this.aimPoint.z, // contract: north = +y_m; this world's north = -z
      kind,
    };
    this.app.room.send(msg);
    this.app.applyMarkerEvent(msg);
    this.markerField.sync(this.app.markers);
  }

  update(dt: number, t: number) {
    this.syncSpy();
    this.world.update(dt, t);
    this.app.setView(this.eye, this.lookTarget(), { rate: 3 });
    this.info.update(); this.actions.update();

    if (this.app.isHost) {
      this.app.camera.updateMatrixWorld();
      this.app.camera.matrixWorld.decompose(this.camPos, this.camQuat, this.camScale);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(this.app.camera.matrixWorld);
      this.groundRay.set(this.camPos, dir);
      const hit = this.groundRay.intersectObjects(this.world.groundMeshes, false)[0] ?? null;
      this.aimPoint = hit ? hit.point.clone() : null;
      this.reticle.visible = !!this.aimPoint;
      if (this.aimPoint) this.reticle.position.set(this.aimPoint.x, this.aimPoint.y + 0.06, this.aimPoint.z);

      if (t - this.lastCamSentAt > CAM_SEND_INTERVAL_S) {
        this.lastCamSentAt = t;
        this.app.room.send({
          type: 'cam_update', site_id: this.m.site.id,
          px: this.camPos.x, py: this.camPos.y, pz: this.camPos.z,
          qx: this.camQuat.x, qy: this.camQuat.y, qz: this.camQuat.z, qw: this.camQuat.w,
        });
      }
    }
    if (this.spy) {
      this.spy.update(t, this.app.renderer, [
        this.info.mesh, this.actions.mesh, this.spy.mesh, this.app.fadeMesh, this.app.exitPanel.mesh, this.app.runPanel.mesh,
        ...this.app.input.controllers, ...this.app.input.grips,
      ]);
    }
  }

  private drawInfo(p: Panel, g: CanvasRenderingContext2D) {
    const m = this.m;
    p.frame(g);
    g.font = `600 24px ${UI.mono}`; g.fillStyle = UI.accent; g.fillText('VISTA DESDE EL SITIO · PRECONFIRMACIÓN', 48, 70);
    g.font = `700 46px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 48, 128);
    g.font = `500 24px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`${Math.abs(m.site.lat).toFixed(2)}°S ${m.site.lon.toFixed(2)}°  ·  ${this.app.data!.landingDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`, 48, 166);
    const note = nearReliefNote(m.site);
    if (note) { g.font = `500 22px ${UI.font}`; g.fillStyle = UI.warn; g.fillText(note, 48, 200); }

    const horizonOf = (s: SkyPos) => `${fmtSigned(s.aboveHorizon, 2)}° (horizonte ${fmtSigned(s.elevation - s.aboveHorizon, 2)}°)`;
    const rows: [string, string, string?][] = [
      ['Sol · elevación / azimut', `${fmtSigned(m.sun.elevation, 2)}° / ${m.sun.azimuth.toFixed(0)}°`, UI.sun],
      [skyHorizonLabel('Sol', m.site), horizonOf(m.sun)],
      ['Tiempo hasta la puesta de sol', m.sun.aboveHorizon > -0.27 ? fmtHours(m.hoursToSunset) : 'en sombra'],
      ['Tierra · elevación / azimut', `${fmtSigned(m.earth.elevation, 2)}° / ${m.earth.azimuth.toFixed(0)}°`, UI.earth],
      [skyHorizonLabel('Tierra', m.site), horizonOf(m.earth)],
      ['Ventana de comunicación', m.earth.aboveHorizon > 0 ? `${fmtHours(m.hoursToEarthset)} restantes` : 'requiere relevo'],
      ['Disco solar visible', `${m.powerPct}%`],
      [TEMPERATURE_LABEL, `${m.tempC.toFixed(0)} °C`],
      ...(this.world.roughness === null ? [] : [['Rugosidad a 120 m (DEM LOLA)', `${this.world.roughness.toFixed(2)} m`] as [string, string]]),
    ];
    rows.forEach(([k, v, c], i) => {
      const y = 236 + i * 56;
      g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k, 48, y);
      g.font = `700 30px ${UI.mono}`; g.fillStyle = c ?? UI.text; g.textAlign = 'right'; g.fillText(v, 976, y); g.textAlign = 'left';
      g.fillStyle = 'rgba(250,249,245,.07)'; g.fillRect(48, y + 18, 928, 2);
    });

    // 14-day outlook chart: Sun and Earth elevation vs the local horizon
    const x0 = 80, x1 = 976, y0 = 760, y1 = 1150, lo = -4, hi = 9;
    const X = (i: number) => x0 + (i / (this.series.length - 1)) * (x1 - x0);
    const Y = (e: number) => y1 - ((Math.max(lo, Math.min(hi, e)) - lo) / (hi - lo)) * (y1 - y0);
    g.font = `600 24px ${UI.mono}`; g.fillStyle = UI.dim; g.fillText('PRÓXIMOS 14 DÍAS · ELEVACIÓN (°)', 48, 735);
    roundRect(g, x0, y0, x1 - x0, y1 - y0, 10); g.fillStyle = 'rgba(250,249,245,.04)'; g.fill();
    g.font = `500 20px ${UI.mono}`;
    for (let e = lo; e <= hi; e += 2) {
      g.fillStyle = 'rgba(250,249,245,.08)'; g.fillRect(x0, Y(e), x1 - x0, 1);
      g.fillStyle = UI.dim; g.textAlign = 'right'; g.fillText(`${e}`, x0 - 10, Y(e) + 7); g.textAlign = 'left';
    }
    for (let d = 0; d <= 14; d += 2) { g.fillStyle = UI.dim; g.fillText(`d${d}`, X((d * 12)) - 12, y1 + 30); }
    // sunlit shading
    this.series.forEach((s, i) => {
      if (s.sun > s.hSun - 0.27) { g.fillStyle = 'rgba(232,197,71,.08)'; g.fillRect(X(i), y0, (x1 - x0) / this.series.length + 1, y1 - y0); }
    });
    const curve = (key: 'sun' | 'earth' | 'hSun', color: string, dash: number[] = [], w = 4) => {
      g.beginPath(); this.series.forEach((s, i) => (i ? g.lineTo(X(i), Y(s[key])) : g.moveTo(X(i), Y(s[key]))));
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = w; g.stroke(); g.setLineDash([]);
    };
    curve('hSun', 'rgba(250,249,245,.45)', [8, 8], 3);
    curve('earth', UI.earth);
    curve('sun', UI.sun);
    g.font = `600 22px ${UI.font}`;
    g.fillStyle = UI.sun; g.fillText('■ Sol', x0 + 12, y0 + 32);
    g.fillStyle = UI.earth; g.fillText('■ Tierra', x0 + 110, y0 + 32);
    g.fillStyle = UI.dim; g.fillText(`- - horizonte ${horizonName(m.site)}`, x0 + 240, y0 + 32);
    g.fillStyle = 'rgba(232,197,71,.7)'; g.fillText('▒ iluminado', x0 + 470, y0 + 32);
  }

  private drawActions(p: Panel, g: CanvasRenderingContext2D) {
    const m = this.m, col = statusColor(m.status);
    p.frame(g);
    g.font = `600 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText('Viabilidad del sitio', 48, 76);
    g.font = `800 104px ${UI.mono}`; g.fillStyle = col; g.fillText(scoreText(m.score), 48, 200);
    g.font = `600 30px ${UI.font}`; g.fillStyle = UI.text; g.fillText(`#${m.rank} del ranking`, 560, 150);
    g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim;
    g.fillText('Mira a tu alrededor: el anillo verde', 48, 262);
    g.fillText('marca la zona donde alunizarás.', 48, 298);
    p.button(g, 'confirm', 48, 380, 928, 110, 'Confirmar alunizaje', () => this.app.goTo('landing', 0.8, 1.0));
    p.button(g, 'back', 48, 520, 928, 96, 'Elegir otro sitio', () => this.app.goTo('orbit', 0.7, 1.0), 'ghost');
    p.button(g, 'look-sun', 48, 636, 448, 84, 'Mirar al Sol', () => this.lookAtBody('sun'), 'ghost');
    p.button(g, 'look-earth', 528, 636, 448, 84, 'Mirar a la Tierra', () => this.lookAtBody('earth'), 'ghost');

    if (this.app.isHost) {
      g.font = `600 24px ${UI.font}`; g.fillStyle = UI.dim;
      g.fillText('Marcar riesgo donde estás mirando (anillo verde)', 48, 772);
      const gap = 16, bw = (928 - gap * 3) / 4, bh = 80, y = 800;
      MARKER_KINDS.forEach(([kind, label], i) => {
        p.button(g, `mark-${kind}`, 48 + i * (bw + gap), y, bw, bh, label, () => this.placeMarker(kind), 'ghost');
      });
    }
  }

  controlHud(): PhaseHud {
    const m = this.m;
    const lit = m.sun.aboveHorizon > -0.27;
    const earthUp = m.earth.aboveHorizon > 0;
    const night = `La noche más larga de la misión dura ${fmtHours(m.longestDarkH)}.`;
    const sun = lit
      ? `El Sol está ${fmtSigned(m.sun.aboveHorizon, 2)}° sobre el horizonte ${horizonName(m.site)} y se pone en ${fmtHours(m.hoursToSunset)}. ${night}`
      : `El Sol está ${fmtSigned(Math.abs(m.sun.aboveHorizon), 2)}° bajo el horizonte ${horizonName(m.site)}. ${night}`;
    const note = nearReliefNote(m.site);
    const sunText = skyElevationText(m.sun, m.site), earthText = skyElevationText(m.earth, m.site);
    return {
      figure: { value: lit ? 'Iluminado' : 'En sombra', caption: 'Arrastra para mirar alrededor' },
      detail: note ? `${sun} ${note}.` : sun,
      facts: [
        { label: 'Noche más larga', value: fmtHours(m.longestDarkH) },
        { label: 'Puntaje', value: `${scoreText(m.score)} · ${STATUS_LABELS[m.status]}` },
        { label: 'Ventana de comunicación', value: earthUp ? `${fmtHours(m.hoursToEarthset)} restantes` : 'requiere relevo' },
      ],
      side: {
        kind: 'sky',
        blocks: [
          {
            kind: 'sun', label: 'Sol · energía', value: sunText.value,
            detail: `${sunText.detail} · azimut ${m.sun.azimuth.toFixed(0)}°`,
            share: m.illumPct / 100, shareLabel: `Sol visible el ${Math.round(m.illumPct)} % de los 14 días`,
          },
          {
            kind: 'earth', label: 'Tierra · comunicación', value: earthText.value,
            detail: `${earthText.detail} · ${earthLinkText(earthUp)}`,
            share: m.earthPct / 100, shareLabel: `Tierra visible el ${Math.round(m.earthPct)} % de los 14 días`,
          },
        ],
        extras: [
          { label: 'Disco solar visible', value: fmtPercent(m.powerPct) },
          { label: TEMPERATURE_LABEL, value: `${fmtSigned(m.tempC, 0)} °C` },
          ...(this.world.roughness === null ? [] : [{ label: 'Rugosidad a 120 m (DEM LOLA)', value: `${this.world.roughness.toFixed(2)} m` }]),
        ],
        marks: this.app.isHost ? {
          label: 'Marcar riesgo donde miras (anillo verde)',
          options: MARKER_KINDS.map(([kind, text]) => ({ id: `mark-${kind}`, label: text.replace(/^\S+\s+/, ''), disabled: !this.aimPoint, run: () => this.placeMarker(kind) })),
        } : undefined,
      },
      secondary: [
        { id: 'look-sun', label: 'Mirar al Sol', run: () => this.lookAtBody('sun') },
        { id: 'look-earth', label: 'Mirar a la Tierra', run: () => this.lookAtBody('earth') },
        { id: 'back', label: 'Elegir otro sitio', run: () => this.app.goTo('orbit', 0.7, 1.0) },
      ],
      primary: { id: 'confirm', label: 'Iniciar descenso', run: () => this.app.goTo('landing', 0.8, 1.0) },
    };
  }
}
