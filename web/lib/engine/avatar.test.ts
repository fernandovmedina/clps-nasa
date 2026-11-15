import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { LunarApp } from './app';
import { Avatar, armElbow, chestFrontPosition, facingYaw, headFacing, shoulderPosition } from './avatar';

const UP = new THREE.Vector3(0, 1, 0);
const UPPER = 0.3;
const FORE = 0.27;

const headQuat = (yaw: number, pitch = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

// yaw 0 looks down -Z; -90deg looks down +X; +90deg looks down -X
const FACINGS = [
  { name: '-Z', yaw: 0 },
  { name: '+X', yaw: -Math.PI / 2 },
  { name: '-X', yaw: Math.PI / 2 },
];

describe('body placement', () => {
  const head = new THREE.Vector3(0.3, 1.6, -0.2);

  for (const f of FACINGS) {
    for (const pitch of [0, -0.6]) {
      it(`puts each shoulder on its own side and the chest in front, facing ${f.name}, pitch ${pitch}`, () => {
        const fwd = headFacing(new THREE.Vector3(), headQuat(f.yaw, pitch));
        const yaw = facingYaw(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, UP);
        const rs = shoulderPosition(new THREE.Vector3(), 1, head, yaw).sub(head);
        const ls = shoulderPosition(new THREE.Vector3(), -1, head, yaw).sub(head);
        const chest = chestFrontPosition(new THREE.Vector3(), head, yaw).sub(head);
        expect(rs.dot(right)).toBeGreaterThan(0.15);
        expect(ls.dot(right)).toBeLessThan(-0.15);
        expect(chest.dot(fwd)).toBeGreaterThan(0.1);
        expect(rs.y).toBeLessThan(0);
      });
    }
  }

  it('facing -Z with an identity quaternion: right shoulder at x > 0, chest plate at z < 0', () => {
    const yaw = facingYaw(headFacing(new THREE.Vector3(), new THREE.Quaternion()));
    const origin = new THREE.Vector3();
    expect(shoulderPosition(new THREE.Vector3(), 1, origin, yaw).x).toBeGreaterThan(0);
    expect(shoulderPosition(new THREE.Vector3(), -1, origin, yaw).x).toBeLessThan(0);
    expect(chestFrontPosition(new THREE.Vector3(), origin, yaw).z).toBeLessThan(0);
  });
});

describe('elbow', () => {
  const lineOffset = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
    const axis = b.clone().sub(a).normalize();
    const v = p.clone().sub(a);
    return v.sub(axis.multiplyScalar(v.dot(axis)));
  };
  const fwd = new THREE.Vector3(0, 0, -1);

  for (const side of [1, -1] as const) {
    it(`bends down and outward with the hand ahead and below the shoulder (side ${side})`, () => {
      const shoulder = new THREE.Vector3(0.19 * side, 1.4, 0);
      const hand = shoulder.clone().add(new THREE.Vector3(0, -0.15, -0.4));
      const elbow = armElbow(new THREE.Vector3(), side, shoulder, hand, fwd);
      const off = lineOffset(elbow, shoulder, hand);
      expect(off.y).toBeLessThan(-0.1);
      expect(off.x * side).toBeGreaterThan(0);
      expect(elbow.distanceTo(shoulder)).toBeCloseTo(UPPER, 3);
      expect(elbow.distanceTo(hand)).toBeCloseTo(FORE, 3);
    });
  }

  it('keeps the elbow below the line for hands raised above the shoulder and to the side', () => {
    const shoulder = new THREE.Vector3(0.19, 1.4, 0);
    for (const delta of [new THREE.Vector3(0.1, 0.25, -0.35), new THREE.Vector3(0.3, 0, -0.1), new THREE.Vector3(-0.2, -0.1, -0.3)]) {
      const hand = shoulder.clone().add(delta);
      const elbow = armElbow(new THREE.Vector3(), 1, shoulder, hand, fwd);
      expect(lineOffset(elbow, shoulder, hand).y).toBeLessThan(0);
      expect(elbow.y).toBeLessThan(shoulder.y);
    }
  });

  it('fully extends toward an out-of-reach hand without NaN', () => {
    const shoulder = new THREE.Vector3(0.19, 1.4, 0);
    const hand = shoulder.clone().add(new THREE.Vector3(0, 0, -1.2));
    const elbow = armElbow(new THREE.Vector3(), 1, shoulder, hand, fwd);
    expect(Number.isFinite(elbow.x + elbow.y + elbow.z)).toBe(true);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(UPPER, 3);
    expect(lineOffset(elbow, shoulder, hand).length()).toBeLessThan(0.005);
  });

  it('survives a hand on the shoulder and a hand straight below it', () => {
    const shoulder = new THREE.Vector3(0.19, 1.4, 0);
    for (const hand of [shoulder.clone(), shoulder.clone().add(new THREE.Vector3(0, -0.5, 0)), shoulder.clone().add(new THREE.Vector3(0, 0.5, 0))]) {
      const elbow = armElbow(new THREE.Vector3(), 1, shoulder, hand, fwd);
      expect(Number.isFinite(elbow.x + elbow.y + elbow.z)).toBe(true);
    }
  });
});

function makeApp() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  const controllers = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const raw = { isXR: true, camera, input: { controllers, grips } };
  const connect = (i: number, handedness: string | undefined, at = new THREE.Vector3(i ? 0.25 : -0.25, 1.3, -0.35)) => {
    controllers[i].userData.connected = true;
    controllers[i].userData.handedness = handedness;
    grips[i].position.copy(at);
    grips[i].visible = true;
  };
  return { app: raw as unknown as LunarApp, raw, camera, controllers, grips, connect };
}

const torsoOf = (a: Avatar) => a.group.children[0];
const torsoFront = (a: Avatar) => new THREE.Vector3(0, 0, -1).applyQuaternion(torsoOf(a).quaternion);
const armShown = (a: Avatar, side: 1 | -1) => {
  const arm = (a as unknown as { arms: Record<string, unknown>[] }).arms.find((x) => x.side === side)!;
  const parts = Object.values(arm).filter((v): v is THREE.Object3D => v instanceof THREE.Object3D);
  return parts.length > 0 && parts.every((o) => o.visible);
};

describe('Avatar.update', () => {
  const facingX = headQuat(-Math.PI / 2);

  it('still damps the torso once it is placed', () => {
    const t = makeApp();
    t.camera.quaternion.copy(facingX);
    const avatar = new Avatar(t.app);
    avatar.update(1 / 72);
    t.camera.quaternion.copy(headQuat(Math.PI / 2));
    avatar.update(1 / 72);
    const d = torsoFront(avatar).dot(new THREE.Vector3(-1, 0, 0));
    expect(d).toBeLessThan(0.5);
  });

  it('gives each connected controller its own arm when only one reports a handedness', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(0, 'right', new THREE.Vector3(0.25, 1.3, -0.35));
    t.connect(1, undefined, new THREE.Vector3(-0.25, 1.3, -0.35));
    avatar.update(1 / 72);
    expect(armShown(avatar, 1)).toBe(true);
    expect(armShown(avatar, -1)).toBe(true);
  });

  it('falls back to controller order when no handedness is reported', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(0, 'none');
    t.connect(1, undefined);
    avatar.update(1 / 72);
    expect(armShown(avatar, 1)).toBe(true);
    expect(armShown(avatar, -1)).toBe(true);
  });

  it('hides the arm of a tracked input that has no grip pose (hand tracking)', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(0, 'right');
    t.grips[0].visible = false;
    t.grips[0].position.set(0, 0, 0);
    avatar.update(1 / 72);
    expect(armShown(avatar, 1)).toBe(false);
  });

  it('hides everything outside a session', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.raw.isXR = false;
    avatar.update(1 / 72);
    expect(avatar.group.visible).toBe(false);
  });
});

describe('Avatar.dispose', () => {
  it('releases every geometry, material and texture', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    avatar.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
    });
    const textures = new Set<THREE.Texture>();
    materials.forEach((m) => Object.values(m).forEach((v) => { if (v instanceof THREE.Texture) textures.add(v); }));
    const spies = [...geometries, ...materials, ...textures].map((x) => vi.spyOn(x, 'dispose'));
    expect(spies.length).toBeGreaterThan(0);
    avatar.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalled());
  });
});
