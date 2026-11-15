import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Exponential smoothing factor, frame-rate independent. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/**
 * Lunar lat/lon (degrees) → vector in the moon-fixed frame used everywhere in this app.
 * Matches THREE.SphereGeometry UVs for an equirectangular map with lon −180° at the left edge.
 * +Y = north pole, lon 0° = +X, lon +90°E = −Z.
 */
export function latLonToVec3(latDeg: number, lonDeg: number, r = 1, out = new THREE.Vector3()) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return out.set(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

/** Local East-North-Up basis at a site (moon-fixed frame). */
export function enuBasis(latDeg: number, lonDeg: number) {
  const up = latLonToVec3(latDeg, lonDeg).normalize();
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up);
  if (east.lengthSq() < 1e-8) east.set(0, 0, -1);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

/** Moon-fixed direction → local scene vector (x = east, y = up, z = −north). */
export function toLocal(dir: THREE.Vector3, basis: ReturnType<typeof enuBasis>, out = new THREE.Vector3()) {
  return out.set(dir.dot(basis.east), dir.dot(basis.up), -dir.dot(basis.north)).normalize();
}

/** Seeded PRNG (mulberry32) so each site always gets the same terrain. */
export function seeded(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lookMat = new THREE.Matrix4(); // scratch: called every frame from every phase's setView, never needs to persist

/** Quaternion that makes an object's −Z look from `eye` to `target` with the given up. */
export function lookQuat(eye: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3, out = new THREE.Quaternion()) {
  lookMat.lookAt(eye, target, up);
  return out.setFromRotationMatrix(lookMat);
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}
