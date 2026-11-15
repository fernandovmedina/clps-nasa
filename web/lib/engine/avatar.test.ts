import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LunarApp } from './app';
import { Avatar, armElbow, chestFrontPosition, facingYaw, headFacing, shoulderPosition } from './avatar';
import { LAYERS, TILE } from './avatar-layers';
import type { createSuitMaterials } from './avatar-material';
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
const suitOf = (a: Avatar) => (a as unknown as { suit: ReturnType<typeof createSuitMaterials> }).suit;
const armsOf = (a: Avatar) => (a as unknown as { arms: { side: number; upper: THREE.Mesh; fore: THREE.Mesh; glove: THREE.Mesh }[] }).arms;

function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const target: Record<string | symbol, unknown> = {};
  const context: unknown = new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : key === 'measureText' ? () => ({ width: 10 }) : (...args: unknown[]) => { calls.push({ name: String(key), args }); return context; }),
    set: (t, key, value) => { t[key] = value; calls.push({ name: `set ${String(key)}`, args: [value] }); return true; },
  });
  return { context: context as CanvasRenderingContext2D, calls };
}

let drawing: ReturnType<typeof recorder>;
let canvases: HTMLCanvasElement[];
beforeEach(() => {
  drawing = recorder();
  canvases = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return drawing.context;
  } as never);
});
afterEach(() => vi.restoreAllMocks());

function bothArmsUp() {
  const t = makeApp();
  const avatar = new Avatar(t.app);
  t.connect(0, 'left');
  t.connect(1, 'right');
  avatar.update(1 / 72);
  return { t, avatar };
}

interface Facet { layer: number; area: number; pu: number; pv: number; skew: number }

/** Per triangle of the group drawn with material `material`: how many meters one unit of u and of v cover, and how far its vertex normals lean from its face. */
function facets(m: THREE.Mesh, material = 0, keep: (a: THREE.Vector3) => boolean = () => true) {
  const g = m.geometry, idx = g.index!, p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal, s = g.attributes.surface;
  const ranges = g.groups.length ? g.groups.filter((x) => x.materialIndex === material) : [{ start: 0, count: idx.count }];
  const [a, b, c, e1, e2, pu, pv, face, vn] = Array.from({ length: 9 }, () => new THREE.Vector3());
  const out: Facet[] = [];
  for (const { start, count } of ranges) {
    for (let i = start; i < start + count; i += 3) {
      const [ia, ib, ic] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
      if (!keep(a) || !keep(b) || !keep(c)) continue;
      e1.subVectors(b, a); e2.subVectors(c, a);
      face.crossVectors(e1, e2);
      const area = face.length() / 2;
      if (area < 1e-8) continue;
      face.normalize();
      const d1 = [uv.getX(ib) - uv.getX(ia), uv.getY(ib) - uv.getY(ia)], d2 = [uv.getX(ic) - uv.getX(ia), uv.getY(ic) - uv.getY(ia)];
      const det = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(det) < 1e-12) continue;
      pu.copy(e1).multiplyScalar(d2[1]).addScaledVector(e2, -d1[1]).divideScalar(det);
      pv.copy(e2).multiplyScalar(d1[0]).addScaledVector(e1, -d2[0]).divideScalar(det);
      let skew = 0;
      for (const k of [ia, ib, ic]) skew = Math.max(skew, face.angleTo(vn.fromBufferAttribute(n, k)));
      out.push({ layer: s.getX(ia), area, pu: pu.length(), pv: pv.length(), skew });
    }
  }
  return out;
}
const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const share = (xs: Facet[], test: (f: Facet) => boolean) => xs.filter(test).reduce((n, f) => n + f.area, 0) / xs.reduce((n, f) => n + f.area, 0);

describe('Avatar suit', () => {
  it('stays within 9000 triangles and 12 draw calls', () => {
    const { avatar } = bothArmsUp();
    const meshes = meshesOf(avatar).filter((m) => m.visible);
    expect(meshes.reduce((n, m) => n + trianglesOf(m), 0)).toBeLessThanOrEqual(9000);
    expect(meshes.reduce((n, m) => n + drawCallsOf(m), 0)).toBeLessThanOrEqual(12);
  });

  it('shares three materials (cloth, metal, patch) and casts and receives shadows', () => {
    const { avatar } = bothArmsUp();
    const materials = new Set<THREE.Material>();
    meshesOf(avatar).forEach((m) => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
      expect(m.castShadow && m.receiveShadow).toBe(true);
    });
    expect(materials.size).toBe(3);
    expect([...materials].every((m) => m instanceof THREE.MeshStandardMaterial && !m.flatShading)).toBe(true);
    const { cloth, metal, patch } = suitOf(avatar);
    expect(new Set([cloth, metal, patch]).size).toBe(3);
    expect([cloth, metal, patch].every((m) => materials.has(m))).toBe(true);
    expect(cloth.metalness).toBe(0);
    expect(cloth.roughness).toBeGreaterThanOrEqual(0.85);
    expect(metal.metalness).toBeGreaterThanOrEqual(0.7);
    expect(patch.metalness).toBe(0);
  });

  it('builds closed, outward-facing, finite geometry', () => {
    const { avatar } = bothArmsUp();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), vn = new THREE.Vector3();
    for (const m of meshesOf(avatar)) {
      const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, idx = g.index!;
      for (const attr of Object.values(g.attributes)) expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
      expect(g.attributes.uv && g.attributes.color && g.attributes.surface).toBeTruthy();
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

  it('shades arms, shoulders, torso and fingers smoothly: normals follow the surface, with enough sides around', () => {
    const { avatar } = bothArmsUp();
    const [torso, ...rest] = meshesOf(avatar);
    const arm = armsOf(avatar).find((x) => x.side === 1)!;
    const soft = (f: Facet) => f.skew > 0.7;
    const quilted = (fs: Facet[]) => fs.filter((f) => f.layer === 0);
    expect(share(quilted(facets(arm.upper)), soft)).toBeLessThan(0.01);
    expect(share(quilted(facets(arm.fore, 0)), soft)).toBeLessThan(0.01);
    expect(share(facets(arm.fore, 1), soft)).toBeLessThan(0.01);
    expect(facets(arm.upper).every((f) => f.skew < 1.3)).toBe(true);
    expect(share(quilted(facets(torso, 0)), soft)).toBeLessThan(0.01);
    expect(share(facets(arm.glove, 0, (v) => v.z < -0.06), soft)).toBeLessThan(0.01);
    expect(rest.length).toBeGreaterThan(0);

    const ring = (m: THREE.Mesh, y: number) => Array.from({ length: m.geometry.attributes.position.count }, (_, i) => i).filter((i) => Math.abs(m.geometry.attributes.position.getY(i) - y) < 1e-6).length;
    expect(ring(arm.upper, 0)).toBeGreaterThanOrEqual(21);
    expect(ring(arm.fore, FORE - 0.035)).toBeGreaterThanOrEqual(21);
  });

  it('maps every texture in meters: about one repetition per tile, cells not stretched', () => {
    const { avatar } = bothArmsUp();
    const arm = armsOf(avatar).find((x) => x.side === 1)!;
    const pieces: [string, THREE.Mesh, number][] = [['torso', meshesOf(avatar)[0], 0], ['upper arm', arm.upper, 0], ['forearm', arm.fore, 0], ['glove', arm.glove, 0]];
    for (const [name, mesh, material] of pieces) {
      const fs = facets(mesh, material, () => true).filter((f) => f.pu > 0 && f.pv > 0);
      const tiles = fs.map((f) => TILE[LAYERS[Math.round(f.layer)]]);
      const along = median(fs.map((f, i) => f.pu / tiles[i])), across = median(fs.map((f, i) => f.pv / tiles[i]));
      expect(along, name).toBeGreaterThan(0.6);
      expect(along, name).toBeLessThan(1.5);
      expect(across, name).toBeGreaterThan(0.6);
      expect(across, name).toBeLessThan(1.5);
      expect(share(fs, (f) => f.pu / f.pv > 0.55 && f.pu / f.pv < 1.8), name).toBeGreaterThan(0.85);
    }
  });

  it('keeps the texture scale when the forearm stretches to reach a far hand', () => {
    const forearmFor = (hand: THREE.Vector3) => {
      const t = makeApp();
      const avatar = new Avatar(t.app);
      t.connect(1, 'right', hand);
      avatar.update(1 / 72);
      return armsOf(avatar).find((x) => x.side === 1)!.fore;
    };
    const length = (m: THREE.Mesh) => new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute).max.y;
    const sleeve = (m: THREE.Mesh) => facets(m, 0, (v) => v.y > 0.045).filter((f) => f.layer === 0);
    const rest = forearmFor(new THREE.Vector3(0.2, 1.2, -0.3)), out = forearmFor(new THREE.Vector3(0.25, 1.4, -0.75));
    expect(length(out)).toBeGreaterThan(length(rest) + 0.03);
    expect(median(sleeve(out).map((f) => f.pv))).toBeCloseTo(median(sleeve(rest).map((f) => f.pv)), 2);
    expect(median(sleeve(out).map((f) => f.pu))).toBeCloseTo(median(sleeve(rest).map((f) => f.pu)), 2);
  });

  it('puts the mission patch on the left shoulder, with UVs that cover the disc once', () => {
    const { avatar } = bothArmsUp();
    const torso = meshesOf(avatar)[0];
    expect(torso.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1, 2]);
    const patch = torso.geometry.groups[2];
    const p = torso.geometry.attributes.position, uv = torso.geometry.attributes.uv, idx = torso.geometry.index!;
    const centre = new THREE.Vector3(), seen = new Set<number>();
    let lo = [1, 1], hi = [0, 0];
    for (let i = patch.start; i < patch.start + patch.count; i++) seen.add(idx.getX(i));
    seen.forEach((k) => {
      centre.add(new THREE.Vector3().fromBufferAttribute(p, k));
      lo = [Math.min(lo[0], uv.getX(k)), Math.min(lo[1], uv.getY(k))];
      hi = [Math.max(hi[0], uv.getX(k)), Math.max(hi[1], uv.getY(k))];
    });
    centre.divideScalar(seen.size);
    expect(centre.x).toBeLessThan(-0.15);
    expect(centre.y).toBeGreaterThan(0.2);
    expect(lo[0]).toBeGreaterThanOrEqual(-1e-3);
    expect(lo[1]).toBeGreaterThanOrEqual(-1e-3);
    expect(hi[0]).toBeLessThanOrEqual(1 + 1e-3);
    expect(hi[1]).toBeLessThanOrEqual(1 + 1e-3);
    expect(hi[0] - lo[0]).toBeGreaterThan(0.9);
  });

  it('greys gloves and forearms toward the tips and makes them duller', () => {
    const { avatar } = bothArmsUp();
    const arm = armsOf(avatar).find((x) => x.side === 1)!;
    const mean = (m: THREE.Mesh, inside: (v: THREE.Vector3) => boolean) => {
      const p = m.geometry.attributes.position, s = m.geometry.attributes.surface, col = m.geometry.attributes.color;
      const v = new THREE.Vector3();
      let n = 0, dust = 0, red = 0;
      for (let i = 0; i < p.count; i++) {
        if (!inside(v.fromBufferAttribute(p, i))) continue;
        n++; dust += s.getY(i); red += col.getX(i) - col.getZ(i);
      }
      return { dust: dust / n, warmth: red / n };
    };
    const palm = mean(arm.glove, (v) => v.z > -0.04 && v.z < 0.04), tips = mean(arm.glove, (v) => v.z < -0.12);
    expect(tips.dust).toBeGreaterThan(palm.dust + 0.2);
    expect(tips.dust).toBeLessThan(0.7);
    const elbow = mean(arm.fore, (v) => v.y < 0.08), wrist = mean(arm.fore, (v) => v.y > 0.2 && v.y < FORE - 0.05);
    expect(wrist.dust).toBeGreaterThan(elbow.dust + 0.2);
  });

  it('mirrors the left glove from the right one', () => {
    const { avatar } = bothArmsUp();
    const gloves = armsOf(avatar);
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
    const arm = armsOf(avatar).find((x) => x.side === 1)!;
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
    const arm = armsOf(avatar).find((x) => x.side === 1)!;
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
  const loadWith = (behaviour: 'load' | 'fail' | 'never') => {
    const made: THREE.Texture[] = [];
    const pending: ((t: THREE.Texture) => void)[] = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((url: string, onLoad?: (t: THREE.Texture) => void, _p?: unknown, onError?: (e: unknown) => void) => {
      const tex = new THREE.Texture();
      tex.name = url;
      made.push(tex);
      if (behaviour === 'load') onLoad?.(tex);
      else if (behaviour === 'fail') onError?.(new Error('missing'));
      else if (onLoad) pending.push(onLoad);
      return tex;
    }) as never);
    return { made, pending };
  };
  const compile = (m: THREE.MeshStandardMaterial) => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
    };
    m.onBeforeCompile(shader as never, undefined as never);
    return shader;
  };
  const vec = (shader: { uniforms: Record<string, THREE.IUniform> }, name: string) => shader.uniforms[name].value as THREE.Vector2[] | THREE.Vector3[];

  it('wraps each layer and its normal map, with color only on the color maps, and hands them to the cloth shader', () => {
    const { made } = loadWith('load');
    const avatar = new Avatar(makeApp().app);
    const shader = compile(suitOf(avatar).cloth);
    expect(made).toHaveLength(LAYERS.length * 2);
    for (const tex of made) {
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.anisotropy).toBeGreaterThanOrEqual(8);
      expect(tex.colorSpace === THREE.SRGBColorSpace).toBe(!tex.name.endsWith('-normal.webp'));
    }
    LAYERS.forEach((_, i) => {
      expect(shader.uniforms[`suitMap${i}`].value).toBe(made[2 * i]);
      expect(shader.uniforms[`suitNormal${i}`].value).toBe(made[2 * i + 1]);
      const bump = vec(shader, 'suitBump')[i] as THREE.Vector2;
      expect(bump.x).toBeGreaterThan(0);
      expect(bump.x).toBeLessThanOrEqual(1);
      expect(bump.y).toBe(-bump.x);
      expect((vec(shader, 'suitMean')[i] as THREE.Vector3).x).toBeLessThan(1);
    });
    expect(made.map((t) => t.name).filter((n) => !n.endsWith('-normal.webp')).sort()).toEqual(
      ['glove-rubber', 'suit-bellows', 'suit-fabric', 'suit-quilt'].map((n) => `/textures/suit/${n}.webp`),
    );
    expect(shader.vertexShader).toContain('attribute vec2 surface');
    expect(shader.fragmentShader).toContain('textureGrad( suitMap0');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
  });

  it('falls back to plain vertex color when the images do not load', () => {
    loadWith('fail');
    const avatar = new Avatar(makeApp().app);
    const { cloth } = suitOf(avatar);
    const shader = compile(cloth);
    expect(cloth.map).toBeNull();
    expect(cloth.normalMap).toBeNull();
    expect(cloth.vertexColors).toBe(true);
    expect(cloth.color.getHex()).toBe(0xffffff);
    LAYERS.forEach((_, i) => {
      expect((vec(shader, 'suitMean')[i] as THREE.Vector3).toArray()).toEqual([1, 1, 1]);
      expect((vec(shader, 'suitBump')[i] as THREE.Vector2).toArray()).toEqual([0, 0]);
      expect((shader.uniforms[`suitMap${i}`].value as THREE.Texture).image.data).toEqual(new Uint8Array([255, 255, 255, 255]));
    });
  });

  it('releases the textures, and one that arrives after dispose', () => {
    const { made, pending } = loadWith('never');
    const avatar = new Avatar(makeApp().app);
    const shader = compile(suitOf(avatar).cloth);
    const placeholders = new Set(Object.values(shader.uniforms).map((u) => u.value).filter((v): v is THREE.Texture => v instanceof THREE.Texture));
    expect(placeholders.size).toBe(2);
    const spies = [...made, ...placeholders].map((tex) => vi.spyOn(tex, 'dispose'));
    avatar.dispose();
    pending.forEach((onLoad, i) => onLoad(made[i]));
    spies.forEach((spy) => expect(spy).toHaveBeenCalled());
    expect(made).not.toContain(shader.uniforms.suitMap0.value);
  });
});

describe('Avatar reflections', () => {
  const withRenderer = () => {
    const t = makeApp();
    (t.raw as unknown as { renderer: unknown }).renderer = { capabilities: { getMaxAnisotropy: () => 16 }, compile: () => {} };
    return t;
  };

  it('builds one small environment, once, and only its own materials reflect it', () => {
    const target = new THREE.WebGLRenderTarget(1, 1);
    const fromScene = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue(target);
    const avatar = new Avatar(withRenderer().app);
    const { cloth, metal, patch } = suitOf(avatar);
    expect(fromScene).toHaveBeenCalledTimes(1);
    expect(fromScene.mock.contexts[0]).toBeInstanceOf(THREE.PMREMGenerator);
    expect(fromScene.mock.calls[0][0]).toBeInstanceOf(RoomEnvironment);
    for (const m of [cloth, metal, patch]) expect(m.envMap).toBe(target.texture);
    expect(metal.envMapIntensity).toBeGreaterThan(cloth.envMapIntensity);
    expect(metal.envMapIntensity).toBeLessThanOrEqual(1);
    expect(cloth.envMapIntensity).toBeLessThanOrEqual(0.3);
    const unrelated = new THREE.MeshStandardMaterial();
    expect(unrelated.envMap).toBeNull();
    expect(new THREE.Scene().environment).toBeNull();
  });

  it('uses the renderer limit for anisotropy and has no environment without a renderer', () => {
    const fromScene = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene');
    const avatar = new Avatar(makeApp().app);
    expect(fromScene).not.toHaveBeenCalled();
    expect(suitOf(avatar).metal.envMap).toBeNull();
    expect(suitOf(avatar).environment).toBeNull();
  });
});

describe('Mission patch', () => {
  it('is drawn on a canvas with the project colors, the name and no external images', () => {
    const avatar = new Avatar(makeApp().app);
    const { patch } = suitOf(avatar);
    expect(patch.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(patch.map!.image).toBe(canvases[0]);
    expect(patch.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(canvases[0].width).toBeGreaterThanOrEqual(256);

    const letters = drawing.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]).join('');
    expect(letters).toContain('TOUCHDOWN');
    const colors = new Set(drawing.calls.filter((c) => c.name === 'set fillStyle' || c.name === 'set strokeStyle').map((c) => String(c.args[0]).toUpperCase()));
    for (const color of ['#141413', '#FAF9F5', '#D97757']) expect(colors.has(color)).toBe(true);
    expect(drawing.calls.some((c) => c.name === 'drawImage')).toBe(false);
    expect(drawing.calls.filter((c) => c.name === 'arc').length).toBeGreaterThan(5);
  });

  it('stays a flat slate disc when there is no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { patch } = suitOf(new Avatar(makeApp().app));
    expect(patch.map).toBeNull();
    expect(patch.color.getHex()).toBe(0x141413);
  });
});

describe('Avatar.dispose', () => {
  it('releases every geometry, material, texture, the environment and the patch canvas', () => {
    const target = new THREE.WebGLRenderTarget(1, 1);
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue(target);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((_url: string, onLoad?: (t: THREE.Texture) => void) => {
      const tex = new THREE.Texture();
      onLoad?.(tex);
      return tex;
    }) as never);
    const t = makeApp();
    (t.raw as unknown as { renderer: unknown }).renderer = { capabilities: { getMaxAnisotropy: () => 16 }, compile: () => {} };
    const avatar = new Avatar(t.app);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    avatar.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
    });
    const textures = new Set<THREE.Texture>();
    materials.forEach((m) => Object.values(m).forEach((v) => { if (v instanceof THREE.Texture && v !== target.texture) textures.add(v); }));
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '', fragmentShader: '' };
    suitOf(avatar).cloth.onBeforeCompile(shader as never, undefined as never);
    Object.values(shader.uniforms).forEach((u) => { if (u.value instanceof THREE.Texture) textures.add(u.value); });
    expect(textures.size).toBe(LAYERS.length * 2 + 1);

    const spies = [...geometries, ...materials, ...textures, target].map((x) => vi.spyOn(x, 'dispose'));
    expect(canvases[0].width).toBeGreaterThan(0);
    avatar.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalled());
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });
});
