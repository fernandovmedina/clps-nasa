import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One repetition of the fabric texture covers this many meters of suit. */
const FABRIC_TILE = 0.07;

export const SUIT_COLORS = {
  fabric: new THREE.Color('#D8D8CE'),
  bellows: new THREE.Color('#A9AAA2'),
  metal: new THREE.Color('#888E8D'),
  gloveBack: new THREE.Color('#D1D2C8'),
  glovePalm: new THREE.Color('#777D79'),
  fingertip: new THREE.Color('#646B68'),
  stripe: new THREE.Color('#A93630'),
  display: new THREE.Color('#2B302E'),
};

const ARM_SEGMENTS = 14;
const TAU = Math.PI * 2;

/** Radius, height along the axis and, from this ring on, a color. */
type Ring = readonly [r: number, y: number, color?: THREE.Color];

/**
 * Surface of revolution around +Y, with UVs in meters (fabric tiles seamlessly around and along)
 * and a vertex color per ring. A ring listed twice makes a crease; rows with no length are skipped.
 */
function revolve(profile: readonly Ring[], segments: number, base: THREE.Color, circumference = 1) {
  const n = profile.length;
  const rowNormal = profile.slice(0, -1).map(([r0, y0], i) => {
    const dr = profile[i + 1][0] - r0, dy = profile[i + 1][1] - y0;
    const len = Math.hypot(dr, dy);
    return len < 1e-9 ? null : ([dy / len, -dr / len] as const);
  });
  const repeats = Math.max(1, Math.round((TAU * Math.max(...profile.map((p) => p[0])) * circumference) / FABRIC_TILE));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  let arc = 0;
  let color = base;
  for (let i = 0; i < n; i++) {
    const [r, y, c] = profile[i];
    if (c) color = c;
    if (i > 0) arc += Math.hypot(r - profile[i - 1][0], y - profile[i - 1][1]);
    let nr = 0, ny = 0;
    for (const s of [rowNormal[i - 1], rowNormal[i]]) if (s) { nr += s[0]; ny += s[1]; }
    const len = Math.hypot(nr, ny) || 1;
    if (r === 0) { nr = 0; ny = Math.sign(ny) || 1; } else { nr /= len; ny /= len; }
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * TAU, sa = Math.sin(a), ca = Math.cos(a);
      pos.push(r * sa, y, r * ca);
      nor.push(nr * sa, ny, nr * ca);
      uv.push((j / segments) * repeats, arc / FABRIC_TILE);
      col.push(color.r, color.g, color.b);
    }
  }
  const index: number[] = [];
  const stride = segments + 1;
  for (let i = 0; i < n - 1; i++) {
    if (!rowNormal[i]) continue;
    const lowPole = profile[i][0] === 0, highPole = profile[i + 1][0] === 0;
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j, b = a + 1, c = a + stride + 1, d = a + stride;
      if (!lowPole) index.push(a, b, c);
      if (!highPole) index.push(a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

/** Quarter circle of a dome that closes a tube: from the equator at `y` to the pole, up (+1) or down (-1). */
function dome(radius: number, y: number, dir: 1 | -1, steps = 3): Ring[] {
  return Array.from({ length: steps }, (_, k) => {
    const phi = ((k + 1) / steps) * (Math.PI / 2);
    return [k === steps - 1 ? 0 : radius * Math.cos(phi), y + dir * radius * Math.sin(phi)] as const;
  });
}

/** Convolute rings: a valley, then for each crest radius two crest rings and the next valley. */
function convolutes(from: number, crests: number[], valley: number, period: number): Ring[] {
  const out: Ring[] = [[valley, from]];
  crests.forEach((crest, k) => {
    const y = from + k * period;
    out.push([crest, y + period * 0.3], [crest, y + period * 0.7], [valley, y + period]);
  });
  return out;
}

function paint(geo: THREE.BufferGeometry, color: (normal: THREE.Vector3, position: THREE.Vector3) => THREE.Color) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const arr = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const c = color(nv.fromBufferAttribute(n, i), v.fromBufferAttribute(p, i));
    arr.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Projects UVs in meters along the axis each vertex faces most (for pieces that are not surfaces of revolution). */
function boxUV(geo: THREE.BufferGeometry) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / FABRIC_TILE;
    uv[i * 2 + 1] = v / FABRIC_TILE;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Box with softened edges: segments past the first are pushed onto a rounded outline. */
function roundedBox(w: number, h: number, d: number, radius: number, segments: readonly [number, number, number] = [2, 2, 2]) {
  const geo = new THREE.BoxGeometry(w, h, d, ...segments);
  const p = geo.attributes.position, n = geo.attributes.normal;
  const half = new THREE.Vector3(w / 2 - radius, h / 2 - radius, d / 2 - radius);
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(THREE.MathUtils.clamp(v.x, -half.x, half.x), THREE.MathUtils.clamp(v.y, -half.y, half.y), THREE.MathUtils.clamp(v.z, -half.z, half.z));
    dir.subVectors(v, inner);
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize();
    n.setXYZ(i, dir.x, dir.y, dir.z);
    p.setXYZ(i, inner.x + dir.x * radius, inner.y + dir.y * radius, inner.z + dir.z * radius);
  }
  return geo;
}

const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

function solid(geo: THREE.BufferGeometry, color: THREE.Color) {
  return boxUV(paint(geo, () => color));
}

function mirrorX(geo: THREE.BufferGeometry) {
  geo.scale(-1, 1, 1);
  const index = geo.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return geo;
}

function merge(parts: THREE.BufferGeometry[]) {
  const geo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return geo;
}

/** Torso from the waist to the shoulder yoke, centered on the chest, facing -Z. No legs. */
export function buildTorso(chest: THREE.Vector3) {
  const { fabric, bellows } = SUIT_COLORS;
  const body = revolve([
    [0, -0.3, bellows], [0.115, -0.3], [0.15, -0.275], [0.152, -0.215], [0.152, -0.215, fabric],
    [0.155, -0.12], [0.17, 0], [0.175, 0.09], [0.168, 0.17], [0.15, 0.21], [0.12, 0.245], [0.08, 0.267], [0.035, 0.277], [0, 0.28],
  ], 24, fabric, 1.05).scale(1.2, 1, 0.9);

  const parts = [body];
  for (const side of [-1, 1]) {
    parts.push(at(solid(new THREE.SphereGeometry(0.1, 16, 9).scale(1, 0.92, 1), fabric), side * 0.19, 0.22, 0.02));
    parts.push(at(solid(new THREE.SphereGeometry(1, 10, 6).scale(0.11, 0.035, 0.1).rotateZ(side * -0.28), bellows), side * 0.11, 0.25, 0.01));
  }

  const depth = 0.04, front = chest.z - depth / 2 - 0.002;
  parts.push(at(solid(roundedBox(0.14, 0.095, depth, 0.006), bellows), chest.x, chest.y, chest.z));
  parts.push(at(solid(roundedBox(0.075, 0.03, 0.006, 0.002), SUIT_COLORS.display), chest.x, chest.y + 0.02, front));
  const buttons: [number, THREE.Color][] = [[-0.04, SUIT_COLORS.stripe], [0, SUIT_COLORS.fabric], [0.04, SUIT_COLORS.metal]];
  for (const [x, color] of buttons) {
    parts.push(at(solid(new THREE.CylinderGeometry(0.0085, 0.0085, 0.008, 8).rotateX(Math.PI / 2), color), chest.x + x, chest.y - 0.018, front));
  }
  return merge(parts);
}

/** Upper arm along +Y from the shoulder joint to the elbow joint, with the commander stripe and half of the elbow bellows. */
export function buildUpperArm(length: number) {
  const { fabric, bellows, stripe } = SUIT_COLORS;
  const e = length - 0.06;
  return revolve([
    [0.074, 0], [0.078, 0.04], [0.0765, 0.1], [0.0765, 0.1, stripe], [0.0745, 0.14], [0.0745, 0.14, fabric],
    [0.066, e - 0.005],
    ...convolutes(e, [0.072, 0.067, 0.0625], 0.06, 0.02).map(([r, y], i) => (i === 0 ? ([r, y, bellows] as const) : ([r, y] as const))),
    ...dome(0.06, length, 1),
  ], ARM_SEGMENTS, fabric);
}

/** Region of the forearm that grows when the hand is beyond reach; everything past it is shifted rigidly. */
const FOREARM_STRETCH = { from: 0.05, to: 0.21 } as const;

/** Forearm along +Y from the elbow joint to the wrist: bellows, tapered sleeve, then the metal disconnect ring (second group). */
export function buildForearm(length: number) {
  const { fabric, bellows, metal } = SUIT_COLORS;
  const cloth = revolve([
    ...dome(0.06, 0, -1).reverse().map(([r, y], i) => (i === 0 ? ([r, y, bellows] as const) : ([r, y] as const))),
    ...convolutes(0, [0.0625, 0.067], 0.06, 0.02),
    [0.061, FOREARM_STRETCH.from, fabric], [0.052, FOREARM_STRETCH.to], [0.052, length - 0.035],
  ], ARM_SEGMENTS, fabric);
  const r = length - 0.048;
  const ring = revolve([
    [0.052, r], [0.0585, r], [0.0585, r + 0.006], [0.0545, r + 0.006], [0.0545, r + 0.011],
    [0.0605, r + 0.011], [0.0605, length], [0, length],
  ], ARM_SEGMENTS, metal);
  const geo = mergeGeometries([cloth, ring], true)!;
  cloth.dispose();
  ring.dispose();
  return geo;
}

/** Moves the stretchable part of a forearm built by `buildForearm` so the wrist ends up `extra` meters further out. */
export function stretchForearm(geo: THREE.BufferGeometry, base: Float32Array, extra: number) {
  const { from, to } = FOREARM_STRETCH;
  const k = extra / (to - from);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = base[i * 3 + 1];
    p.setY(i, y <= from ? y : y >= to ? y + extra : from + (y - from) * (1 + k));
  }
  p.needsUpdate = true;
  geo.computeBoundingSphere();
}

const FINGERS = [
  { y: 0.039, w: 0.023, len: 0.07 },
  { y: 0.013, w: 0.024, len: 0.078 },
  { y: -0.012, w: 0.023, len: 0.072 },
  { y: -0.035, w: 0.02, len: 0.058 },
];
const PALM = { t: 0.05, w: 0.105, l: 0.1 };
/** The wrist sits this far behind the palm center (the grip origin), along the glove's own Z axis. */
export const WRIST_BACK = 0.075;
/**
 * The glove is built in a hand frame (fingers -Z, thumb +Y, palm -X for the right hand). A controller's grip
 * frame has its handle along Z, head toward -Z and trigger below, so the hand around it is turned a quarter
 * about X: fingers end up along -Y and the thumb along -Z, toward the buttons.
 */
export const GLOVE_FROM_GRIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Bends everything in front of z = `from` toward -X along a circular arc of total angle `angle` over `length`. */
function curl(geo: THREE.BufferGeometry, from: number, length: number, angle: number) {
  const k = angle / length;
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const s = Math.max(0, from - p.getZ(i)), th = k * s;
    const c = Math.cos(th), sn = Math.sin(th), x = p.getX(i);
    p.setXYZ(i, -(1 - c) / k + x * c, p.getY(i), from - sn / k - x * sn);
    const nx = n.getX(i), nz = n.getZ(i);
    n.setXYZ(i, nx * c + nz * sn, n.getY(i), -nx * sn + nz * c);
  }
  return geo;
}

/**
 * Pressurized glove in its own hand frame (see GLOVE_FROM_GRIP): palm center at the origin, fingers toward -Z,
 * thumb up, palm facing -X for the right hand; the left hand is its mirror image.
 */
export function buildGlove(side: 1 | -1) {
  const { gloveBack, glovePalm, fingertip, bellows } = SUIT_COLORS;
  const palmSide = (c: THREE.Color) => (n: THREE.Vector3) => c.clone().lerp(glovePalm, THREE.MathUtils.smoothstep(-n.x, 0.25, 0.7));
  const withPalm = (geo: THREE.BufferGeometry) => boxUV(paint(geo, palmSide(gloveBack)));

  const parts = [at(withPalm(roundedBox(PALM.t, PALM.w, PALM.l, 0.014)), 0, 0, 0)];
  const front = -PALM.l / 2;
  const curlAngle = 0.4;
  FINGERS.forEach(({ y, w, len }) => {
    const tip = 0.016;
    const finger = at(withPalm(roundedBox(w, 0.032, len, 0.01, [2, 2, 3])), 0, y, front - len / 2 + 0.004);
    const cap = at(boxUV(paint(roundedBox(w + 0.002, 0.034, tip, 0.006), () => fingertip)), 0, y, front - len - tip / 2 + 0.005);
    for (const g of [finger, cap]) parts.push(curl(g, front + 0.004, len, curlAngle));
  });
  parts.push(at(solid(roundedBox(0.012, 0.095, 0.02, 0.004), bellows), PALM.t / 2 + 0.003, 0, front + 0.012));

  const thumb = revolve([
    [0, 0, gloveBack], [0.016, 0.005], [0.019, 0.02], [0.0185, 0.05], [0.0155, 0.058, fingertip], [0.0155, 0.068], [0, 0.0755],
  ], 8, gloveBack);
  thumb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.12, 0.5, -0.866).normalize()));
  parts.push(at(thumb, -0.008, 0.04, 0.012));

  const cuff = revolve([[0, 0, gloveBack], [0.036, 0], [0.052, 0.012], [0.052, 0.05], [0, 0.055]], 12, gloveBack).rotateX(Math.PI / 2);
  parts.push(at(cuff, 0, 0, PALM.l / 2 - 0.01));

  const glove = merge(parts);
  return side === 1 ? glove : mirrorX(glove);
}
