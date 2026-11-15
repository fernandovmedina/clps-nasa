import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { LunarApp } from './app';
import { Avatar, armElbow, chestFrontPosition, facingYaw, headFacing, shoulderPosition } from './avatar';
import { Input } from './input';

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

  it('places the torso where the head faces on the first frame of a session', () => {
    const t = makeApp();
    t.camera.quaternion.copy(facingX);
    const avatar = new Avatar(t.app);
    avatar.update(1 / 72);
    expect(torsoFront(avatar).dot(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.999);
  });

  it('places it again on the first frame of the next session', () => {
    const t = makeApp();
    t.camera.quaternion.copy(facingX);
    const avatar = new Avatar(t.app);
    avatar.update(1 / 72);
    t.raw.isXR = false;
    avatar.update(1 / 72);
    t.camera.quaternion.copy(headQuat(Math.PI / 2));
    t.raw.isXR = true;
    avatar.update(1 / 72);
    expect(torsoFront(avatar).dot(new THREE.Vector3(-1, 0, 0))).toBeGreaterThan(0.999);
  });

  it('takes the head of this frame from the XR camera, since the app camera is only updated when drawing', () => {
    const t = makeApp();
    const xrCamera = new THREE.ArrayCamera([new THREE.PerspectiveCamera()]);
    xrCamera.position.set(1, 1.7, 0);
    xrCamera.quaternion.copy(facingX);
    (t.raw as unknown as { renderer: unknown }).renderer = { xr: { getCamera: () => xrCamera } };
    const avatar = new Avatar(t.app);
    avatar.update(1 / 72);
    expect(torsoFront(avatar).dot(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.999);
    expect(torsoOf(avatar).position.x).toBeCloseTo(1, 5);
  });

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

  it.each([
    [0, 'right', 1],
    [1, 'right', 1],
    [0, 'left', -1],
    [1, 'left', -1],
  ] as const)('keeps the arm of a lone connected controller (slot %i, %s)', (slot, handedness, side) => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(slot, handedness);
    avatar.update(1 / 72);
    expect(armShown(avatar, side)).toBe(true);
    expect(armShown(avatar, -side as 1 | -1)).toBe(false);
  });

  it('shows one arm for a lone controller without handedness and hides it once it disconnects', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(1, undefined);
    avatar.update(1 / 72);
    expect(armShown(avatar, 1)).toBe(true);
    expect(armShown(avatar, -1)).toBe(false);
    t.controllers[1].userData.connected = false;
    avatar.update(1 / 72);
    expect(armShown(avatar, 1)).toBe(false);
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

const meshesOf = (a: Avatar) => {
  const out: THREE.Mesh[] = [];
  a.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};
const trianglesOf = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const drawCallsOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.geometry.groups.length : 1);

function bothArmsUp() {
  const t = makeApp();
  const avatar = new Avatar(t.app);
  t.connect(0, 'left');
  t.connect(1, 'right');
  avatar.update(1 / 72);
  return { t, avatar };
}

describe('Avatar suit', () => {
  it('stays within 6000 triangles and 10 draw calls, so 20 even with a shadow pass', () => {
    const { avatar } = bothArmsUp();
    const meshes = meshesOf(avatar).filter((m) => m.visible);
    expect(meshes.reduce((n, m) => n + trianglesOf(m), 0)).toBeLessThanOrEqual(6000);
    expect(meshes.reduce((n, m) => n + drawCallsOf(m), 0) * 2).toBeLessThanOrEqual(20);
  });

  it('shares its materials and casts and receives shadows', () => {
    const { avatar } = bothArmsUp();
    const materials = new Set<THREE.Material>();
    meshesOf(avatar).forEach((m) => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
      expect(m.castShadow && m.receiveShadow).toBe(true);
    });
    expect(materials.size).toBe(2);
    expect([...materials].every((m) => m instanceof THREE.MeshStandardMaterial)).toBe(true);
    const [cloth, metal] = [...materials] as THREE.MeshStandardMaterial[];
    expect(cloth.metalness).toBe(0);
    expect(cloth.roughness).toBeGreaterThanOrEqual(0.85);
    expect(metal.metalness).toBeGreaterThanOrEqual(0.7);
  });

  it('builds closed, outward-facing, finite geometry', () => {
    const { avatar } = bothArmsUp();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), vn = new THREE.Vector3();
    for (const m of meshesOf(avatar)) {
      const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, idx = g.index!;
      for (const attr of Object.values(g.attributes)) expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
      expect(g.attributes.uv && g.attributes.color).toBeTruthy();
      let inward = 0, total = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const [ia, ib, ic] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
        a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
        face.crossVectors(b.clone().sub(a), c.clone().sub(a));
        vn.fromBufferAttribute(n, ia).add(new THREE.Vector3().fromBufferAttribute(n, ib)).add(new THREE.Vector3().fromBufferAttribute(n, ic));
        total++;
        if (face.dot(vn) < 0) inward++;
      }
      expect(inward / total).toBeLessThan(0.01);
    }
  });

  it('mirrors the left glove from the right one', () => {
    const { avatar } = bothArmsUp();
    const gloves = (avatar as unknown as { arms: { side: number; glove: THREE.Mesh }[] }).arms;
    const box = (side: number) => new THREE.Box3().setFromBufferAttribute(gloves.find((x) => x.side === side)!.glove.geometry.attributes.position as THREE.BufferAttribute);
    const right = box(1), left = box(-1);
    expect(left.min.x).toBeCloseTo(-right.max.x, 5);
    expect(left.max.x).toBeCloseTo(-right.min.x, 5);
    expect(left.min.y).toBeCloseTo(right.min.y, 5);
  });

  it('puts the glove on the controller and the wrist ring on the glove, even when the hand is out of reach', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(1, 'right', new THREE.Vector3(0.25, 1.4, -0.75));
    t.grips[1].quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0.3, 0));
    avatar.update(1 / 72);
    const arm = (avatar as unknown as { arms: { side: number; fore: THREE.Mesh; glove: THREE.Mesh }[] }).arms.find((x) => x.side === 1)!;
    expect(arm.glove.position.distanceTo(t.grips[1].position)).toBeLessThan(1e-6);

    const wrist = new THREE.Vector3(0, 0, 0.075).applyQuaternion(arm.glove.quaternion).add(arm.glove.position);
    const box = new THREE.Box3().setFromBufferAttribute(arm.fore.geometry.attributes.position as THREE.BufferAttribute);
    const end = new THREE.Vector3(0, box.max.y, 0).applyQuaternion(arm.fore.quaternion).add(arm.fore.position);
    expect(end.distanceTo(wrist)).toBeLessThan(1e-3);
    expect(box.max.y).toBeGreaterThan(FORE + 0.03);
  });

  it('keeps the hand at rest the length it was built', () => {
    const t = makeApp();
    const avatar = new Avatar(t.app);
    t.connect(1, 'right', new THREE.Vector3(0.2, 1.2, -0.3));
    avatar.update(1 / 72);
    const arm = (avatar as unknown as { arms: { side: number; fore: THREE.Mesh }[] }).arms.find((x) => x.side === 1)!;
    const box = new THREE.Box3().setFromBufferAttribute(arm.fore.geometry.attributes.position as THREE.BufferAttribute);
    expect(box.max.y).toBeCloseTo(FORE, 3);
  });
});

describe('Controller models', () => {
  it('stay hidden, since the glove is held in their place', () => {
    const grips = [new THREE.Group(), new THREE.Group()];
    const app = {
      camera: new THREE.PerspectiveCamera(),
      rig: new THREE.Group(),
      renderer: { domElement: document.createElement('canvas'), xr: { getController: () => new THREE.Group(), getControllerGrip: (i: number) => grips[i] } },
    } as unknown as LunarApp;
    new Input(app);
    for (const grip of grips) {
      expect(grip.children).toHaveLength(1);
      expect(grip.children[0].visible).toBe(false);
    }
  });
});

describe('Avatar textures', () => {
  afterEach(() => vi.restoreAllMocks());

  const loadWith = (behaviour: 'load' | 'fail' | 'never') => {
    const made: THREE.Texture[] = [];
    const pending: ((t: THREE.Texture) => void)[] = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((_url: string, onLoad?: (t: THREE.Texture) => void, _p?: unknown, onError?: (e: unknown) => void) => {
      const tex = new THREE.Texture();
      made.push(tex);
      if (behaviour === 'load') onLoad?.(tex);
      else if (behaviour === 'fail') onError?.(new Error('missing'));
      else if (onLoad) pending.push(onLoad);
      return tex;
    }) as never);
    return { made, pending };
  };
  const clothOf = (a: Avatar) => (meshesOf(a)[0].material as THREE.MeshStandardMaterial);

  it('wraps the fabric and its normal map, with color only on the color map', () => {
    loadWith('load');
    const avatar = new Avatar(makeApp().app);
    const cloth = clothOf(avatar);
    expect(cloth.map && cloth.normalMap).toBeTruthy();
    for (const tex of [cloth.map!, cloth.normalMap!]) {
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
    }
    expect(cloth.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(cloth.normalMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
    expect(cloth.normalScale.x).toBeLessThanOrEqual(0.6);
  });

  it('falls back to plain color when the images do not load', () => {
    loadWith('fail');
    const avatar = new Avatar(makeApp().app);
    const cloth = clothOf(avatar);
    expect(cloth.map).toBeNull();
    expect(cloth.normalMap).toBeNull();
    expect(cloth.vertexColors).toBe(true);
    expect(cloth.color.getHex()).toBe(0xffffff);
  });

  it('releases the textures, and one that arrives after dispose', () => {
    const { made, pending } = loadWith('never');
    const avatar = new Avatar(makeApp().app);
    const spies = made.map((tex) => vi.spyOn(tex, 'dispose'));
    avatar.dispose();
    pending.forEach((onLoad, i) => onLoad(made[i]));
    expect(clothOf(avatar).map).toBeNull();
    spies.forEach((spy) => expect(spy).toHaveBeenCalled());
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
