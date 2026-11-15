import * as THREE from 'three';
import type { LunarApp } from './app';
import { UI } from './panel';
import { damp } from './util';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Adult-proportioned, slightly bulked up for a spacesuit silhouette (meters).
const UPPER_LEN = 0.3;
const FORE_LEN = 0.27;
const UPPER_RADIUS = 0.055;
const FORE_RADIUS = 0.048;
const SHOULDER_JOINT_R = 0.085;
const ELBOW_JOINT_R = 0.062;
const WRIST_JOINT_R = 0.05;

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
  shoulderJoint: THREE.Mesh;
  upper: THREE.Mesh;
  elbowJoint: THREE.Mesh;
  fore: THREE.Mesh;
  wristJoint: THREE.Mesh;
}

/** Aligns a unit-height cylinder's local Y axis to run from `a` to `b`, scaling it to that length. */
function aimSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = _d.subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(Y_AXIS, d.multiplyScalar(1 / len));
  mesh.scale.set(1, len, 1);
}
const _d = new THREE.Vector3();

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
 * First-person astronaut body. The hands already render via XRControllerModelFactory
 * (input.ts) - this adds what was missing: a torso that follows head position/yaw (not pitch,
 * so looking down doesn't bend your spine) and two arms solved with simple IK from the
 * shoulders to the real controller grips, so reaching for a panel actually looks like it.
 * No legs - with no leg tracking on a 3-point rig (head + 2 controllers) there's nothing to
 * drive them with, so like most VR apps this stops at a floating torso.
 */
export class Avatar {
  readonly group = new THREE.Group();
  private torso: THREE.Mesh;
  private torsoYaw = 0;
  private arms: Arm[];

  constructor(private app: LunarApp) {
    const suit = new THREE.MeshStandardMaterial({ color: 0xece8dd, roughness: 0.6, metalness: 0.08 });
    const trim = new THREE.MeshStandardMaterial({ color: UI.accent, roughness: 0.4, metalness: 0.4 });

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 12), suit);
    this.group.add(this.torso);
    const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), trim);
    chestPanel.position.set(0, 0.04, -0.175);
    this.torso.add(chestPanel);

    const cylGeo = (r: number) => new THREE.CylinderGeometry(r, r, 1, 10);
    this.arms = ([-1, 1] as const).map((side) => {
      const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(SHOULDER_JOINT_R, 12, 10), trim);
      const upper = new THREE.Mesh(cylGeo(UPPER_RADIUS), suit);
      const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(ELBOW_JOINT_R, 10, 8), trim);
      const fore = new THREE.Mesh(cylGeo(FORE_RADIUS), suit);
      const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(WRIST_JOINT_R, 10, 8), trim);
      this.group.add(shoulderJoint, upper, elbowJoint, fore, wristJoint);
      return { side, shoulderJoint, upper, elbowJoint, fore, wristJoint };
    });
  }

  update(dt: number) {
    const app = this.app;
    this.group.visible = app.isXR;
    if (!app.isXR) return;

    const cam = app.camera;
    // Body-facing: head forward projected onto the horizontal plane, so pitching your head
    // down to look at your hands doesn't tip the torso forward with it.
    const fwd = headFacing(_fwd, cam.quaternion);
    const targetYaw = facingYaw(fwd);
    const diff = Math.atan2(Math.sin(targetYaw - this.torsoYaw), Math.cos(targetYaw - this.torsoYaw));
    this.torsoYaw += diff * damp(TORSO_YAW_DAMP, dt);
    const yawQuat = _yawQuat.setFromAxisAngle(Y_AXIS, this.torsoYaw);

    this.torso.position.set(cam.position.x, cam.position.y - TORSO_DROP, cam.position.z);
    this.torso.quaternion.copy(yawQuat);

    app.input.controllers.forEach((controller, i) => {
      const handedness = controller.userData.handedness as 'left' | 'right' | undefined;
      const side: 1 | -1 = handedness === 'right' ? 1 : handedness === 'left' ? -1 : (i === 0 ? -1 : 1);
      const arm = this.arms.find((a) => a.side === side)!;
      const connected = !!controller.userData.connected;
      arm.shoulderJoint.visible = arm.upper.visible = arm.elbowJoint.visible = arm.fore.visible = arm.wristJoint.visible = connected;
      if (!connected) return;

      const grip = app.input.grips[i];
      const shoulder = shoulderPosition(_shoulder, side, cam.position, this.torsoYaw);
      const target = _target.copy(grip.position);

      arm.shoulderJoint.position.copy(shoulder);
      armElbow(_elbow, side, shoulder, target, fwd);
      aimSegment(arm.upper, shoulder, _elbow);
      arm.elbowJoint.position.copy(_elbow);
      aimSegment(arm.fore, _elbow, target);
      arm.wristJoint.position.copy(target);
    });
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
    });
  }
}
const _fwd = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _shoulder = new THREE.Vector3();
const _target = new THREE.Vector3();
const _elbow = new THREE.Vector3();
