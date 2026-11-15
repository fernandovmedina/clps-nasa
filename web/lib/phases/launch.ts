import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import type { LoopControl } from '../engine/audio';
import { Panel, UI, roundRect } from '../engine/panel';
import { Particles, starField } from '../engine/particles';
import { earthTexture, glowTexture } from '../engine/textures';
import { createMoon } from '../engine/moon';
import { clamp01, damp, lerp, rand, smooth } from '../engine/util';
import { clearSurface } from './surface-world';
import { disposeObject, loadRocketModel } from './rocket-model';
import { countdownFigure, fmtPercent, groupThousands, type PhaseHud } from '../engine/hud';

const UP = new THREE.Vector3(0, 1, 0);
const EARTH_R = 3000;
const EARTH_C = new THREE.Vector3(0, -EARTH_R, 0);
const MOON_R = 150;
const MOON_C = new THREE.Vector3(900, 2700, -1400);
const T_IGN = 2.6;
const T_LIFT = 3.3;

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

function buildPad() {
  const g = new THREE.Group();
  const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.1, ...o });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const concrete = M(0xa8a59c), steel = M(0x6c7480, { metalness: 0.4, roughness: 0.6 }), deck = M(0x4a4d52);
  add(new THREE.CylinderGeometry(45, 48, 0.6, 64), concrete, 0, 0.3, 0);
  add(new THREE.BoxGeometry(14, 3, 11), deck, 0, 2.1, 0);
  add(new THREE.BoxGeometry(3, 34, 3), steel, 7.5, 20.6, 0);
  const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.05, 34, 3.05, 1, 14, 1)), new THREE.LineBasicMaterial({ color: 0x2a2f36 }));
  lattice.position.set(7.5, 20.6, 0); g.add(lattice);
  add(new THREE.BoxGeometry(5.2, 0.5, 1.1), steel, 4.4, 24.1, 0);
  add(new THREE.BoxGeometry(5.2, 0.5, 1.1), steel, 4.4, 14.6, 0);
  const red = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  for (const [x, z] of [[-20, 14], [18, -16], [-14, -22]]) {
    add(new THREE.CylinderGeometry(0.3, 0.5, 46, 8), steel, x, 23, z);
    add(new THREE.SphereGeometry(0.6, 8, 8), red, x, 46.4, z);
  }
  add(new THREE.CylinderGeometry(4, 4, 6, 24), concrete, -38, 22, 26);
  add(new THREE.CylinderGeometry(0.6, 0.6, 19, 8), steel, -38, 9.5, 26);
  add(new THREE.BoxGeometry(60, 90, 45), M(0xdcdcd8), -260, 44, -380);
  add(new THREE.BoxGeometry(40, 18, 30), M(0xc9c9c3), -200, 8, -330);
  return g;
}

/* ---------------- phase ---------------- */
export class LaunchPhase implements Phase {
  readonly name = 'launch' as const;
  readonly scene = new THREE.Scene();
  targets: THREE.Object3D[] = [];

  private t = 0; private s = 0; private speed = 0; private roll = 0; private arrivalT = 0;
  private progress = 0; private shownPct = 0; private done = false; private leaving = false;
  private started = false;
  private status = 'Inicializando sistemas de vuelo';
  private tele = { alt: '0.0 km', vel: '0.00 km/s', dist: '384,400 km' };
  private uiT = 0; private countLabel = '';

  private rocket: THREE.Group; private nozzles: THREE.Vector3[]; private closed = false;
  private curve: THREE.CatmullRomCurve3; private curveLen: number; private travelUnits: number;
  private flame: Particles; private smoke: Particles;
  private flameLight = new THREE.PointLight(0xff8a3c, 0, 120, 1.4);
  private hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4a36, 1.1);
  private stars = starField();
  private sunSprite: THREE.Sprite; private sunDir = new THREE.Vector3(-0.3, 0.2, 0.93).normalize();
  private atmo: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private bg = new THREE.Color(0x86b6e6); private day = new THREE.Color(0x86b6e6); private space = new THREE.Color(0x000004);
  private padCam = new THREE.Vector3(34, 9, 46);
  private hud: Panel; private count: Panel;
  private rumble: LoopControl | null = null; private wind: LoopControl | null = null; private crackle: LoopControl | null = null;

  constructor(private app: LunarApp) {
    clearSurface();
    app.flags.clear(); app.selected = null; app.ranking = []; app.data = null;
    const sc = this.scene;
    sc.background = this.bg;
    sc.fog = new THREE.Fog(this.bg.clone(), 300, 2600);
    sc.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
    sun.position.copy(this.sunDir).multiplyScalar(1000);
    sc.add(sun, sun.target, this.flameLight);

    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 256, 128), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.95 }));
    earth.position.copy(EARTH_C); earth.rotation.z = Math.PI / 2; sc.add(earth);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.025, 128, 64), new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float opacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.5); gl_FragColor = vec4(vec3(0.35,0.65,1.0), f*opacity); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.atmo.position.copy(EARTH_C); sc.add(this.atmo);

    sc.add(buildPad());
    const r = buildRocket(); this.rocket = r.group; this.nozzles = r.nozzles; sc.add(this.rocket);
    loadRocketModel(this.rocket).then((model) => {
      if (!model) return;
      if (this.closed) { disposeObject(model); return; }
      for (const child of [...this.rocket.children]) { this.rocket.remove(child); disposeObject(child); }
      this.rocket.add(model);
      const spread = model.userData.baseRadius * 0.5;
      this.nozzles[1].x = -spread; this.nozzles[2].x = spread;
    });

    const moon = createMoon(MOON_R, app.moonTex, 128);
    moon.position.copy(MOON_C); sc.add(moon);

    this.stars.material.opacity = 0; sc.add(this.stars);
    const glow = glowTexture();
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d0, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.setScalar(900); sc.add(this.sunSprite);

    this.smoke = new Particles(1800, glow, false);
    this.flame = new Particles(2600, glow, true);
    this.smoke.points.renderOrder = 1; this.flame.points.renderOrder = 2;
    sc.add(this.smoke.points, this.flame.points);

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
    this.hud = new Panel(1400, 360, 1.15, (p, g) => this.drawHud(p, g));
    this.count = new Panel(1024, 256, 2.2, (_p, g) => {
      if (!this.countLabel) return;
      g.font = `800 150px ${UI.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(217,119,87,.7)'; g.shadowBlur = 40; g.fillStyle = UI.text;
      g.fillText(this.countLabel, 512, 134);
    });
    // Without this, pointer/controller rays never hit the HUD panel - the
    // "Comenzar despegue" button renders but nothing can ever click it.
    this.targets.push(this.hud.mesh);
  }

  enter() {
    const rig = this.app.rig;
    rig.add(this.hud.mesh, this.count.mesh);
    this.hud.place(0, 1.02, -1.45);
    this.count.place(0, 2.05, -3.2);
    this.app.setView(this.padCam, new THREE.Vector3(0, 12, 0), { snap: true, rate: 3 });
    this.rumble = this.app.audio.loop('engine_rumble');
    this.wind = this.app.audio.loop('wind_maxq');

    this.app.opts.loadData((p, msg) => { this.progress = Math.max(this.progress, clamp01(p)); this.status = msg; this.hud.invalidate(); })
      .then((d) => { this.app.data = d; this.done = true; this.status = 'Datos listos · Rumbo al polo sur lunar'; this.hud.invalidate(); })
      .catch((e) => { console.error(e); this.status = 'Error al cargar datos — reintenta'; this.hud.invalidate(); });
  }

  exit() {
    this.closed = true; disposeObject(this.rocket);
    this.hud.dispose(); this.count.dispose();
    this.rumble?.stop(); this.wind?.stop(); this.crackle?.stop();
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
      p.button(g, 'start', 44, 215, 1200, 96, 'Comenzar despegue', () => { this.started = true; });
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

    if (!this.started) { this.hud.update(); this.count.update(); return; }

    this.t += dt;
    const t = this.t;

    // countdown
    let label = '';
    if (t > 0.4 && t < 1.2) label = 'T-3'; else if (t >= 1.2 && t < 2.0) label = 'T-2';
    else if (t >= 2.0 && t < T_IGN) label = 'T-1'; else if (t >= T_IGN && t < T_LIFT) label = 'IGNICIÓN';
    else if (t >= T_LIFT && t < T_LIFT + 1.6) label = 'DESPEGUE';
    if (label !== this.countLabel && label.startsWith('T-')) app.audio.play('countdown_tick');
    if (label !== this.countLabel && label === 'IGNICIÓN') app.audio.play('ignition');
    if (label !== this.countLabel) { this.countLabel = label; this.count.invalidate(); }

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
    const pos = this.curve.getPointAt(s), tan = this.curve.getTangentAt(s);
    this.rocket.position.copy(pos);
    if (!app.isXR && t > T_IGN && t < T_LIFT + 2.5) {
      const k = 0.07 * thrust * (1 - smooth(T_LIFT + 1, T_LIFT + 2.5, t));
      this.rocket.position.x += rand(-k, k); this.rocket.position.z += rand(-k, k);
    }
    const q = new THREE.Quaternion().setFromUnitVectors(UP, tan);
    const qi = new THREE.Quaternion().slerp(q, smooth(0, 0.03, s));
    this.roll += dt * 0.35 * smooth(0.04, 0.15, s);
    this.rocket.quaternion.copy(qi).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.roll));
    this.rocket.updateMatrixWorld();

    const alt = pos.y;
    const vel = tan.clone().multiplyScalar(this.speed * this.curveLen);
    const back = tan.clone().negate();

    if (thrust > 0.01) {
      const rate = thrust * 700 * dt;
      for (const nz of this.nozzles) {
        const w = nz.clone().applyMatrix4(this.rocket.matrixWorld);
        const big = nz.x === 0 ? 1 : 0.8;
        for (let i = 0, n = Math.floor(rate + Math.random()); i < n; i++) {
          const sp = (30 + Math.random() * 18) * (0.5 + 0.5 * thrust);
          this.flame.emit({
            x: w.x + rand(-0.25, 0.25), y: w.y + rand(-0.25, 0.25), z: w.z + rand(-0.25, 0.25),
            vx: back.x * sp + rand(-3, 3) + vel.x * 0.55, vy: back.y * sp + rand(-3, 3) + vel.y * 0.55, vz: back.z * sp + rand(-3, 3) + vel.z * 0.55,
            life: rand(0.18, 0.42) * (0.6 + 0.4 * thrust), drag: 1.5, lift: 0, s0: 2.4 * big, s1: 4.2 * big, a: 0.55,
            c0: [1, 0.93, 0.75], c1: [1, 0.32, 0.08],
          });
        }
      }
    }
    if (t > T_IGN && alt < 80) {
      const n = Math.floor(160 * dt * (1 - alt / 80) + Math.random());
      for (let i = 0; i < n; i++) {
        const sx = Math.random() < 0.5 ? -1 : 1, gg = rand(0.85, 1);
        this.smoke.emit({
          x: sx * 8, y: 1.5, z: rand(-3, 3), vx: sx * rand(10, 26), vy: rand(1, 5), vz: rand(-7, 7),
          life: rand(4, 6.5), drag: 0.55, lift: 1.4, s0: 5, s1: rand(22, 34), a: 0.5,
          c0: [gg, 0.86 * gg, 0.72 * gg], c1: [0.62, 0.62, 0.64],
        });
      }
    }
    if (alt > 6 && alt < 900 && thrust > 0.25) {
      const fade = 1 - smooth(300, 900, alt);
      const w = this.nozzles[0].clone().applyMatrix4(this.rocket.matrixWorld);
      for (let i = 0, n = Math.floor(90 * dt + Math.random()); i < n; i++) {
        const f = Math.random();
        this.smoke.emit({
          x: w.x - vel.x * dt * f, y: w.y - vel.y * dt * f, z: w.z - vel.z * dt * f,
          vx: back.x * 6 + rand(-1.5, 1.5), vy: back.y * 6 + rand(-1.5, 1.5), vz: back.z * 6 + rand(-1.5, 1.5),
          life: rand(2.5, 3.8), drag: 0.8, lift: 0.4, s0: 3, s1: rand(14, 22), a: 0.4 * fade,
          c0: [0.95, 0.9, 0.85], c1: [0.7, 0.72, 0.76],
        });
      }
    }
    const scale = app.pointScale();
    this.flame.update(dt, scale); this.smoke.update(dt, scale);
    this.flameLight.position.copy(this.rocket.position).addScaledVector(back, 3);
    this.flameLight.intensity = thrust * (900 + Math.random() * 300) * (1 - smooth(200, 600, alt) * 0.9);

    // sky → space
    const sky = smooth(30, 900, alt);
    this.rumble?.set('thrust', thrust);
    this.rumble?.set('atmosphere', 1 - sky);
    this.wind?.set('dynamic_pressure', smooth(60, 300, alt) * (1 - smooth(300, 850, alt)));
    const grounded = t > T_IGN && alt < 140;
    if (grounded && !this.crackle) this.crackle = app.audio.loop('liftoff_crackle');
    else if (!grounded && this.crackle) { this.crackle.stop(); this.crackle = null; }
    this.bg.copy(this.day).lerp(this.space, sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.bg); fog.near = lerp(250, 40000, sky); fog.far = lerp(2600, 60000, sky);
    this.hemi.intensity = lerp(1.1, 0.12, sky);
    (this.stars.material as THREE.PointsMaterial).opacity = smooth(250, 1200, alt);
    this.atmo.material.uniforms.opacity.value = smooth(80, 700, alt) * 0.9;

    // viewer: pad camera → chase camera → moon framing
    const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 0, 1));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize().applyAxisAngle(tan, t * 0.1 * smooth(0.25, 0.45, s));
    const chase = pos.clone().addScaledVector(side, 38).addScaledVector(tan, -30);
    const chaseLook = pos.clone().addScaledVector(tan, 12);
    const m = smooth(0.72, 1, s);
    if (m > 0) {
      const toMoon = MOON_C.clone().sub(pos).normalize();
      chase.lerp(pos.clone().addScaledVector(toMoon, -75).addScaledVector(side, 45).addScaledVector(UP, -20), m);
      chaseLook.lerp(pos.clone().lerp(MOON_C, 0.4), m);
    }
    const w = smooth(0.004, 0.05, s);
    const eye = this.padCam.clone().lerp(chase, w);
    const look = pos.clone().addScaledVector(UP, 9).lerp(chaseLook, w);
    app.setView(eye, look, { rate: 3 });

    const camPos = new THREE.Vector3().setFromMatrixPosition(app.camera.matrixWorld);
    this.stars.position.copy(camPos);
    this.sunSprite.position.copy(camPos).addScaledVector(this.sunDir, 12000);
    this.sunSprite.material.opacity = smooth(300, 1200, alt);

    // telemetry (10 Hz)
    this.uiT += dt;
    if (this.uiT > 0.1) {
      this.uiT = 0;
      const u = Math.max(0, pos.distanceTo(EARTH_C) - EARTH_R - 3.8);
      const km = s >= 0.999 ? 384300 : 384400 * Math.pow(clamp01(u / this.travelUnits), 2.2);
      const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
      const v = t < T_LIFT ? 0 : lerp(lerp(0, 10.9, smooth(0, 0.25, s)), 1.7, smooth(0.6, 1, s)) * (0.75 + 0.25 * Math.min(1, this.speed / 0.04));
      this.tele = { alt: km < 1000 ? `${km.toFixed(1)} km` : `${fmt(km)} km`, vel: `${v.toFixed(2)} km/s`, dist: `${fmt(Math.max(100, 384400 - km))} km` };
      this.hud.invalidate();
    }
    this.hud.update(); this.count.update();

    // arrival → orbit insertion
    if (this.done && s >= 0.999 && !this.leaving) {
      this.arrivalT += dt;
      if (this.arrivalT > 0.8) { this.leaving = true; app.goTo('orbit', 0.9, 1.2); }
    }
  }

  controlHud(): PhaseHud {
    const pct = fmtPercent(this.shownPct * 100);
    const count = this.started ? countdownFigure(this.countLabel || (this.t < 0.4 ? 'T-3' : '')) : null;
    return {
      figure: count ?? { value: pct, caption: 'de los datos de la misión cargados' },
      progress: { value: this.shownPct, label: 'Carga de datos', text: count ? pct : undefined },
      detail: this.status,
      side: {
        kind: 'readouts',
        items: [
          { label: 'Altitud', value: groupThousands(this.tele.alt) },
          { label: 'Velocidad', value: this.tele.vel },
          { label: 'Distancia a la Luna', value: groupThousands(this.tele.dist) },
        ],
      },
      primary: this.started ? undefined : { id: 'start', label: 'Comenzar despegue', run: () => { this.started = true; this.hud.invalidate(); } },
      waiting: !this.started,
    };
  }
}
