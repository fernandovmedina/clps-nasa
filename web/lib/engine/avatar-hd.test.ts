import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from './app';
import { Avatar } from './avatar';
import type { HdArm, HdArms, HdSegment } from './avatar-hd';

const FORE = 0.27, UPPER = 0.3;

function glbJson() {
  const data = readFileSync(resolve(__dirname, '../../public/models/astronaut-arms.glb'));
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
  return { json, bytes: data.length };
}

describe('astronaut-arms.glb', () => {
  const { json, bytes } = glbJson();
  const nodes = new Map<string, { mesh: number; extras?: { length: number } }>(json.nodes.map((n: { name: string }) => [n.name, n]));

  it('is light: under 600 KB, webp textures and meshopt', () => {
    expect(bytes).toBeLessThan(600 * 1024);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.extensionsUsed).not.toContain('KHR_materials_volume');
    expect(json.images.length).toBeGreaterThan(0);
    for (const t of json.textures) expect(t.extensions.EXT_texture_webp).toBeDefined();
  });

  it('has the three pieces of each arm and few triangles and materials', () => {
    for (const side of ['r', 'l']) for (const part of ['upper', 'fore', 'hand']) expect(nodes.has(`arm_${side}_${part}`)).toBe(true);
    const triangles = json.meshes.reduce((n: number, m: { primitives: { indices: number }[] }) => n + m.primitives.reduce((k, p) => k + json.accessors[p.indices].count / 3, 0), 0);
    expect(triangles).toBeLessThanOrEqual(12000);
    expect(json.materials).toHaveLength(2);
    expect(json.meshes.every((m: { primitives: unknown[] }) => m.primitives.length === 1)).toBe(true);
  });

  it('gives the joint-to-joint length of the upper arm and the forearm', () => {
    for (const side of ['r', 'l']) {
      expect(nodes.get(`arm_${side}_upper`)!.extras!.length).toBeGreaterThan(0.25);
      expect(nodes.get(`arm_${side}_upper`)!.extras!.length).toBeLessThan(0.3);
      expect(nodes.get(`arm_${side}_fore`)!.extras!.length).toBeGreaterThan(0.25);
      expect(nodes.get(`arm_${side}_fore`)!.extras!.length).toBeLessThan(0.3);
    }
  });
});

function makeApp() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  const controllers = [new THREE.Group(), new THREE.Group()];
  const grips = [new THREE.Group(), new THREE.Group()];
  const connect = (i: number, handedness: string, at: THREE.Vector3) => {
    controllers[i].userData.connected = true;
    controllers[i].userData.handedness = handedness;
    grips[i].position.copy(at);
    grips[i].visible = true;
  };
  return { app: { isXR: true, camera, input: { controllers, grips } } as unknown as LunarApp, grips, connect };
}

function fakeHd() {
  const segment = (length: number, size: number): HdSegment => ({
    geometry: new THREE.BoxGeometry(size, length || 0.15, size).translate(0, (length || 0.15) / 2, 0),
    material: new THREE.MeshStandardMaterial(),
    length,
  });
  const arm = (): HdArm => ({ upper: segment(0.27, 0.1), fore: segment(0.28, 0.08), hand: segment(0, 0.1) });
  const dispose = vi.fn();
  const hd: HdArms = { right: arm(), left: arm(), dispose: () => dispose() };
  return Object.assign(hd, { disposed: dispose });
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const meshes = (a: Avatar) => { const out: THREE.Mesh[] = []; a.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
const armsOf = (a: Avatar) => (a as unknown as { arms: { side: number; upper: THREE.Mesh; fore: THREE.Mesh; glove: THREE.Mesh; hd: { upper: THREE.Mesh; fore: THREE.Mesh; glove: THREE.Mesh; elbow: THREE.Mesh; wrist: THREE.Mesh } | null }[] }).arms;

beforeEach(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((() => new THREE.Texture()) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
});
afterEach(() => vi.restoreAllMocks());

describe('Avatar with the HD arms', () => {
  function ready(hd = fakeHd()) {
    const t = makeApp();
    const avatar = new Avatar(t.app, () => Promise.resolve(hd));
    t.connect(0, 'left', new THREE.Vector3(-0.25, 1.3, -0.35));
    t.connect(1, 'right', new THREE.Vector3(0.25, 1.3, -0.35));
    avatar.update(1 / 72);
    return { t, avatar, hd };
  }

  it('keeps the procedural arms while the model loads and when it fails', async () => {
    for (const load of [() => new Promise<null>(() => {}), () => Promise.resolve(null), () => Promise.reject(new Error('missing'))]) {
      const t = makeApp();
      const avatar = new Avatar(t.app, load);
      t.connect(1, 'right', new THREE.Vector3(0.25, 1.3, -0.35));
      avatar.update(1 / 72);
      await flush();
      avatar.update(1 / 72);
      const arm = armsOf(avatar).find((a) => a.side === 1)!;
      expect(arm.hd).toBeNull();
      expect([arm.upper, arm.fore, arm.glove].every((m) => m.visible)).toBe(true);
    }
  });

  it('does not fetch the arms outside a session, only once one has started', async () => {
    const t = makeApp();
    const load = vi.fn(() => Promise.resolve(fakeHd()));
    const avatar = new Avatar(t.app, load);
    (t.app as unknown as { isXR: boolean }).isXR = false;
    avatar.update(1 / 72);
    expect(load).not.toHaveBeenCalled();
    (t.app as unknown as { isXR: boolean }).isXR = true;
    avatar.update(1 / 72); avatar.update(1 / 72);
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(armsOf(avatar).every((a) => a.hd !== null)).toBe(true);
  });

  it('shows the HD pieces in place of the procedural ones, only for connected controllers', async () => {
    const { t, avatar } = ready();
    await flush();
    t.grips[0].visible = false;
    avatar.update(1 / 72);
    for (const arm of armsOf(avatar)) {
      expect(arm.hd).not.toBeNull();
      const shown = arm.side === 1;
      expect([arm.upper, arm.fore, arm.glove].some((m) => m.visible)).toBe(false);
      expect([arm.hd!.upper, arm.hd!.fore, arm.hd!.glove, arm.hd!.elbow, arm.hd!.wrist].every((m) => m.visible === shown)).toBe(true);
    }
  });

  it('puts the glove on the controller, the upper arm on the shoulder and the forearm end on the wrist, with the lengths of the arm', async () => {
    const { t, avatar } = ready();
    await flush();
    t.grips[1].quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0.3, 0));
    t.grips[1].position.set(0.25, 1.4, -0.75);
    avatar.update(1 / 72);
    const arm = armsOf(avatar).find((a) => a.side === 1)!, hd = arm.hd!;
    expect(hd.glove.position.distanceTo(t.grips[1].position)).toBeLessThan(1e-6);
    expect(hd.glove.quaternion.angleTo(arm.glove.quaternion)).toBeLessThan(1e-6);
    const wrist = new THREE.Vector3(0, 0, 0.075).applyQuaternion(hd.glove.quaternion).add(hd.glove.position);
    const end = (m: THREE.Mesh, length: number) => new THREE.Vector3(0, length * m.scale.y, 0).applyQuaternion(m.quaternion).add(m.position);
    expect(end(hd.fore, 0.28).distanceTo(wrist)).toBeLessThan(1e-3);
    expect(hd.wrist.position.distanceTo(wrist)).toBeLessThan(1e-6);
    expect(end(hd.upper, 0.27).distanceTo(hd.elbow.position)).toBeLessThan(1e-3);
    expect(hd.fore.position.distanceTo(hd.elbow.position)).toBeLessThan(1e-6);
    expect(hd.upper.scale.y * 0.27).toBeCloseTo(UPPER, 6);
    expect(hd.upper.scale.x).toBeCloseTo(hd.upper.scale.z, 6);
  });

  it('keeps the forearm at the length it has at rest when the hand is within reach', async () => {
    const { avatar } = ready();
    await flush();
    avatar.update(1 / 72);
    const hd = armsOf(avatar)[1].hd!;
    expect(hd.fore.scale.y * 0.28).toBeGreaterThan(FORE - 0.06);
    expect(hd.fore.scale.y * 0.28).toBeLessThan(FORE + 0.06);
  });

  it('stays within 20000 triangles and 16 draw calls with the real arms', async () => {
    const { avatar } = ready();
    await flush();
    avatar.update(1 / 72);
    const drawn = meshes(avatar).filter((m) => m.visible);
    const triangles = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const hdParts = new Set(armsOf(avatar).flatMap((a) => [a.hd!.upper, a.hd!.fore, a.hd!.glove]));
    const modeled = glbJson().json.meshes.reduce((n: number, m: { primitives: { indices: number }[] }) => n + m.primitives.reduce((k, p) => k + glbJson().json.accessors[p.indices].count / 3, 0), 0);
    const others = drawn.filter((m) => !hdParts.has(m));
    expect(others.reduce((n, m) => n + triangles(m), 0) + modeled).toBeLessThanOrEqual(20000);
    expect(drawn.reduce((n, m) => n + (Array.isArray(m.material) ? m.geometry.groups.length : 1), 0)).toBeLessThanOrEqual(16);
  });

  it('releases the HD pieces on dispose, also when the model arrives after it', async () => {
    const { avatar, hd } = ready();
    await flush();
    const geometries = meshes(avatar).map((m) => vi.spyOn(m.geometry, 'dispose'));
    avatar.dispose();
    expect(hd.disposed).toHaveBeenCalledTimes(1);
    geometries.forEach((s) => expect(s).toHaveBeenCalled());

    const late = fakeHd();
    const t = makeApp();
    let arrive!: (h: HdArms) => void;
    const later = new Avatar(t.app, () => new Promise<HdArms>((r) => { arrive = r; }));
    later.update(1 / 72);
    later.dispose();
    arrive(late);
    await flush();
    expect(late.disposed).toHaveBeenCalledTimes(1);
    expect(armsOf(later).every((a) => a.hd === null)).toBe(true);
  });
});
