import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_URL = '/models/astronaut-arms.glb';
const TIMEOUT_MS = 20000;

/**
 * One piece of the HD suit arm. `length` is the joint-to-joint distance of the piece as modeled, in meters (0 for the hand).
 * Upper arm and forearm run along +Y from their joint; the hand is in the hand frame of `buildGlove`
 * (palm center near the origin, fingers toward -Z, thumb +Y, palm toward -X for the right hand, +X for the left)
 * with the wrist 0.075 behind the origin, along +Z.
 */
export interface HdSegment { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; length: number }
export interface HdArm { upper: HdSegment; fore: HdSegment; hand: HdSegment }
export interface HdArms { right: HdArm; left: HdArm; dispose(): void }

/** Loads the HD arms. Resolves null on any error or after TIMEOUT_MS, so the procedural arms stay. */
export function loadHdArms(): Promise<HdArms | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (arms: HdArms | null) => {
      if (settled) { arms?.dispose(); return; }
      settled = true; clearTimeout(timer); resolve(arms);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL)
      .then((gltf) => finish(extract(gltf.scene)))
      .catch(() => finish(null));
  });
}

/** Float copy of a mesh geometry with the node transform baked in (the optimizer quantizes positions into the node's scale). */
function bake(mesh: THREE.Mesh) {
  mesh.updateMatrix();
  const src = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  const copy = (name: string, size: 2 | 3) => {
    const a = src.getAttribute(name);
    const out = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      out[i * size] = a.getX(i); out[i * size + 1] = a.getY(i);
      if (size === 3) out[i * size + 2] = a.getZ(i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, size));
  };
  copy('position', 3); copy('normal', 3); copy('uv', 2);
  geometry.setIndex(src.index!.clone());
  geometry.applyMatrix4(mesh.matrix);
  geometry.computeBoundingSphere();
  src.dispose();
  return geometry;
}

function extract(scene: THREE.Group): HdArms | null {
  const segment = (name: string): HdSegment | null => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh?.isMesh || !mesh.geometry.index || Array.isArray(mesh.material)) return null;
    return { geometry: bake(mesh), material: mesh.material as THREE.MeshStandardMaterial, length: (mesh.userData.length as number | undefined) ?? 0 };
  };
  const arm = (side: 'r' | 'l'): HdArm | null => {
    const upper = segment(`arm_${side}_upper`), fore = segment(`arm_${side}_fore`), hand = segment(`arm_${side}_hand`);
    return upper && fore && hand && upper.length > 0 && fore.length > 0 ? { upper, fore, hand } : null;
  };
  const right = arm('r'), left = arm('l');
  if (!right || !left) { scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.()); return null; }
  const all = [right, left].flatMap((a) => [a.upper, a.fore, a.hand]);
  return {
    right, left,
    dispose() {
      for (const s of all) s.geometry.dispose();
      const materials = new Set(all.map((s) => s.material));
      for (const m of materials) {
        for (const v of Object.values(m)) {
          if (!(v instanceof THREE.Texture)) continue;
          const image = v.image as { close?: () => void } | null;
          v.dispose(); image?.close?.();
        }
        m.dispose();
      }
    },
  };
}
