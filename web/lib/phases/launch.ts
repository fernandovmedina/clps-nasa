import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import type { LoopControl } from '../engine/audio';
import { Panel, UI, roundRect } from '../engine/panel';
import { starField } from '../engine/particles';
import { earthTexture, glowTexture } from '../engine/textures';
import { createMoon } from '../engine/moon';
import { clamp01, damp, disposeTree, lerp, rand, smooth } from '../engine/util';
import { clearSurface } from './surface-world';
import { disposeObject, loadRocketModel } from './rocket-model';
import { countdownFigure, fmtPercent, groupThousands, type PhaseHud } from '../engine/hud';
import { LaunchEnvironment, rocketShadowProxy } from './launch-environment';
import { LaunchExhaust } from './launch-exhaust';
import { loadLaunchTower } from './launch-tower';
import { MEAN_MOON_DISTANCE_KM, earthMoonDistanceKm } from './launch-telemetry';
import { LaunchSync } from './launch-sync';
import { currentLanding } from '../mission/launch-plan';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EARTH_R = 3000;
const EARTH_C = new THREE.Vector3(0, -EARTH_R, 0);
const MOON_R = 150;
const MOON_C = new THREE.Vector3(900, 2700, -1400);
const T_IGN = 2.6;
const T_LIFT = 3.3;
const HUD_DIST = 1.45;
const HUD_W = 1.15;
const HUD_H = (HUD_W * 360) / 1400;
const COUNT_W = (HUD_W * 480) / 1400;
const HEMI_DAY = 0.8;

/* ---------------- models ---------------- */
function buildRocket() {
  const g = new THREE.Group();
  const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, ...o });
  const orange = M(0xd9772b), white = M(0xf2f2ee), grey = M(0x9aa0a6);
  const dark = M(0x2a2a2a, { metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.35, 0.75, 1, 20, 1, true), dark, 0, 0.5);
  add(new THREE.CylinderGeometry(1.15, 1.15, 14.5, 32), orange, 0, 8.25);
  add(new THREE.CylinderGeometry(1.17, 1.17, 0.25, 32), dark, 0, 15.3);
  add(new THREE.CylinderGeometry(0.95, 1.15, 1.2, 32), white, 0, 16.1);
  add(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 32), white, 0, 17.8);
  add(new THREE.CylinderGeometry(0.95, 0.95, 0.8, 32), grey, 0, 19.3);
  add(new THREE.CylinderGeometry(0.35, 0.95, 1.3, 32), white, 0, 20.35);
  add(new THREE.CylinderGeometry(0.08, 0.16, 2, 12), grey, 0, 22);
  add(new THREE.ConeGeometry(0.18, 0.5, 12), white, 0, 23.25);
  for (const sx of [-1, 1]) {
    const x = sx * 1.85;
    add(new THREE.CylinderGeometry(0.6, 0.6, 13, 24), white, x, 7.8);
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 24), dark, x, 3);
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 24), dark, x, 12);
    add(new THREE.ConeGeometry(0.6, 1.4, 24), white, x, 15);
    add(new THREE.CylinderGeometry(0.3, 0.55, 0.8, 16, 1, true), dark, x, 0.9);
  }
  return { group: g, nozzles: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1.85, 0.5, 0), new THREE.Vector3(1.85, 0.5, 0)] };
}

/* ---------------- phase ---------------- */
export class LaunchPhase implements Phase {
  readonly name = 'launch' as const;
  readonly scene = new THREE.Scene();
  targets: THREE.Object3D[] = [];

  private t = 0; private s = 0; private speed = 0; private roll = 0; private arrivalT = 0;
  private progress = 0; private shownPct = 0; private done = false; private leaving = false;
  private sync: LaunchSync;
  private narratedAtmo = false; private narratedApproach = false;
  private status = 'Inicializando sistemas de vuelo';
  private tele = { alt: '0.0 km', vel: '0.00 km/s', dist: '384,400 km' };
  private moonKm = MEAN_MOON_DISTANCE_KM;
  private uiT = 0; private countLabel = '';

  /** update() scratch - reused every frame instead of allocating a dozen Vector3/Quaternion
   *  per frame (the main source of per-frame GC pressure during the launch animation). */
  private _pos = new THREE.Vector3(); private _tan = new THREE.Vector3();
  private _vel = new THREE.Vector3(); private _back = new THREE.Vector3();
  private _camPos = new THREE.Vector3(); private _side = new THREE.Vector3();
  private _chase = new THREE.Vector3(); private _chaseLook = new THREE.Vector3();
  private _toMoon = new THREE.Vector3(); private _tmp = new THREE.Vector3();
  private _eye = new THREE.Vector3(); private _look = new THREE.Vector3();
  private _q = new THREE.Quaternion(); private _qi = new THREE.Quaternion(); private _qroll = new THREE.Quaternion();

  private rocket: THREE.Group; private nozzles: THREE.Vector3[]; private closed = false;
  private curve: THREE.CatmullRomCurve3; private curveLen: number; private travelUnits: number;
  private env: LaunchEnvironment; private exhaust: LaunchExhaust; private shadowProxy: THREE.Mesh;
  private flameLight = new THREE.PointLight(0xff8a3c, 0, 120, 1.4);
  private hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4a36, HEMI_DAY);
  private stars = starField();
  private sunSprite: THREE.Sprite; private sunDir = new THREE.Vector3(-0.3, 0.2, 0.93).normalize();
  private atmo: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private padCam = new THREE.Vector3(44, 9, 30);
  private hud: Panel; private count: Panel; private dock = new THREE.Group();
  private motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  private reduceMotion = this.motion?.matches ?? false;
  private onMotion = (e: MediaQueryListEvent) => { this.reduceMotion = e.matches; };
  private rumble: LoopControl | null = null; private wind: LoopControl | null = null; private crackle: LoopControl | null = null;

  constructor(private app: LunarApp) {
    clearSurface();
    app.flags.clear(); app.selected = null; app.ranking = []; app.data = null;
    this.sync = new LaunchSync({
      get isHost() { return app.isHost; },
      landing: () => currentLanding(app.data, window.location.search),
      applyLanding: (date) => { app.setLanding(date); },
      send: (msg) => app.room.send(msg),
      applyMarkerEvent: (msg) => app.applyMarkerEvent(msg),
    }, () => app.narrator.speak('Secuencia de despegue iniciada. Destino: polo sur lunar.'));
    this.motion?.addEventListener('change', this.onMotion);
    const sc = this.scene;
    this.env = new LaunchEnvironment(EARTH_R, this.sunDir, app.renderer.capabilities.getMaxAnisotropy(), Math.atan2(-this.padCam.x, -this.padCam.z) + Math.PI / 2);
    sc.background = this.env.horizon;
    sc.fog = new THREE.Fog(this.env.horizon.clone(), 25, 200);
    sc.add(this.hemi, this.env.group, this.flameLight);

    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 256, 128), new THREE.MeshStandardMaterial({
      map: earthTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    }));
    earth.position.copy(EARTH_C); earth.rotation.z = Math.PI / 2; sc.add(earth);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.025, 128, 64), new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float opacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.5); gl_FragColor = vec4(vec3(0.35,0.65,1.0), f*opacity); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.atmo.position.copy(EARTH_C); sc.add(this.atmo);

    const r = buildRocket(); this.rocket = r.group; this.nozzles = r.nozzles; sc.add(this.rocket);
    loadRocketModel(this.rocket).then((model) => {
      if (!model) return;
      if (this.closed) { disposeObject(model); return; }
      for (const child of [...this.rocket.children]) { if (child === this.shadowProxy) continue; this.rocket.remove(child); disposeObject(child); }
      model.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      this.rocket.add(model);
      const spread = model.userData.baseRadius * 0.5;
      this.nozzles[1].x = -spread; this.nozzles[2].x = spread;
    });
    loadLaunchTower(new THREE.Vector3(0, 3.8, 0)).then((tower) => {
      if (!tower) return;
      if (this.closed) { disposeObject(tower); return; }
      this.env.setTower(tower);
    });
    this.shadowProxy = rocketShadowProxy(23.5, 1);
    this.rocket.add(this.shadowProxy);

    const moon = createMoon(MOON_R, app.moonTex, 128);
    moon.position.copy(MOON_C); sc.add(moon);

    this.stars.material.opacity = 0; sc.add(this.stars);
    const glow = glowTexture();
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d0, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.setScalar(900); sc.add(this.sunSprite);

    this.exhaust = new LaunchExhaust(glow, this.flameLight, 0.6);
    sc.add(this.exhaust.group);

    const P0 = new THREE.Vector3(0, 3.8, 0);
    // Altitude kept well clear of the surface (not a close dive) so the launch→orbit handoff
    // reads as "entering orbit", not "already landing" — the real touchdown only happens in landing.ts.
    const end = MOON_C.clone().add(new THREE.Vector3(-0.15, -1, 0.45).normalize().multiplyScalar(MOON_R + 130));
    this.curve = new THREE.CatmullRomCurve3([
      P0, new THREE.Vector3(0, 130, 0), new THREE.Vector3(25, 480, -50), new THREE.Vector3(230, 1250, -420),
      new THREE.Vector3(600, 2050, -900), end.clone().add(new THREE.Vector3(-140, -260, 160)), end,
    ], false, 'centripetal');
    this.curve.arcLengthDivisions = 1500;
    this.curveLen = this.curve.getLength();
    this.travelUnits = MOON_C.distanceTo(EARTH_C) - EARTH_R - MOON_R;

    // HUD (in-world, so it also shows in the headset)
    this.hud = new Panel(1400, 360, HUD_W, (p, g) => this.drawHud(p, g));
    this.count = new Panel(480, 360, COUNT_W, (p, g) => this.drawCount(p, g));
    this.count.mesh.visible = false;
    this.dock.add(this.hud.mesh, this.count.mesh);
    // Without this, pointer/controller rays never hit the HUD panel - the
    // "Comenzar despegue" button renders but nothing can ever click it.
    this.targets.push(this.hud.mesh);
  }

  enter() {
    const rig = this.app.rig;
    rig.add(this.dock);
    this.dock.position.set(0, 1.06, -HUD_DIST);
    this.dock.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0, 1.6, 0), this.dock.position, UP));
    this.app.setView(this.padCam, new THREE.Vector3(0, 12, 0), { snap: true, rate: 3 });
    this.rumble = this.app.audio.loop('engine_rumble');
    this.wind = this.app.audio.loop('wind_maxq');
    // Joining late: the snapshot hello brings back (playing, landing) is what a monitor needs.
    this.app.room.setListener((msg) => this.sync.handle(msg));
    this.app.room.send({ type: 'hello' });

    this.app.opts.loadData((p, msg) => { this.progress = Math.max(this.progress, clamp01(p)); this.status = msg; this.hud.invalidate(); })
      .then((d) => {
        this.app.data = d; this.done = true; this.status = 'Datos listos · Rumbo al polo sur lunar'; this.hud.invalidate();
      })
      .catch((e) => { console.error(e); this.status = 'Error al cargar datos — reintenta'; this.hud.invalidate(); });
  }

  exit() {
    this.closed = true;
    this.app.room.setListener(null);
    this.motion?.removeEventListener('change', this.onMotion);
    this.scene.remove(this.app.rig);
    this.hud.dispose(); this.count.dispose(); this.dock.removeFromParent();
    this.exhaust.dispose(); this.env.dispose();
    disposeObject(this.rocket);
    disposeTree(this.scene);
    this.rumble?.stop(); this.wind?.stop(); this.crackle?.stop();
  }

  private get started() { return this.sync.started; }

  /** Date-dependent, so read from the mission every time: the planner can change it while the launch waits. */
  private get moonTarget() {
    const d = this.app.data;
    return (d && earthMoonDistanceKm(d.global, d.landingDate)) || MEAN_MOON_DISTANCE_KM;
  }

  /** Shared by the in-world "Comenzar despegue" button and the DOM control HUD's equivalent. */
  private beginCountdown() { this.sync.start('crew'); }

  private drawCount(p: Panel, g: CanvasRenderingContext2D) {
    const label = this.countLabel;
    if (!label) return;
    p.frame(g);
    const tick = label.startsWith('T-');
    let size = tick ? 150 : 84;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    do { g.font = `800 ${size}px ${UI.font}`; size -= 4; } while (g.measureText(label).width > p.pxW - 64 && size > 32);
    g.fillStyle = tick ? UI.text : UI.accent;
    g.fillText(label, p.pxW / 2, p.pxH / 2 + 4);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  /** Countdown docked beside the telemetry (stacked above it on narrow screens), scaled to stay inside the view. */
  private layoutDock() {
    const app = this.app, stacked = !app.isXR && app.camera.aspect < 1.2;
    this.count.mesh.position.set(stacked ? 0 : (HUD_W + COUNT_W) / 2 + 0.03, stacked ? HUD_H + 0.03 : 0, 0);
    let k = 1;
    if (!app.isXR) {
      const reach = stacked ? HUD_W / 2 : HUD_W / 2 + 0.03 + COUNT_W;
      k = Math.min(1, (HUD_DIST * Math.tan(Math.PI / 6) * app.camera.aspect * 0.94) / reach);
    }
    this.dock.scale.setScalar(k);
  }

  private drawHud(p: Panel, g: CanvasRenderingContext2D) {
    p.frame(g);
    g.fillStyle = UI.accent; g.beginPath(); g.arc(56, 62, 9, 0, 7); g.fill();
    g.font = `600 26px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText('MISSION CONTROL  /  LUNAR SOUTH POLE · SITE PLANNER', 80, 72);
    if (!this.started) {
      g.font = `500 30px ${UI.font}`; g.fillStyle = UI.text; g.fillText(this.status, 44, 140);
      roundRect(g, 44, 170, 1200, 10, 5); g.fillStyle = 'rgba(250,249,245,.15)'; g.fill();
      if (this.shownPct > 0.002) { roundRect(g, 44, 170, 1200 * this.shownPct, 10, 5); g.fillStyle = UI.accent; g.fill(); }
      g.font = `700 24px ${UI.mono}`; g.fillStyle = UI.text; g.textAlign = 'right';
      g.fillText(`${Math.round(this.shownPct * 100)}%`, 1356, 184); g.textAlign = 'left';
      p.button(g, 'start', 44, 215, 1200, 96, 'Comenzar despegue', () => this.beginCountdown());
      return;
    }
    const cols: [string, string][] = [['ALTITUD', this.tele.alt], ['VELOCIDAD', this.tele.vel], ['DIST. A LA LUNA', this.tele.dist]];
    cols.forEach(([k, v], i) => {
      const x = 44 + i * 440;
      g.font = `600 22px ${UI.mono}`; g.fillStyle = UI.dim; g.fillText(k, x, 140);
      g.font = `700 46px ${UI.mono}`; g.fillStyle = UI.text; g.fillText(v, x, 192);
    });
    g.font = `500 30px ${UI.font}`; g.fillStyle = UI.text; g.fillText(this.status, 44, 270);
    roundRect(g, 44, 300, 1200, 10, 5); g.fillStyle = 'rgba(250,249,245,.15)'; g.fill();
    if (this.shownPct > 0.002) { roundRect(g, 44, 300, 1200 * this.shownPct, 10, 5); g.fillStyle = UI.accent; g.fill(); }
    g.font = `700 30px ${UI.mono}`; g.fillStyle = UI.text; g.textAlign = 'right';
    g.fillText(`${Math.round(this.shownPct * 100)}%`, 1356, 314); g.textAlign = 'left';
  }

  update(dt: number) {
    const app = this.app;
    if (!this.done) this.progress = Math.max(this.progress, Math.min(0.9, 0.9 * (1 - Math.exp(-this.t / 14))) * 0.5);
    this.shownPct = lerp(this.shownPct, this.done ? 1 : this.progress, damp(4, dt));

    if (!this.started) { this.layoutDock(); this.hud.update(); this.count.update(); return; }

    this.t += dt;
    const t = this.t;

    // countdown
    let label = '';
    if (t > 0.4 && t < 1.2) label = 'T-3'; else if (t >= 1.2 && t < 2.0) label = 'T-2';
    else if (t >= 2.0 && t < T_IGN) label = 'T-1'; else if (t >= T_IGN && t < T_LIFT) label = 'IGNICIÓN';
    else if (t >= T_LIFT && t < T_LIFT + 1.6) label = 'DESPEGUE';
    if (label !== this.countLabel && label.startsWith('T-')) app.audio.play('countdown_tick');
    if (label !== this.countLabel && label === 'IGNICIÓN') app.audio.play('ignition');
    if (label !== this.countLabel && label === 'DESPEGUE') app.narrator.speak('Despegue confirmado.');
    if (label !== this.countLabel) { this.countLabel = label; this.count.mesh.visible = label !== ''; this.count.invalidate(); }

    // motion along the trajectory, gated by real loading progress
    let thrust = t > T_IGN ? smooth(T_IGN, T_LIFT, t) : 0;
    if (t > T_LIFT) {
      const lt = t - T_LIFT;
      const vmax = Math.min(this.done ? 0.12 : 0.075, 0.004 * lt * lt);
      const target = this.done ? 1 : Math.max(0.06 + 0.82 * this.progress, Math.min(0.3, 0.02 * lt));
      this.speed = Math.min(vmax, Math.max(0, (target - this.s) * 0.9));
      this.s = Math.min(1, this.s + this.speed * dt);
      thrust = clamp01(Math.max(0.3, this.speed / 0.045, lt < 3 ? 1 : 0));
      if (this.s > 0.96) thrust *= lerp(1, 0.25, smooth(0.96, 1, this.s));
    }
    const s = this.s;
    const pos = this.curve.getPointAt(s, this._pos), tan = this.curve.getTangentAt(s, this._tan);
    this.rocket.position.copy(pos);
    if (!app.isXR && !this.reduceMotion && t > T_IGN && t < T_LIFT + 2.5) {
      const k = 0.07 * thrust * (1 - smooth(T_LIFT + 1, T_LIFT + 2.5, t));
      this.rocket.position.x += rand(-k, k); this.rocket.position.z += rand(-k, k);
    }
    const q = this._q.setFromUnitVectors(UP, tan);
    const qi = this._qi.identity().slerp(q, smooth(0, 0.03, s));
    this.roll += dt * 0.35 * smooth(0.04, 0.15, s);
    this.rocket.quaternion.copy(qi).multiply(this._qroll.setFromAxisAngle(UP, this.roll));
    this.rocket.updateMatrixWorld();

    const alt = pos.y;
    const vel = this._vel.copy(tan).multiplyScalar(this.speed * this.curveLen);
    const back = this._back.copy(tan).negate();

    const camPos = this._camPos.setFromMatrixPosition(app.camera.matrixWorld);
    this.exhaust.update({ dt, t, ignited: t > T_IGN, thrust, alt, scale: app.pointScale(), rocket: this.rocket, nozzles: this.nozzles, back, vel });

    // sky → space
    const sky = smooth(30, 900, alt);
    if (!this.narratedAtmo && sky > 0.5) { this.narratedAtmo = true; app.narrator.speak('Hemos salido de la atmósfera. Rumbo a la Luna.'); }
    this.rumble?.set('thrust', thrust);
    this.rumble?.set('atmosphere', 1 - sky);
    this.wind?.set('dynamic_pressure', smooth(60, 300, alt) * (1 - smooth(300, 850, alt)));
    const grounded = t > T_IGN && alt < 140;
    if (grounded && !this.crackle) this.crackle = app.audio.loop('liftoff_crackle');
    else if (!grounded && this.crackle) { this.crackle.stop(); this.crackle = null; }
    this.env.update(camPos, alt, sky, app.isXR);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.env.horizon); fog.near = lerp(25, 40000, sky); fog.far = lerp(200, 60000, sky);
    this.hemi.intensity = lerp(HEMI_DAY, 0.12, sky);
    (this.stars.material as THREE.PointsMaterial).opacity = smooth(250, 1200, alt);
    this.atmo.material.uniforms.opacity.value = smooth(80, 700, alt) * 0.9;

    // viewer: pad camera → chase camera → moon framing
    const side = this._side.crossVectors(tan, Z_AXIS);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize().applyAxisAngle(tan, t * 0.1 * smooth(0.25, 0.45, s));
    const chase = this._chase.copy(pos).addScaledVector(side, 38).addScaledVector(tan, -30);
    const chaseLook = this._chaseLook.copy(pos).addScaledVector(tan, 12);
    const m = smooth(0.72, 1, s);
    if (m > 0) {
      const toMoon = this._toMoon.copy(MOON_C).sub(pos).normalize();
      chase.lerp(this._tmp.copy(pos).addScaledVector(toMoon, -75).addScaledVector(side, 45).addScaledVector(UP, -20), m);
      chaseLook.lerp(this._tmp.copy(pos).lerp(MOON_C, 0.4), m);
    }
    const w = smooth(0.004, 0.05, s);
    const eye = this._eye.copy(this.padCam).lerp(chase, w);
    const look = this._look.copy(pos).addScaledVector(UP, 9).lerp(chaseLook, w);
    if (!app.isXR && !this.reduceMotion && t > T_IGN) {
      const tremor = 0.3 * thrust * (1 - smooth(T_LIFT + 1, T_LIFT + 2.5, t));
      look.x += tremor * Math.sin(t * 47); look.y += tremor * Math.sin(t * 61 + 1); look.z += tremor * Math.sin(t * 53 + 2);
    }
    app.setView(eye, look, { rate: 3 });

    this.stars.position.copy(camPos);
    this.sunSprite.position.copy(camPos).addScaledVector(this.sunDir, 12000);
    this.sunSprite.material.opacity = smooth(300, 1200, alt);

    // telemetry (10 Hz)
    this.uiT += dt;
    if (this.uiT > 0.1) {
      const tick = this.uiT;
      this.uiT = 0;
      const u = Math.max(0, pos.distanceTo(EARTH_C) - EARTH_R - 3.8);
      const km = s >= 0.999 ? 384300 : 384400 * Math.pow(clamp01(u / this.travelUnits), 2.2);
      const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
      const v = t < T_LIFT ? 0 : lerp(lerp(0, 10.9, smooth(0, 0.25, s)), 1.7, smooth(0.6, 1, s)) * (0.75 + 0.25 * Math.min(1, this.speed / 0.04));
      const moonTarget = this.moonTarget;
      this.moonKm = Math.abs(moonTarget - this.moonKm) < 0.5 ? moonTarget : lerp(this.moonKm, moonTarget, damp(2.5, tick));
      const left = Math.max(100, this.moonKm * (1 - clamp01(km / 384300)));
      this.tele = { alt: km < 1000 ? `${km.toFixed(1)} km` : `${fmt(km)} km`, vel: `${v.toFixed(2)} km/s`, dist: `${fmt(left)} km` };
      this.hud.invalidate();
    }
    this.layoutDock();
    this.hud.update(); this.count.update();

    if (!this.narratedApproach && this.done && s > 0.85) {
      this.narratedApproach = true;
      app.narrator.speak('Aproximándonos a la Luna. Preparando inserción orbital.');
    }

    // arrival → orbit insertion
    if (this.done && s >= 0.999 && !this.leaving) {
      this.arrivalT += dt;
      if (this.arrivalT > 0.8) { this.leaving = true; app.goTo('orbit', 0.9, 1.2); }
    }
  }

  controlHud(): PhaseHud {
    const pct = fmtPercent(this.shownPct * 100);
    const count = this.started ? countdownFigure(this.countLabel || (this.t < 0.4 ? 'T-3' : '')) : null;
    const isHost = this.app.isHost;
    const waitingFigure = this.started ? null
      : !isHost ? { value: 'En espera', caption: '' }
      : this.done ? { value: 'Listo', caption: 'para despegar' }
      : null;
    const detail = this.started ? this.status
      : !isHost ? (this.app.room.status === 'open' ? 'Conectado. El despegue empezará aquí en cuanto la tripulación pulse «Comenzar despegue».' : 'Conectando con la sala…')
      : this.done ? `Mission Control puede conectarse con el código ${this.app.room.room} antes de iniciar.`
      : this.status;
    return {
      figure: count ?? waitingFigure ?? { value: pct, caption: 'de los datos de la misión cargados' },
      progress: { value: this.shownPct, label: 'Carga de datos', text: count ? pct : undefined },
      detail,
      side: {
        kind: 'readouts',
        items: [
          { label: 'Altitud', value: groupThousands(this.tele.alt) },
          { label: 'Velocidad', value: this.tele.vel },
          { label: 'Distancia a la Luna', value: groupThousands(this.tele.dist) },
        ],
      },
      primary: this.started || !isHost ? undefined : { id: 'start', label: 'Comenzar despegue', run: () => { this.beginCountdown(); this.hud.invalidate(); } },
      waiting: !this.started,
    };
  }
}
