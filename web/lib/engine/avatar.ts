import * as THREE from 'three';
import type { LunarApp } from './app';
import { buildForearm, buildGlove, buildTorso, buildUpperArm, GLOVE_FROM_GRIP, stretchForearm, WRIST_BACK } from './avatar-geometry';
import { createSuitMaterials } from './avatar-material';
import { damp } from './util';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Adult-proportioned, slightly bulked up for a spacesuit silhouette (meters).
const UPPER_LEN = 0.3;
const FORE_LEN = 0.27;

const SHOULDER_X = 0.19;      // half shoulder width, below the eyes
const SHOULDER_DROP = 0.2;
const SHOULDER_FWD = 0.02;
const TORSO_DROP = 0.42;      // chest center, below the eyes

// Body-facing damping: hands/arms always track the real controller pose instantly (any lag
// there would feel disconnected from your real hand), but the torso's yaw catches up to where
// the head is pointing rather than snapping - otherwise a quick head turn spins the whole body.
const TORSO_YAW_DAMP = 7;

interface Arm {
  side: 1 | -1; // -1 = left, +1 = right
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  glove: THREE.Mesh;
  foreBase: Float32Array;
  foreExtra: number;
}

/**
 * Puts a mesh that runs along +Y from its origin at `a`, pointing at `b`. It turns from the way it
 * pointed last frame by the shortest rotation, so the weave does not swirl when an arm hangs straight down.
 * Returns the distance from `a` to `b`.
 */
function aimSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = _d.subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a);
  if (len > 1e-5) {
    const was = _was.copy(Y_AXIS).applyQuaternion(mesh.quaternion);
    mesh.quaternion.premultiply(_turn.setFromUnitVectors(was, d.multiplyScalar(1 / len))).normalize();
  }
  return len;
}
const _d = new THREE.Vector3();
const _was = new THREE.Vector3();
const _turn = new THREE.Quaternion();

/**
 * Two-bone IK: elbow position given a shoulder, a hand target and the two bone lengths, biased
 * toward `poleHint` to pick which way the elbow bends (there's a one-parameter family of valid
 * elbow positions otherwise - a circle around the shoulder-target axis). Standard "triangle"
 * solve; `d` is clamped to the reachable range so an out-of-reach target just fully extends the
 * arm toward it instead of producing NaNs.
 */
export function solveElbow(out: THREE.Vector3, shoulder: THREE.Vector3, target: THREE.Vector3, poleHint: THREE.Vector3) {
  const toTarget = _toTarget.subVectors(target, shoulder);
  const rawLen = toTarget.length();
  const minD = Math.abs(UPPER_LEN - FORE_LEN) + 1e-4;
  const maxD = UPPER_LEN + FORE_LEN - 1e-5;
  const d = THREE.MathUtils.clamp(rawLen, minD, maxD);
  const axis = rawLen > 1e-5 ? toTarget.multiplyScalar(1 / rawLen) : _fallbackAxis.set(0, -1, 0);
  const a = (UPPER_LEN * UPPER_LEN - FORE_LEN * FORE_LEN + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER_LEN * UPPER_LEN - a * a));
  const perp = _perp.subVectors(poleHint, _axisProj.copy(axis).multiplyScalar(poleHint.dot(axis)));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  return out.copy(shoulder).addScaledVector(axis, a).addScaledVector(perp, h);
}
const _toTarget = new THREE.Vector3();
const _fallbackAxis = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _axisProj = new THREE.Vector3();

/** Head forward projected onto the horizontal plane (pitching the head must not tip the torso). */
export function headFacing(out: THREE.Vector3, headQuat: THREE.Quaternion) {
  out.set(0, 0, -1).applyQuaternion(headQuat);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1); else out.normalize();
  return out;
}

/** Yaw of the torso around +Y for a given facing direction. */
export function facingYaw(fwd: THREE.Vector3) {
  return Math.atan2(-fwd.x, -fwd.z);
}

export function shoulderPosition(out: THREE.Vector3, side: 1 | -1, head: THREE.Vector3, yaw: number) {
  return out.set(side * SHOULDER_X, -SHOULDER_DROP, SHOULDER_FWD)
    .applyQuaternion(_yawTmp.setFromAxisAngle(Y_AXIS, yaw))
    .add(head);
}

export const CHEST_PLATE_LOCAL = new THREE.Vector3(0, 0.04, -0.175);

/** World-space center of the chest plate that sits on the front of the torso. */
export function chestFrontPosition(out: THREE.Vector3, head: THREE.Vector3, yaw: number) {
  return out.set(0, -TORSO_DROP, 0).add(CHEST_PLATE_LOCAL)
    .applyQuaternion(_yawTmp.setFromAxisAngle(Y_AXIS, yaw))
    .add(head);
}

/** Elbow for one arm. The hint is a direction (not a point): down, slightly forward and outward for that side. */
export function armElbow(out: THREE.Vector3, side: 1 | -1, shoulder: THREE.Vector3, target: THREE.Vector3, fwd: THREE.Vector3) {
  const pole = _armPole.set(-fwd.z * side * 0.25, -1, fwd.x * side * 0.25).addScaledVector(fwd, 0.15);
  return solveElbow(out, shoulder, target, pole);
}
const _yawTmp = new THREE.Quaternion();
const _armPole = new THREE.Vector3();

/**
 * Head of this frame. `app.camera` only catches up with the headset when the renderer draws, one
 * frame late (and still at the desktop pose on the first frame of a session); the XR camera is
 * refreshed before the loop runs.
 */
function headPose(app: LunarApp): THREE.Object3D {
  const xr = app.renderer?.xr?.getCamera?.();
  return xr && xr.cameras.length > 0 ? xr : app.camera;
}

/**
 * Arm side for each controller (undefined: no arm). A controller keeps the side it reports; one
 * that reports none takes the side its slot suggests, or the free one.
 */
function armSides(handedness: (string | undefined)[], active: boolean[]) {
  const sides: (1 | -1 | undefined)[] = handedness.map(() => undefined);
  const taken = new Set<1 | -1>();
  handedness.forEach((h, i) => {
    const side = h === 'right' ? 1 : h === 'left' ? -1 : undefined;
    if (active[i] && side && !taken.has(side)) { sides[i] = side; taken.add(side); }
  });
  handedness.forEach((_, i) => {
    if (!active[i] || sides[i]) return;
    const options: (1 | -1)[] = i === 0 ? [-1, 1] : [1, -1];
    const side = options.find((s) => !taken.has(s));
    if (side) { sides[i] = side; taken.add(side); }
  });
  return sides;
}

/**
 * First-person astronaut body: a torso that follows head position/yaw (not pitch, so looking
 * down doesn't bend your spine) and two arms solved with simple IK from the shoulders to the
 * wrists behind the real controller grips, each ending in a pressurized glove that takes the
 * controller's pose, so reaching for a panel actually looks like it.
 * No legs - with no leg tracking on a 3-point rig (head + 2 controllers) there's nothing to
 * drive them with, so like most VR apps this stops at a floating torso.
 */
export class Avatar {
  readonly group = new THREE.Group();
  private torso: THREE.Mesh;
  private torsoYaw = 0;
  private placed = false;
  private arms: Arm[];
  private suit = createSuitMaterials();

  constructor(private app: LunarApp) {
    const { cloth, metal } = this.suit;
    this.torso = new THREE.Mesh(buildTorso(CHEST_PLATE_LOCAL), cloth);
    this.group.add(this.torso);

    const upperGeo = buildUpperArm(UPPER_LEN);
    this.arms = ([-1, 1] as const).map((side) => {
      const foreGeo = buildForearm(FORE_LEN);
      const upper = new THREE.Mesh(upperGeo, cloth);
      const fore = new THREE.Mesh(foreGeo, [cloth, metal]);
      const glove = new THREE.Mesh(buildGlove(side), cloth);
      this.group.add(upper, fore, glove);
      return { side, upper, fore, glove, foreBase: foreGeo.attributes.position.array.slice() as Float32Array, foreExtra: 0 };
    });
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
  }

  update(dt: number) {
    const app = this.app;
    this.group.visible = app.isXR;
    if (!app.isXR) { this.placed = false; return; }

    const cam = headPose(app);
    // Body-facing: head forward projected onto the horizontal plane, so pitching your head
    // down to look at your hands doesn't tip the torso forward with it.
    const fwd = headFacing(_fwd, cam.quaternion);
    const targetYaw = facingYaw(fwd);
    if (this.placed) {
      const diff = Math.atan2(Math.sin(targetYaw - this.torsoYaw), Math.cos(targetYaw - this.torsoYaw));
      this.torsoYaw += diff * damp(TORSO_YAW_DAMP, dt);
    } else {
      this.torsoYaw = targetYaw;
      this.placed = true;
    }
    const yawQuat = _yawQuat.setFromAxisAngle(Y_AXIS, this.torsoYaw);

    this.torso.position.set(cam.position.x, cam.position.y - TORSO_DROP, cam.position.z);
    this.torso.quaternion.copy(yawQuat);

    const controllers = app.input.controllers;
    const sides = armSides(
      controllers.map((c) => c.userData.handedness as string | undefined),
      controllers.map((c, i) => !!c.userData.connected && app.input.grips[i].visible),
    );
    for (const arm of this.arms) arm.upper.visible = arm.fore.visible = arm.glove.visible = sides.includes(arm.side);
    controllers.forEach((_, i) => {
      const side = sides[i];
      if (!side) return;
      const arm = this.arms.find((a) => a.side === side)!;
      const grip = app.input.grips[i];
      const shoulder = shoulderPosition(_shoulder, side, cam.position, this.torsoYaw);
      arm.glove.position.copy(grip.position);
      arm.glove.quaternion.copy(grip.quaternion).multiply(GLOVE_FROM_GRIP);
      const wrist = _wrist.set(0, 0, WRIST_BACK).applyQuaternion(arm.glove.quaternion).add(grip.position);

      armElbow(_elbow, side, shoulder, wrist, fwd);
      aimSegment(arm.upper, shoulder, _elbow);
      const extra = THREE.MathUtils.clamp(aimSegment(arm.fore, _elbow, wrist) - FORE_LEN, -0.05, 0.4);
      if (Math.abs(extra - arm.foreExtra) > 5e-4) {
        arm.foreExtra = extra;
        stretchForearm(arm.fore.geometry, arm.foreBase, extra);
      }
    });
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    this.suit.dispose();
  }
}
const _fwd = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _shoulder = new THREE.Vector3();
const _wrist = new THREE.Vector3();
const _elbow = new THREE.Vector3();
