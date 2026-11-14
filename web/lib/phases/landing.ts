import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import type { LoopControl } from '../engine/audio';
import { Panel, UI, roundRect } from '../engine/panel';
import { Particles } from '../engine/particles';
import { glowTexture } from '../engine/textures';
import { clamp01, disposeTree, rand, smooth } from '../engine/util';
import { ensureSelection } from './pov';
import { surfaceFor, type SurfaceWorld } from './surface-world';

const T_BRAKE = 17;     // end of the powered approach
const T_TOUCH = 25.5;   // touchdown
const DECK = 3.0;       // cockpit floor height above the ground

/** Cockpit interior in rig-local space (eye at 0, 1.6, 0 looking −Z). */
function buildCockpit() {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.85, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.4, metalness: 0.7 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat = wall) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m;
  };
  // window opening x ∈ [−0.85, 0.85], y ∈ [0.75, 1.95] at z = −0.85
  box(2.6, 0.55, 0.12, 0, 2.225, -0.85);
  box(2.6, 0.75, 0.12, 0, 0.375, -0.85);
  box(0.45, 1.2, 0.12, -1.075, 1.35, -0.85);
  box(0.45, 1.2, 0.12, 1.075, 1.35, -0.85);
  box(1.76, 0.05, 0.16, 0, 1.97, -0.82, trim); box(1.76, 0.05, 0.16, 0, 0.73, -0.82, trim);
  box(0.05, 1.26, 0.16, -0.87, 1.35, -0.82, trim); box(0.05, 1.26, 0.16, 0.87, 1.35, -0.82, trim);
  box(0.08, 2.5, 1.6, -1.3, 1.25, -0.1); box(0.08, 2.5, 1.6, 1.3, 1.25, -0.1);
  box(2.68, 0.08, 1.6, 0, 2.5, -0.1); box(2.68, 0.06, 1.6, 0, 0.0, -0.1);
  box(2.68, 2.5, 0.08, 0, 1.25, 0.7);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.05, depthWrite: false }));
  glass.position.set(0, 1.35, -0.8); g.add(glass);
  const console = box(1.7, 0.06, 0.42, 0, 0.72, -0.6, wall);
  console.rotation.x = -0.45;
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.035), new THREE.MeshBasicMaterial({ color: [0x5cf2b0, 0xff9a3c, 0xff4a3a, 0x8ec5ff][i % 4] }));
    m.position.set(-0.75 + (i % 7) * 0.05 + (i < 7 ? 0 : 1.15), 0.77, -0.52 - Math.floor(i / 7) * 0.0);
    g.add(m); lights.push(m);
  }
  const lamp = new THREE.PointLight(0xffd9b0, 1.6, 3.2, 2); lamp.position.set(0, 2.3, -0.1); g.add(lamp);
  return { group: g, lights };
}

/** Phase 4 — powered descent seen from inside the capsule. */
export class LandingPhase implements Phase {
  readonly name = 'landing' as const;
  readonly scene: THREE.Scene;
  targets: THREE.Object3D[] = [];
  private world: SurfaceWorld;
  private t = 0;
  private cockpit: ReturnType<typeof buildCockpit>;
  private hud: Panel;
  private dust: Particles; private plume: Particles;
  private engine = new THREE.PointLight(0xffb070, 0, 90, 1.6);
  private P0: THREE.Vector3; private C: THREE.Vector3; private P1: THREE.Vector3; private P2: THREE.Vector3;
  private last = new THREE.Vector3(); private vs = 0; private hs = 0;
  private thruster: LoopControl | null = null;
  private alt = 0; private fuel = 100; private touched = false; private leaving = false; private uiT = 0;

  constructor(private app: LunarApp) {
    const m = ensureSelection(app);
    this.world = surfaceFor(app, m);
    this.scene = this.world.scene;
    const lz = this.world.lz, dir = this.world.earthHoriz, up = new THREE.Vector3(0, 1, 0);
    this.P0 = lz.clone().addScaledVector(dir, -1300).addScaledVector(up, 850);
    this.C = lz.clone().addScaledVector(dir, -420).addScaledVector(up, 160);
    this.P1 = lz.clone().addScaledVector(dir, -18).addScaledVector(up, 60);
    this.P2 = lz.clone().addScaledVector(up, DECK + app.eyeHeight);
    this.last.copy(this.P0);

    this.cockpit = buildCockpit();
    this.hud = new Panel(1024, 440, 0.56, (p, g) => this.drawHud(p, g));
    const glow = glowTexture();
    this.dust = new Particles(2400, glow, false);
    this.plume = new Particles(900, glow, true);
    this.scene.add(this.dust.points, this.plume.points, this.engine);
  }

  enter() {
    this.world.lander.visible = false;
    this.world.lzMarker.visible = true;
    const rig = this.app.rig;
    rig.add(this.cockpit.group, this.hud.mesh);
    this.hud.place(0, 0.98, -0.66);
    this.app.setView(this.pos(0), this.world.lz, { snap: true, rate: 6 });
    this.thruster = this.app.audio.loop('landing_thruster');
  }

  exit() {
    this.thruster?.stop();
    this.cockpit.group.removeFromParent(); disposeTree(this.cockpit.group);
    this.hud.dispose();
    this.scene.remove(this.dust.points, this.plume.points, this.engine);
    this.dust.points.geometry.dispose(); this.plume.points.geometry.dispose();
  }

  private pos(t: number) {
    if (t < T_BRAKE) {
      const u = 1 - Math.pow(1 - t / T_BRAKE, 1.8); // fast high, slower low
      const a = this.P0.clone().lerp(this.C, u), b = this.C.clone().lerp(this.P1, u);
      return a.lerp(b, u);
    }
    const u = smooth(T_BRAKE, T_TOUCH, Math.min(t, T_TOUCH));
    return this.P1.clone().lerp(this.P2, u);
  }

  update(dt: number, time: number) {
    this.t += dt;
    const t = this.t, app = this.app;
    this.world.update(dt, time);
    const eye = this.pos(t);
    const ground = this.world.heightAt(eye.x, eye.z);
    this.alt = Math.max(0, eye.y - app.eyeHeight - DECK - ground);
    if (dt > 0) {
      this.vs = this.vs + ((eye.y - this.last.y) / dt - this.vs) * 0.2;
      this.hs = this.hs + (Math.hypot(eye.x - this.last.x, eye.z - this.last.z) / dt - this.hs) * 0.2;
    }
    this.last.copy(eye);
    this.fuel = Math.max(9, 100 - t * 3.4);

    // desktop-only touchdown jolt (no camera shake in VR)
    if (!app.isXR && t > T_TOUCH && t < T_TOUCH + 0.5) eye.y += Math.sin((t - T_TOUCH) * 40) * 0.04 * (1 - (t - T_TOUCH) / 0.5);
    const look = t < T_BRAKE ? this.world.lz.clone() : this.world.lz.clone().addScaledVector(this.world.earthHoriz, 40);
    app.setView(eye, look, { rate: 6 });

    // engine plume below the capsule + dust kicked up near the ground
    const thrusting = t < T_TOUCH;
    this.thruster?.set('throttle', thrusting ? (t > T_BRAKE ? 1 : 0.6) : 0);
    const below = eye.clone().add(new THREE.Vector3(0, -app.eyeHeight - DECK + 0.6, 0));
    const scale = app.pointScale();
    this.engine.position.copy(below).add(new THREE.Vector3(0, -2, 0));
    this.engine.intensity = thrusting ? 900 * (0.8 + Math.random() * 0.4) * (t > T_BRAKE ? 1 : 0.6) : Math.max(0, this.engine.intensity - dt * 3000);
    if (thrusting) {
      for (let i = 0, n = Math.floor(160 * dt + Math.random()); i < n; i++) {
        this.plume.emit({ x: below.x + rand(-0.3, 0.3), y: below.y, z: below.z + rand(-0.3, 0.3), vx: rand(-3, 3), vy: -rand(25, 40), vz: rand(-3, 3),
          life: rand(0.15, 0.3), drag: 1, lift: 0, s0: 1.4, s1: 2.6, a: 0.5, c0: [1, 0.9, 0.7], c1: [1, 0.45, 0.15] });
      }
    }
    if (this.alt < 45 && t < T_TOUCH + 1.2) {
      const k = clamp01(1 - this.alt / 45);
      for (let i = 0, n = Math.floor(420 * k * dt + Math.random()); i < n; i++) {
        const a = rand(0, Math.PI * 2), r = rand(0, 5), sp = rand(18, 40) * k;
        const x = below.x + Math.cos(a) * r, z = below.z + Math.sin(a) * r;
        const g = rand(0.55, 0.75);
        this.dust.emit({ x, y: this.world.heightAt(x, z) + 0.3, z, vx: Math.cos(a) * sp, vy: rand(0.5, 3), vz: Math.sin(a) * sp,
          life: rand(1.6, 2.8), drag: 0.25, lift: -0.6, s0: 1.2, s1: rand(5, 9), a: 0.5 * k, c0: [g, g, g * 0.97], c1: [g * 0.8, g * 0.8, g * 0.78] });
      }
    }
    this.dust.update(dt, scale); this.plume.update(dt, scale);

    this.cockpit.lights.forEach((l, i) => (l.visible = Math.sin(time * (2 + (i % 5)) + i * 1.7) > -0.3));

    if (!this.touched && t >= T_TOUCH) { app.audio.play('touchdown_thud'); app.audio.play('dust_hiss'); }
    if (!this.touched && t >= T_TOUCH) { this.touched = true; this.hud.invalidate(); }
    if (this.touched && !this.leaving && t > T_TOUCH + 2.8) { this.leaving = true; app.goTo('transmit', 1.0, 1.4); }

    this.uiT += dt;
    if (this.uiT > 0.1) { this.uiT = 0; this.hud.invalidate(); }
    this.hud.update();
  }

  private drawHud(p: Panel, g: CanvasRenderingContext2D) {
    roundRect(g, 4, 4, 1016, 432, 24); g.fillStyle = 'rgba(20,20,19,.92)'; g.fill();
    g.strokeStyle = 'rgba(143,203,155,.5)'; g.lineWidth = 3; g.stroke();
    const green = UI.ok;
    const status = this.touched ? 'LUZ DE CONTACTO · MOTOR APAGADO' : this.t < T_BRAKE ? 'DESCENSO MOTORIZADO · APROXIMACIÓN' : 'DESCENSO TERMINAL · VERTICAL';
    g.font = `700 30px ${UI.mono}`; g.fillStyle = this.touched ? UI.warn : green; g.fillText(status, 40, 62);
    const cells: [string, string][] = [
      ['ALTITUD', `${this.alt.toFixed(this.alt < 100 ? 1 : 0)} m`],
      ['VEL. VERTICAL', `${this.touched ? '0.0' : this.vs.toFixed(1)} m/s`],
      ['VEL. HORIZ.', `${this.touched ? '0.0' : this.hs.toFixed(1)} m/s`],
      ['COMBUSTIBLE', `${this.fuel.toFixed(0)} %`],
    ];
    cells.forEach(([k, v], i) => {
      const x = 40 + (i % 2) * 490, y = 130 + Math.floor(i / 2) * 130;
      g.font = `600 24px ${UI.mono}`; g.fillStyle = 'rgba(143,203,155,.65)'; g.fillText(k, x, y);
      g.font = `800 58px ${UI.mono}`; g.fillStyle = green; g.fillText(v, x, y + 64);
    });
    const tt = Math.max(0, T_TOUCH - this.t);
    g.font = `600 26px ${UI.mono}`; g.fillStyle = 'rgba(143,203,155,.8)';
    g.fillText(this.touched ? 'ALUNIZAJE CONFIRMADO' : `CONTACTO EN ${tt.toFixed(1)} s`, 40, 410);
  }
}
