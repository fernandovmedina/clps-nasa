import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { layerId, TILE, type Layer } from './avatar-layers';

const TAU = Math.PI * 2;

/** Radius, height along the axis and, from this ring on, a color and a texture layer. */
export type Ring = readonly [r: number, y: number, color?: THREE.Color, layer?: Layer];

interface RevolveOptions {
  segments: number;
  color: THREE.Color;
  layer: Layer;
  /** Perimeter factor for pieces that are squashed after building (the torso). */
  circumference?: number;
}

/**
 * Surface of revolution around +Y with smooth normals. UVs are in repetitions of the layer's texture:
 * `u` follows the perimeter (a whole number of repetitions, so it closes), `v` the length, shrinking with the
 * radius so the cells stay square where the shape narrows; bellows swap the two so the folds go around.
 * A ring listed twice makes a crease (rows with no length are skipped), and a layer change always does.
 */
export function revolve(profile: readonly Ring[], { segments, color, layer, circumference = 1 }: RevolveOptions) {
  const rings: { r: number; y: number; color: THREE.Color; layer: Layer }[] = [];
  let ringColor = color, ringLayer = layer;
  for (const [r, y, c, l] of profile) {
    const prev = rings[rings.length - 1];
    if (l && l !== ringLayer && prev && (prev.r !== r || prev.y !== y)) rings.push({ r, y, color: ringColor, layer: ringLayer });
    ringColor = c ?? ringColor;
    ringLayer = l ?? ringLayer;
    rings.push({ r, y, color: ringColor, layer: ringLayer });
  }
  const n = rings.length;

  const widest = new Array<number>(n);
  for (let i = 0, start = 0; i < n; i++) {
    if (i < n - 1 && rings[i + 1].layer === rings[i].layer) continue;
    const rmax = Math.max(...rings.slice(start, i + 1).map((p) => p.r));
    widest.fill(rmax, start, i + 1);
    start = i + 1;
  }

  const rowNormal = rings.slice(0, -1).map((p, i) => {
    const dr = rings[i + 1].r - p.r, dy = rings[i + 1].y - p.y;
    const len = Math.hypot(dr, dy);
    return len < 1e-9 ? null : ([dy / len, -dr / len] as const);
  });

  const along = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = rings[i - 1], b = rings[i];
    if (a.layer !== b.layer) continue;
    const squeeze = b.layer === 'bellows' ? 1 : Math.min(2, widest[i] / Math.max((a.r + b.r) / 2, 1e-6));
    along[i] = along[i - 1] + (Math.hypot(b.r - a.r, b.y - a.y) / TILE[b.layer]) * squeeze;
  }

  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], surface: number[] = [];
  for (let i = 0; i < n; i++) {
    const { r, y, color: c, layer: l } = rings[i];
    let nr = 0, ny = 0;
    for (const s of [rowNormal[i - 1], rowNormal[i]]) if (s) { nr += s[0]; ny += s[1]; }
    const len = Math.hypot(nr, ny) || 1;
    if (r === 0) { nr = 0; ny = Math.sign(ny) || 1; } else { nr /= len; ny /= len; }
    const repeats = Math.max(1, Math.round((TAU * widest[i] * circumference) / TILE[l]));
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * TAU, sa = Math.sin(a), ca = Math.cos(a), around = (j / segments) * repeats;
      pos.push(r * sa, y, r * ca);
      nor.push(nr * sa, ny, nr * ca);
      if (l === 'bellows') uv.push(along[i], around); else uv.push(around, along[i]);
      col.push(c.r, c.g, c.b);
      surface.push(layerId(l), 0);
    }
  }

  const index: number[] = [];
  const stride = segments + 1;
  for (let i = 0; i < n - 1; i++) {
    if (!rowNormal[i]) continue;
    const lowPole = rings[i].r === 0, highPole = rings[i + 1].r === 0;
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
  geo.setAttribute('surface', new THREE.Float32BufferAttribute(surface, 2));
  geo.setIndex(index);
  return geo;
}

/** Quarter circle of a dome that closes a tube: from the equator at `y` to the pole, up (+1) or down (-1). */
export function dome(radius: number, y: number, dir: 1 | -1, steps = 4): Ring[] {
  return Array.from({ length: steps }, (_, k) => {
    const phi = ((k + 1) / steps) * (Math.PI / 2);
    return [k === steps - 1 ? 0 : radius * Math.cos(phi), y + dir * radius * Math.sin(phi)] as const;
  });
}

/** Convolute rings: a valley, then for each crest radius two crest rings and the next valley. */
export function convolutes(from: number, crests: number[], valley: number, period: number): Ring[] {
  const out: Ring[] = [[valley, from]];
  crests.forEach((crest, k) => {
    const y = from + k * period;
    out.push([crest, y + period * 0.3], [crest, y + period * 0.7], [valley, y + period]);
  });
  return out;
}

/** Profile of a sphere of this radius from the south pole to the north pole. */
export function sphereProfile(radius: number, steps: number): Ring[] {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = -Math.PI / 2 + (k / steps) * Math.PI;
    return [k === 0 || k === steps ? 0 : radius * Math.cos(t), radius * Math.sin(t)] as const;
  });
}

type Per<T> = T | ((normal: THREE.Vector3, position: THREE.Vector3) => T);
const pick = <T>(value: Per<T>, n: THREE.Vector3, p: THREE.Vector3): T => (typeof value === 'function' ? (value as (n: THREE.Vector3, p: THREE.Vector3) => T)(n, p) : value);

/**
 * Gives a plain mesh the suit attributes: a color and a texture layer per vertex, and UVs in meters projected along the
 * axis its face points to (the box face, for a rounded box), so a face never mixes two projections.
 */
export function skin(geo: THREE.BufferGeometry, color: Per<THREE.Color>, layer: Per<Layer>, tile = typeof layer === 'string' ? TILE[layer] : TILE.fabric) {
  const p = geo.attributes.position, nrm = geo.attributes.normal, face = geo.attributes.face ?? nrm;
  const col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2), surface = new Float32Array(p.count * 2);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nrm, i);
    const c = pick(color, n, v), l = pick(layer, n, v);
    const ax = Math.abs(face.getX(i)), ay = Math.abs(face.getY(i)), az = Math.abs(face.getZ(i));
    const [s, t] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.x, v.z] : [v.x, v.y];
    col.set([c.r, c.g, c.b], i * 3);
    uv[i * 2] = s / tile;
    uv[i * 2 + 1] = t / tile;
    surface[i * 2] = layerId(l);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('surface', new THREE.BufferAttribute(surface, 2));
  geo.deleteAttribute('face');
  return geo;
}

/** Makes `skin` project a mesh straight along (x, y, z), whatever its normals do. */
export function projectAlong(geo: THREE.BufferGeometry, x: number, y: number, z: number) {
  geo.setAttribute('face', new THREE.Float32BufferAttribute(Array.from({ length: geo.attributes.position.count }, () => [x, y, z]).flat(), 3));
  return geo;
}

export const DUST = new THREE.Color('#8E8B84');

/** Greys the vertex colors toward lunar dust and makes the surface duller, by an amount (0 to 1) that depends on where the vertex is. */
export function weather(geo: THREE.BufferGeometry, amount: (position: THREE.Vector3) => number) {
  const p = geo.attributes.position, col = geo.attributes.color as THREE.BufferAttribute, surface = geo.attributes.surface as THREE.BufferAttribute;
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const a = THREE.MathUtils.clamp(amount(v.fromBufferAttribute(p, i)), 0, 1);
    c.fromBufferAttribute(col, i).lerp(DUST, a);
    col.setXYZ(i, c.r, c.g, c.b);
    surface.setY(i, a);
  }
  return geo;
}

/** Box with softened edges: segments past the first are pushed onto a rounded outline. */
export function roundedBox(w: number, h: number, d: number, radius: number, segments: readonly [number, number, number] = [2, 2, 2]) {
  const geo = new THREE.BoxGeometry(w, h, d, ...segments);
  const p = geo.attributes.position, n = geo.attributes.normal;
  geo.setAttribute('face', n.clone());
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

export const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

export function mirrorX(geo: THREE.BufferGeometry) {
  geo.scale(-1, 1, 1);
  const index = geo.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return geo;
}

export function merge(parts: THREE.BufferGeometry[]) {
  const geo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return geo;
}

/** One geometry whose groups are the given lists of parts, in order (group k is drawn with material k). */
export function mergeGroups(lists: THREE.BufferGeometry[][]) {
  const parts = lists.map(merge);
  const geo = mergeGeometries(parts, true)!;
  parts.forEach((g) => g.dispose());
  return geo;
}
