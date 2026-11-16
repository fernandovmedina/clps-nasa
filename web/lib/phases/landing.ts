import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import type { LoopControl } from '../engine/audio';
import { Particles } from '../engine/particles';
import { cockpitTexture, glowTexture } from '../engine/textures';
import { clamp01, damp, disposeTree, rand, smooth } from '../engine/util';
import { ensureSelection, nearReliefNote } from './pov';
import { CabinConsole } from './landing-console';
import { surfaceFor, type SurfaceWorld } from './surface-world';
import { fmtInt, fmtLatLon, fmtPercent, type PhaseHud } from '../engine/hud';

const T_BRAKE = 17;     // end of the powered approach
export const T_TOUCH = 25.5;   // touchdown
const DECK = 3.0;       // cockpit floor height above the ground
// Matches the feel of the old 0.2-per-frame smoothing at 60 fps, but frame-rate independent
// (the 90 Hz Quest previously read speeds more sluggish than desktop with the per-frame constant).
const VS_HS_DAMP_RATE = -Math.log(0.8) * 60;

// Demo case "NO CAER" (sites.ts, site.crash): the engine fails mid-descent, the capsule
// free-falls under real lunar gravity and explodes on impact, then we return to orbit.
const T_FAIL = 12;              // engine failure (≈ 75 m above the ground)
const MOON_G = 1.62;            // m/s²
const T_AFTER_IMPACT = 6.5;     // seconds of explosion before going back to orbit

// Kept closer than the nearest terrain (the ground is never less than ~4.6 m from the eye), so the
// cabin always occludes the world and the exterior only shows through the keyed window.
const COCKPIT_RADIUS = 3;
// The source photo's chroma-key window sits almost exactly at image-center (u≈0.499, found
// by scanning the green pixels), which three.js's SphereGeometry UV mapping places at local
// −X once the usual scale(-1,1,1) "view from inside" flip is applied. Rotating the sphere
// −90° around Y brings that point to local −Z - this engine's forward direction - verified
// numerically against three.js's own UV/position mapping, not eyeballed.
const COCKPIT_YAW = -Math.PI / 2;

/** Cockpit interior in rig-local space (eye at 0, 1.6, 0 looking −Z): a 360° photo sphere
 *  wrapped around the viewer, with its chroma-key window punched through to the real exterior. */
function buildCockpit(app: LunarApp) {
  const g = new THREE.Group();

  const geo = new THREE.SphereGeometry(COCKPIT_RADIUS, 64, 48);
  geo.scale(-1, 1, 1);
  const texture = cockpitTexture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  // The photo has a flat chroma-key green panel where the real exterior should show through -
  // discard those pixels so whatever is actually behind the sphere (the lunar scene, already
  // rendered in this same THREE.Scene) shows there instead of a baked-in green rectangle.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float key = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
      if (key > 0.06) discard;
      diffuseColor.g -= max(key, 0.0);`,
    );
  };
  const sphere = new THREE.Mesh(geo, material);
  sphere.position.set(0, app.eyeHeight, 0);
  sphere.rotation.y = COCKPIT_YAW;
  g.add(sphere);

  // The photo already shows a detailed, lit console - no need for the old procedural blinking
  // cubes, which would now float in empty space in front of it instead of sitting on anything.
  const lights: THREE.Mesh[] = [];
  const lamp = new THREE.PointLight(0xffd9b0, 1.6, 3.2, 2); lamp.position.set(0, 2.3, -0.1); g.add(lamp);
  return { group: g, lights };
}

/** Follows `prefers-reduced-motion` live, like launch.ts; without matchMedia (tests, old browsers) motion stays on. */
export function watchReducedMotion(): { reduced: () => boolean; stop: () => void } {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = query?.matches ?? false;
  const onChange = (e: MediaQueryListEvent) => { reduced = e.matches; };
  query?.addEventListener('change', onChange);
  return { reduced: () => reduced, stop: () => query?.removeEventListener('change', onChange) };
}

const SHAKE_SECONDS = 1.2;
const JOLT_SECONDS = 0.5;

/** Amplitude (m) of the desktop-only camera shake `since` seconds after the impact; none in VR or with reduced motion. */
export function impactShakeAmplitude(since: number, isXR: boolean, reducedMotion: boolean): number {
  if (isXR || reducedMotion || since < 0 || since >= SHAKE_SECONDS) return 0;
  return 0.6 * (1 - since / SHAKE_SECONDS);
}

/** Vertical camera offset (m) of the desktop-only touchdown jolt at time `t`; none in VR or with reduced motion. */
export function touchdownJolt(t: number, isXR: boolean, reducedMotion: boolean): number {
  const since = t - T_TOUCH;
  if (isXR || reducedMotion || since <= 0 || since >= JOLT_SECONDS) return 0;
  return Math.sin(since * 40) * 0.04 * (1 - since / JOLT_SECONDS);
}

/** Phase 4 — powered descent seen from inside the capsule. */
export class LandingPhase implements Phase {
  readonly name = 'landing' as const;
  readonly scene: THREE.Scene;
  targets: THREE.Object3D[] = [];
  readonly ownsRunControls = true;
  private world: SurfaceWorld;
  private t = 0;
  private cockpit: ReturnType<typeof buildCockpit>;
  private cabinConsole: CabinConsole;
  private dust: Particles; private plume: Particles;
  private engine = new THREE.PointLight(0xffb070, 0, 90, 1.6);
  private P0: THREE.Vector3; private C: THREE.Vector3; private P1: THREE.Vector3; private P2: THREE.Vector3;
  private last = new THREE.Vector3(); private vs = 0; private hs = 0;
  private thruster: LoopControl | null = null;
  private alt = 0; private fuel = 100; private touched = false; private leaving = false;
  // crash demo state (only used when the selected site has `crash: true`)
  private readonly crash: boolean;
  private failPos: THREE.Vector3 | null = null; private failVel = new THREE.Vector3();
  private impactAt = -1; private impactSpeed = 0; private impactPoint = new THREE.Vector3(); private impactEye = new THREE.Vector3();
  private fire: Particles | null = null; private smoke: Particles | null = null;
  private blast = new THREE.PointLight(0xffa040, 0, 400, 1.2);
  private alarm: THREE.Mesh | null = null;
  private motion = watchReducedMotion();

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

    this.cockpit = buildCockpit(app);
    this.cabinConsole = new CabinConsole(app, () => this.controlHud());
    const glow = glowTexture();
    this.dust = new Particles(2400, glow, false);
    this.plume = new Particles(900, glow, true);
    this.scene.add(this.dust.points, this.plume.points, this.engine);

    this.crash = !!m.site.crash;
    if (this.crash) {
      this.fire = new Particles(2500, glow, true);
      this.smoke = new Particles(1200, glow, false);
      this.scene.add(this.smoke.points, this.fire.points, this.blast);
      // red alarm wash around the head (works in VR, where there is no screen overlay)
      this.alarm = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff2a1a, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.alarm.renderOrder = 999;
    }
  }

  enter() {
    this.world.lander.visible = false;
    this.world.lzMarker.visible = true;
    const rig = this.app.rig;
    rig.add(this.cockpit.group);
    this.cabinConsole.mount(rig);
    this.app.setView(this.pos(0), this.world.lz, { snap: true, rate: 6 });
    this.thruster = this.app.audio.loop('landing_thruster');
    if (this.alarm) this.app.camera.add(this.alarm);
  }

  exit() {
    this.motion.stop();
    this.thruster?.stop();
    this.cockpit.group.removeFromParent(); disposeTree(this.cockpit.group);
    this.cabinConsole.dispose();
    this.scene.remove(this.dust.points, this.plume.points, this.engine);
    this.dust.points.geometry.dispose(); this.plume.points.geometry.dispose();
    if (this.crash) {
      this.scene.remove(this.fire!.points, this.smoke!.points, this.blast);
      this.fire!.points.geometry.dispose(); this.smoke!.points.geometry.dispose();
      this.alarm?.removeFromParent(); this.alarm?.geometry.dispose();
    }
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

  /** Crash demo: ballistic fall from the failure point under lunar gravity. */
  private crashPos(t: number) {
    if (!this.failPos) {
      this.failPos = this.pos(T_FAIL);
      this.failVel.copy(this.failPos).sub(this.pos(T_FAIL - 0.05)).divideScalar(0.05);
    }
    const tau = t - T_FAIL;
    return this.failPos.clone().addScaledVector(this.failVel, tau).add(new THREE.Vector3(0, -0.5 * MOON_G * tau * tau, 0));
  }

  private updateCrash(dt: number, t: number) {
    const app = this.app;
    const exploded = this.impactAt >= 0;
    let eye: THREE.Vector3;
    if (!exploded) {
      eye = this.crashPos(t);
      const groundEye = this.world.heightAt(eye.x, eye.z) + DECK + app.eyeHeight;
      if (eye.y <= groundEye) {
        eye.y = groundEye;
        this.impactSpeed = Math.abs(this.failVel.y - MOON_G * (t - T_FAIL));
        this.impactAt = t;
        this.impactEye.copy(eye);
        this.impactPoint.set(eye.x, this.world.heightAt(eye.x, eye.z), eye.z);
        this.explode();
      }
    } else {
      // pull back from the wreck to watch the fireball (smooth, no rotation tricks for VR)
      const k = smooth(0, 1.2, t - this.impactAt);
      eye = this.impactEye.clone().addScaledVector(this.world.earthHoriz, -150 * k).add(new THREE.Vector3(0, 45 * k, 0));
    }

    const ground = this.world.heightAt(eye.x, eye.z);
    this.alt = Math.max(0, eye.y - app.eyeHeight - DECK - ground);
    if (dt > 0 && !exploded) {
      const k = damp(VS_HS_DAMP_RATE, dt);
      this.vs = this.vs + ((eye.y - this.last.y) / dt - this.vs) * k;
      this.hs = this.hs + (Math.hypot(eye.x - this.last.x, eye.z - this.last.z) / dt - this.hs) * k;
    }
    this.last.copy(eye);

    const since = exploded ? t - this.impactAt : 0;
    const a = exploded ? impactShakeAmplitude(since, app.isXR, this.motion.reduced()) : 0;
    if (a > 0) { eye.x += rand(-a, a); eye.y += rand(-a, a); eye.z += rand(-a, a); }
    const look = exploded ? this.impactPoint.clone().add(new THREE.Vector3(0, 6, 0)) : this.world.lz.clone();
    app.setView(eye, look, { rate: exploded ? 3 : 6 });

    // alarm: pulsing red while falling, white flash at impact
    if (this.alarm) {
      const mat = this.alarm.material as THREE.MeshBasicMaterial;
      if (!exploded) { mat.color.set(0xff2a1a); mat.opacity = 0.12 + 0.12 * Math.sin(t * 14); }
      else { mat.color.set(0xffe2b0); mat.opacity = Math.max(0, 0.9 - since * 1.5); }
    }
    this.thruster?.set('throttle', 0);
    this.engine.intensity = Math.max(0, this.engine.intensity - dt * 3000);

    if (exploded) {
      this.blast.position.copy(this.impactPoint).add(new THREE.Vector3(0, 8, 0));
      this.blast.intensity = Math.max(0, 60000 * Math.exp(-since * 2.2));
      // the fire keeps burning for a moment
      if (since < 3.5) {
        for (let i = 0, n = Math.floor(320 * dt * (1 - since / 3.5) + Math.random()); i < n; i++) this.emitFire(0.45);
      }
    }
    const scale = app.pointScale();
    this.fire!.update(dt, scale); this.smoke!.update(dt, scale); this.plume.update(dt, scale); this.dust.update(dt, scale);

    if (exploded && !this.leaving && since > T_AFTER_IMPACT) { this.leaving = true; app.goTo('orbit', 1.2, 1.2); }
  }

  private emitFire(power: number) {
    const p = this.impactPoint;
    const a = rand(0, Math.PI * 2), up = rand(0.15, 1), sp = rand(15, 70) * power;
    const h = Math.sqrt(1 - up * up);
    this.fire!.emit({
      x: p.x + rand(-2, 2), y: p.y + rand(0, 3), z: p.z + rand(-2, 2),
      vx: Math.cos(a) * h * sp, vy: up * sp, vz: Math.sin(a) * h * sp,
      life: rand(1.2, 3.2), drag: 1.2, lift: -MOON_G, s0: rand(6, 12), s1: rand(22, 40), a: 0.85,
      c0: [1, 0.95, 0.75], c1: [0.9, 0.2, 0.05],
    });
  }

  private explode() {
    const app = this.app, p = this.impactPoint;
    this.cockpit.group.visible = false; // the cabin is gone
    this.world.lzMarker.visible = false;
    this.cabinConsole.dispose();
    app.audio.play('touchdown_thud'); app.audio.play('dust_hiss'); app.audio.play('error_tone');
    for (let i = 0; i < 900; i++) this.emitFire(1);
    for (let i = 0; i < 500; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(4, 30), g = rand(0.18, 0.35);
      this.smoke!.emit({
        x: p.x + rand(-3, 3), y: p.y + rand(0, 4), z: p.z + rand(-3, 3),
        vx: Math.cos(a) * sp, vy: rand(4, 22), vz: Math.sin(a) * sp,
        life: rand(3, 6), drag: 0.5, lift: -0.4, s0: rand(6, 10), s1: rand(30, 50), a: 0.55,
        c0: [g + 0.25, g + 0.15, g + 0.1], c1: [g, g, g],
      });
    }
    // regolith thrown out by the impact
    for (let i = 0; i < 700; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(20, 80), g = rand(0.5, 0.7);
      this.dust.emit({ x: p.x, y: p.y + 0.5, z: p.z, vx: Math.cos(a) * sp, vy: rand(3, 25), vz: Math.sin(a) * sp,
        life: rand(2, 4), drag: 0.3, lift: -MOON_G, s0: 1.5, s1: rand(6, 12), a: 0.6, c0: [g, g, g * 0.97], c1: [g * 0.8, g * 0.8, g * 0.78] });
    }
  }

  update(dt: number, time: number) {
    this.t += dt;
    const t = this.t, app = this.app;
    if (this.crash && t >= T_FAIL) {
      this.world.update(dt, time);
      if (!this.failPos) { app.audio.play('error_tone'); this.thruster?.set('throttle', 0); }
      this.updateCrash(dt, t);
      return;
    }
    this.world.update(dt, time);
    const eye = this.pos(t);
    const ground = this.world.heightAt(eye.x, eye.z);
    this.alt = Math.max(0, eye.y - app.eyeHeight - DECK - ground);
    if (dt > 0) {
      const k = damp(VS_HS_DAMP_RATE, dt);
      this.vs = this.vs + ((eye.y - this.last.y) / dt - this.vs) * k;
      this.hs = this.hs + (Math.hypot(eye.x - this.last.x, eye.z - this.last.z) / dt - this.hs) * k;
    }
    this.last.copy(eye);
    this.fuel = Math.max(9, 100 - t * 3.4);

    eye.y += touchdownJolt(t, app.isXR, this.motion.reduced());
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
    if (!this.touched && t >= T_TOUCH) this.touched = true;
    if (this.touched && !this.leaving && t > T_TOUCH + 2.8) { this.leaving = true; app.goTo('transmit', 1.0, 1.4); }
  }

  updateUi() { if (this.impactAt < 0) this.cabinConsole.update(); }

  controlHud(): PhaseHud {
    const site = this.world.m.site;
    if (this.crash && this.t >= T_FAIL) return this.crashHud(site);
    const status = this.touched ? 'Luz de contacto · motor apagado' : this.t < T_BRAKE ? 'Descenso motorizado · aproximación' : 'Descenso terminal · vertical';
    const toTouch = Math.max(0, T_TOUCH - this.t);
    const progress = clamp01(this.t / T_TOUCH);
    return {
      figure: { value: `${this.alt < 100 ? this.alt.toFixed(1) : fmtInt(this.alt)} m`, caption: 'sobre la superficie' },
      progress: { value: progress, label: 'Avance del descenso', text: fmtPercent(progress * 100) },
      detail: `${status} · ${this.touched ? 'alunizaje confirmado' : `contacto en ${toTouch.toFixed(0)} s`}`,
      side: {
        kind: 'readouts',
        items: [
          { label: 'Velocidad de descenso', value: `${(this.touched ? 0 : Math.abs(this.vs)).toFixed(1)} m/s` },
          { label: 'Velocidad horizontal', value: `${(this.touched ? 0 : this.hs).toFixed(1)} m/s` },
          { label: 'Combustible', value: fmtPercent(this.fuel), meter: { value: this.fuel / 100, label: `Combustible al ${Math.round(this.fuel)} %` } },
          { label: 'Luz de contacto', value: this.touched ? 'Encendida' : 'Apagada' },
          { label: 'Zona de alunizaje', value: fmtLatLon(site.lat, site.lon), size: 'md' },
        ],
        note: nearReliefNote(site),
      },
    };
  }

  private crashHud(site: Parameters<typeof nearReliefNote>[0]): PhaseHud {
    const exploded = this.impactAt >= 0;
    return {
      figure: exploded
        ? { value: 'IMPACTO', caption: 'misión perdida' }
        : { value: `${this.alt < 100 ? this.alt.toFixed(1) : fmtInt(this.alt)} m`, caption: 'caída libre · motor apagado' },
      detail: exploded
        ? `Impacto a ${this.impactSpeed.toFixed(1)} m/s · regresando a órbita`
        : 'FALLA DEL MOTOR · caída libre con gravedad lunar (1.62 m/s²)',
      side: {
        kind: 'readouts',
        items: [
          { label: 'Velocidad de descenso', value: `${(exploded ? this.impactSpeed : Math.abs(this.vs)).toFixed(1)} m/s` },
          { label: 'Motor principal', value: 'Falla' },
          { label: 'Combustible', value: fmtPercent(this.fuel) },
          { label: 'Luz de contacto', value: exploded ? 'Impacto' : 'Apagada' },
          { label: 'Zona de alunizaje', value: fmtLatLon(site.lat, site.lon), size: 'md' },
        ],
        note: nearReliefNote(site),
      },
    };
  }
}
