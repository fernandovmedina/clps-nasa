import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clamp01, damp, smooth } from '../engine/util';
import { disposeObject } from './rocket-model';

const MODEL_URL = '/models/astronaut.glb';
const TIMEOUT_MS = 20000;
const HEIGHT_M = 1.8;

const BREATH_PERIOD = 4.6;
const SWAY_PERIOD = 11;
const SWAY_X = 0.007;        // model units, the model is 0.97 tall
const HIP_HEIGHT = 0.41;
const GAZE_PERIOD = 26;
const WAVE_PERIOD = 22;
const NECK_YAW = 1.1;
const NECK_PITCH = 0.3;
const TURN_DAMP = 1.4;
const TURN_LIMIT = 0.7;
const ARM_DROP = THREE.MathUtils.degToRad(52);
const ARM_FORWARD = THREE.MathUtils.degToRad(12);

export type AstronautMode = 'wave' | 'point';

const _a = new THREE.Vector3();
const _b = new THREE.Quaternion();
const _c = new THREE.Quaternion();
const _d = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const ARM_AXIS = { '-1': new THREE.Vector3(-1, 0, 0), '1': new THREE.Vector3(1, 0, 0) } as const;
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Loads the astronaut and fits it to a 1.80 m figure: feet at y = 0, centred in x/z, facing +Z.
 * Resolves null on any error or after TIMEOUT_MS.
 */
export function loadAstronaut(): Promise<Astronaut | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (model: THREE.Group | null) => {
      if (settled) { if (model) disposeObject(model); return; }
      settled = true; clearTimeout(timer); resolve(model ? new Astronaut(model) : null);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL)
      .then((gltf) => finish(fit(gltf.scene)))
      .catch(() => finish(null));
  });
}

function fit(model: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  out.add(model);
  out.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(out);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = HEIGHT_M / s.y;
  model.scale.setScalar(k);
  model.position.set(-c.x * k, -box.min.y * k - 0.01, -c.z * k);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return out;
}

/**
 * Where the astronaut stands, as a horizontal offset from the lander. All vectors are horizontal unit vectors
 * from the lander: toward the Sun, toward whoever is watching and toward the Earth. He ends up 4.5-6 m out, in front
 * of the lander seen from the viewer and clear of its line of sight, with his shadow missing the lander and the
 * lander's shadow missing him, on the side of the Earth so the arm that points there points away from the lander.
 */
export function astronautSpot(sun: THREE.Vector3, viewer: THREE.Vector3, earth: THREE.Vector3) {
  const cross = (a: THREE.Vector3, x: number, z: number) => a.x * z - a.z * x;
  const earthSide = Math.sign(cross(viewer, earth.x, earth.z));
  let best = Infinity;
  const out = new THREE.Vector3();
  for (const r of [4.5, 5, 5.5, 6]) {
    for (let deg = 0; deg < 360; deg += 5) {
      const x = r * Math.cos(deg * Math.PI / 180), z = r * Math.sin(deg * Math.PI / 180);
      const front = viewer.x * x + viewer.z * z, lateral = cross(viewer, x, z);
      const toSun = sun.x * x + sun.z * z, acrossSun = Math.abs(cross(sun, x, z));
      let cost = 0.3 * Math.abs(r - 5) - 0.8 * front / r;
      if (front < 0) cost += 50;
      if (Math.abs(lateral) < 3.2) cost += (3.2 - Math.abs(lateral)) * 10;
      if (Math.abs(lateral) > 6.5) cost += (Math.abs(lateral) - 6.5) * 2;
      if (toSun > 0 && acrossSun < 2.8) cost += (2.8 - acrossSun) * 10;
      if (toSun < 0 && acrossSun < 7) cost += (7 - acrossSun) * 4;
      if (Math.sign(lateral) !== earthSide) cost += 2;
      if (cost < best) { best = cost; out.set(x, 0, z); }
    }
  }
  return out;
}

interface Joint { node: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }

/**
 * The standing astronaut. `root` has its origin between the feet and its +Z toward the front; the rest is posed from
 * the named pivots of the model (hips, chest, torso, helmet, arm_r, arm_l, leg_r, leg_l). Slow loops only: breathing and
 * a shift of weight always; with motion allowed, the helmet turning toward the Earth, a wave toward the viewer
 * ('wave') or an arm pointing at the Earth ('point', driven by `setPoint`).
 */
export class Astronaut {
  readonly root = new THREE.Group();
  private t = 0;
  private yaw = 0;
  private facing = false;
  private mode: AstronautMode = 'wave';
  private point = 0;
  private pointing = false;
  private pointSide: -1 | 1 = 1;
  private readonly still: boolean;
  private readonly joints: Record<'hips' | 'chest' | 'torso' | 'helmet' | 'arm_r' | 'arm_l' | 'leg_r' | 'leg_l', Joint | null>;

  constructor(private readonly model: THREE.Group) {
    this.root.add(model);
    const joint = (name: string): Joint | null => {
      const node = model.getObjectByName(name);
      return node ? { node, pos: node.position.clone(), quat: node.quaternion.clone(), scale: node.scale.clone() } : null;
    };
    this.joints = { hips: joint('hips'), chest: joint('chest'), torso: joint('torso'), helmet: joint('helmet'), arm_r: joint('arm_r'), arm_l: joint('arm_l'), leg_r: joint('leg_r'), leg_l: joint('leg_l') };
    this.still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setMode(mode: AstronautMode) { this.mode = mode; }
  setPoint(amount: number) { this.point = clamp01(amount); }

  /** Stands at `at` (feet position in the parent frame) turned toward `viewer`. */
  place(at: THREE.Vector3, viewer: THREE.Vector3) {
    this.root.position.copy(at);
    this.yaw = Math.atan2(viewer.x - at.x, viewer.z - at.z);
    this.root.rotation.y = this.yaw;
    this.facing = true;
  }

  update(dt: number, viewer: THREE.Vector3, earth: THREE.Vector3) {
    this.t += dt;
    const t = this.t, j = this.joints;
    const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / BREATH_PERIOD);
    if (j.chest) j.chest.node.position.copy(j.chest.pos).y += 0.0016 * breath;
    if (j.torso) j.torso.node.scale.set(j.torso.scale.x * (1 + 0.006 * breath), j.torso.scale.y * (1 + 0.004 * breath), j.torso.scale.z * (1 + 0.007 * breath));
    if (this.still) return;

    const at = this.root.position;
    const toViewer = Math.atan2(viewer.x - at.x, viewer.z - at.z);
    const toEarth = Math.atan2(earth.x - at.x, earth.z - at.z);
    const elevation = Math.atan2(earth.y - at.y, Math.hypot(earth.x - at.x, earth.z - at.z));
    const point = this.mode === 'point' ? smooth(0, 1, this.point) : 0;
    const wave = this.mode === 'wave' ? window01(t % WAVE_PERIOD, 8, 6.5, 1) : 0;

    const turn = toViewer + THREE.MathUtils.clamp(wrap(toEarth - toViewer), -TURN_LIMIT, TURN_LIMIT) * point;
    if (!this.facing) { this.yaw = toViewer; this.facing = true; }
    else this.yaw += wrap(turn - this.yaw) * damp(TURN_DAMP, dt);
    this.root.rotation.y = this.yaw;
    const earthLocal = wrap(toEarth - this.yaw);

    const sway = Math.sin(2 * Math.PI * t / SWAY_PERIOD);
    const shift = SWAY_X * sway;
    if (j.hips) {
      j.hips.node.position.copy(j.hips.pos).x += shift;
      j.hips.node.quaternion.copy(j.hips.quat).multiply(_b.setFromAxisAngle(AXIS_Z, -0.022 * sway));
    }
    if (j.chest) j.chest.node.quaternion.copy(j.chest.quat).multiply(_b.setFromAxisAngle(AXIS_Z, 0.012 * sway));
    for (const leg of [j.leg_r, j.leg_l]) {
      if (!leg) continue;
      leg.node.position.copy(leg.pos).x += shift;
      leg.node.quaternion.copy(leg.quat).multiply(_b.setFromAxisAngle(AXIS_Z, -shift / HIP_HEIGHT));
    }

    if (j.helmet) {
      const gaze = (1 - wave) * Math.max(window01(t % GAZE_PERIOD, 3, 11, 3.5), point);
      const yawTo = THREE.MathUtils.clamp(earthLocal, -NECK_YAW, NECK_YAW) * gaze;
      const pitchTo = THREE.MathUtils.clamp(elevation, -NECK_PITCH, NECK_PITCH) * gaze;
      j.helmet.node.quaternion.copy(j.helmet.quat).multiply(_c.setFromAxisAngle(AXIS_Y, yawTo)).multiply(_d.setFromAxisAngle(AXIS_X, -pitchTo));
    }

    if (point > 0.001 && !this.pointing) { this.pointing = true; this.pointSide = earthLocal < 0 ? -1 : 1; }
    else if (point <= 0.001) this.pointing = false;
    const drift = 0.02 * Math.sin(2 * Math.PI * t / 7);
    for (const side of [-1, 1] as const) {
      const arm = side < 0 ? j.arm_r : j.arm_l;
      if (!arm) continue;
      const rest = armPose(side, -ARM_DROP + drift * side, ARM_FORWARD, _c);
      let amount = 0;
      if (side === this.pointSide && point > 0) {
        const cosEl = Math.cos(elevation);
        _a.set(Math.sin(earthLocal) * cosEl, Math.sin(elevation), Math.cos(earthLocal) * cosEl);
        _d.setFromUnitVectors(ARM_AXIS[side], _a);
        amount = point;
      } else if (side < 0 && wave > 0) {
        const sweep = THREE.MathUtils.degToRad(25) + THREE.MathUtils.degToRad(34) * Math.sin(2 * Math.PI * 1.15 * t);
        armPose(side, THREE.MathUtils.degToRad(68), sweep, _d);
        amount = wave;
      }
      arm.node.quaternion.copy(arm.quat).multiply(amount > 0 ? rest.slerp(_d, amount) : rest);
    }
  }

  dispose() {
    this.root.removeFromParent();
    disposeObject(this.model);
  }
}

/** Orientation of an arm that points `elevation` above the horizontal and `forward` toward the front, on the side (-1 right, +1 left). */
function armPose(side: -1 | 1, elevation: number, forward: number, out: THREE.Quaternion) {
  _a.set(side * Math.cos(elevation) * Math.cos(forward), Math.sin(elevation), Math.cos(elevation) * Math.sin(forward));
  return out.setFromUnitVectors(ARM_AXIS[side], _a);
}

/** 0 -> 1 -> 0 window: rises over `ramp` seconds from `from`, holds for `hold` and falls over `ramp`. */
function window01(x: number, from: number, hold: number, ramp: number) {
  return smooth(from, from + ramp, x) * (1 - smooth(from + ramp + hold, from + 2 * ramp + hold, x));
}
