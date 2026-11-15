import * as THREE from 'three';
import { TILE, type Layer } from './avatar-layers';
import { at, convolutes, dome, merge, mergeGroups, mirrorX, projectAlong, revolve, roundedBox, skin, sphereProfile, weather, type Ring } from './avatar-mesh';

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

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Pairs of equal points so each corner of a profile is a crease. */
const sharp = (points: [number, number][]): Ring[] => points.flatMap((p, i) => (i === 0 || i === points.length - 1 ? [p] : [p, p]));

/** Where the mission patch sits on the left shoulder (direction from the shoulder center, outward and up) and how big it is. */
const PATCH = { direction: new THREE.Vector3(-0.2, 0.93, -0.3).normalize(), radius: 0.038, ball: 0.1, squash: 0.92 };

/** Round patch cap lying on the shoulder ball, with planar UVs so the canvas drawing covers the disc exactly. */
function patchCap() {
  const rho = PATCH.ball + 0.0025;
  const edge = Math.asin(PATCH.radius / rho);
  const cap = revolve([
    [PATCH.radius, rho * Math.cos(edge) - 0.004], [PATCH.radius, rho * Math.cos(edge)],
    ...[0.78, 0.55, 0.3, 0].map((t) => [rho * Math.sin(edge * t), rho * Math.cos(edge * t)] as const),
  ], { segments: 24, color: new THREE.Color('#FFFFFF'), layer: 'quilt' });
  cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, PATCH.direction));

  const up = Y_AXIS.clone().addScaledVector(PATCH.direction, -PATCH.direction.y).normalize();
  const right = new THREE.Vector3().crossVectors(up, PATCH.direction);
  const p = cap.attributes.position, uv = cap.attributes.uv as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv.setXY(i, 0.5 + v.dot(right) / (2 * PATCH.radius), 0.5 + v.dot(up) / (2 * PATCH.radius));
  }
  return cap.scale(1, PATCH.squash, 1);
}

/** Torso from the waist to the shoulder yoke, centered on the chest, facing -Z. No legs. Groups: cloth, metal, mission patch. */
export function buildTorso(chest: THREE.Vector3) {
  const { fabric, bellows, metal, display, stripe } = SUIT_COLORS;
  const squashed = (geo: THREE.BufferGeometry) => geo.scale(1.2, 1, 0.9);
  const body = squashed(revolve([
    [0, -0.3, bellows, 'bellows'], [0.05, -0.298], [0.095, -0.289], [0.13, -0.274], [0.148, -0.255], [0.152, -0.235], [0.152, -0.215], [0.152, -0.215, fabric, 'quilt'],
    [0.155, -0.12], [0.17, 0], [0.175, 0.09], [0.168, 0.17], [0.15, 0.21], [0.12, 0.245], [0.09, 0.2615],
  ], { segments: 28, color: fabric, layer: 'quilt', circumference: 1.05 }));
  const neck = skin(projectAlong(squashed(revolve([[0.09, 0.2615], [0.08, 0.267], [0.055, 0.2735], [0.03, 0.2775], [0, 0.28]], { segments: 28, color: fabric, layer: 'quilt' })), 0, 1, 0), fabric, 'quilt');
  const collar = squashed(revolve(sharp([[0.112, 0.236], [0.112, 0.259], [0.109, 0.262], [0.09, 0.262]]), { segments: 24, color: metal, layer: 'quilt' }));

  const cloth = [body, neck];
  const hard = [collar];
  for (const side of [-1, 1]) {
    const axis = new THREE.Vector3(side * 0.35, -0.55, -0.75).normalize();
    const ball = revolve(sphereProfile(PATCH.ball, 12), { segments: 24, color: fabric, layer: 'quilt' })
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis))
      .scale(1, PATCH.squash, 1);
    cloth.push(at(ball, side * 0.19, 0.22, 0.02));
  }

  const depth = 0.04, front = chest.z - depth / 2 - 0.002;
  const part = (geo: THREE.BufferGeometry, x: number, y: number, z: number, color: THREE.Color, layer: Layer) => at(skin(geo, color, layer), x, y, z);
  const buttons: [number, THREE.Color][] = [[-0.04, stripe], [0, fabric], [0.04, bellows]];
  cloth.push(part(roundedBox(0.14, 0.095, depth, 0.006), chest.x, chest.y, chest.z, bellows, 'rubber'));
  cloth.push(part(roundedBox(0.075, 0.03, 0.006, 0.002), chest.x, chest.y + 0.02, front, display, 'rubber'));
  hard.push(part(roundedBox(0.083, 0.038, 0.004, 0.0015), chest.x, chest.y + 0.02, front + 0.0015, metal, 'quilt'));
  for (const [x, color] of buttons) {
    const button = (radius: number, height: number) => projectAlong(new THREE.CylinderGeometry(radius, radius, height, 8).rotateX(Math.PI / 2), 0, 0, 1);
    cloth.push(part(button(0.0085, 0.009), chest.x + x, chest.y - 0.018, front - 0.0005, color, 'rubber'));
    hard.push(part(button(0.0108, 0.006), chest.x + x, chest.y - 0.018, front + 0.001, metal, 'quilt'));
  }
  return mergeGroups([cloth, hard, [at(patchCap(), -0.19, 0.22, 0.02)]]);
}

const ARM = { upper: 24, fore: 28 };

/** Upper arm along +Y from the shoulder joint to the elbow joint, with the commander stripe and half of the elbow bellows. */
export function buildUpperArm(length: number) {
  const { fabric, bellows, stripe } = SUIT_COLORS;
  const e = length - 0.06;
  return revolve([
    [0.074, 0], [0.078, 0.04], [0.0765, 0.1], [0.0765, 0.1, stripe], [0.0745, 0.14], [0.0745, 0.14, fabric],
    [0.066, e - 0.005],
    ...convolutes(e, [0.072, 0.067, 0.0625], 0.06, 0.02).map(([r, y], i) => (i === 0 ? ([r, y, bellows, 'bellows'] as const) : ([r, y] as const))),
    ...dome(0.06, length, 1),
  ], { segments: ARM.upper, color: fabric, layer: 'quilt' });
}

/** Region of the forearm that grows when the hand is beyond reach; everything past it is shifted rigidly. */
const FOREARM_STRETCH = { from: 0.05, to: 0.21 } as const;

/** Forearm along +Y from the elbow joint to the wrist: bellows, tapered sleeve, then the metal disconnect ring (second group). */
export function buildForearm(length: number) {
  const { fabric, bellows, metal } = SUIT_COLORS;
  const cloth = revolve([
    ...dome(0.06, 0, -1).reverse().map(([r, y], i) => (i === 0 ? ([r, y, bellows, 'bellows'] as const) : ([r, y] as const))),
    ...convolutes(0, [0.0625, 0.067], 0.06, 0.02),
    [0.061, FOREARM_STRETCH.from, fabric, 'quilt'], [0.052, FOREARM_STRETCH.to], [0.052, length - 0.035],
  ], { segments: ARM.fore, color: fabric, layer: 'quilt' });
  weather(cloth, (p) => 0.45 * THREE.MathUtils.smoothstep(p.y, length * 0.3, length));

  const r = length - 0.048;
  const ring = revolve(sharp([
    [0.052, r], [0.0585, r], [0.0585, r + 0.006], [0.0545, r + 0.006], [0.0545, r + 0.011], [0.0605, r + 0.011], [0.0605, length], [0, length],
  ]), { segments: ARM.fore, color: metal, layer: 'quilt' });

  const geo = mergeGroups([[cloth], [ring]]);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  const lastAt = (y: number) => { let found = 0; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - y) < 1e-6 && Math.abs(p.getX(i)) < 1e-6) found = i; return found; };
  const { from, to } = FOREARM_STRETCH;
  geo.userData.uvBase = uv.array.slice();
  geo.userData.vSlope = (uv.getY(lastAt(to)) - uv.getY(lastAt(from))) / (to - from);
  return geo;
}

/** Moves the stretchable part of a forearm built by `buildForearm` so the wrist ends up `extra` meters further out; the texture follows so it is not stretched. */
export function stretchForearm(geo: THREE.BufferGeometry, base: Float32Array, extra: number) {
  const { from, to } = FOREARM_STRETCH;
  const k = extra / (to - from);
  const p = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  const uvBase = geo.userData.uvBase as Float32Array, slope = geo.userData.vSlope as number;
  for (let i = 0; i < p.count; i++) {
    const y = base[i * 3 + 1];
    const moved = y <= from ? y : y >= to ? y + extra : from + (y - from) * (1 + k);
    p.setY(i, moved);
    uv.setY(i, uvBase[i * 2 + 1] + (moved - y) * slope);
  }
  p.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeBoundingSphere();
}

/** Bellows ball that closes the cut between two HD arm pieces at an elbow or a wrist: a sphere of the given radius around the joint. */
export function buildJointBall(radius: number) {
  return revolve(sphereProfile(radius, 8), { segments: 16, color: SUIT_COLORS.bellows, layer: 'bellows' });
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

/** Finger along -Z from the origin: soft sleeve, then a rubber tip. */
function finger(width: number, length: number) {
  const { gloveBack, fingertip } = SUIT_COLORS;
  const radius = 0.0125, end = length + 0.01 - radius;
  return revolve([
    [0.0105, 0, gloveBack, 'fabric'], [radius, 0.02], [radius, end * 0.5], [radius, end - 0.008, fingertip, 'rubber'], [radius, end], ...dome(radius, end, 1, 3),
  ], { segments: 10, color: gloveBack, layer: 'fabric' }).rotateX(-Math.PI / 2).scale(width / (radius * 2), 1, 1);
}

/**
 * Pressurized glove in its own hand frame (see GLOVE_FROM_GRIP): palm center at the origin, fingers toward -Z,
 * thumb up, palm facing -X for the right hand; the left hand is its mirror image.
 */
export function buildGlove(side: 1 | -1) {
  const { gloveBack, glovePalm, fingertip, bellows } = SUIT_COLORS;
  const shade = (n: THREE.Vector3) => gloveBack.clone().lerp(glovePalm, THREE.MathUtils.smoothstep(-n.x, 0.25, 0.7));
  const layerOf = (n: THREE.Vector3): Layer => (n.x < -0.35 ? 'rubber' : 'fabric');

  const parts = [skin(roundedBox(PALM.t, PALM.w, PALM.l, 0.014, [2, 3, 3]), shade, layerOf, (TILE.rubber + TILE.fabric) / 2)];
  const front = -PALM.l / 2;
  FINGERS.forEach(({ y, w, len }) => {
    parts.push(curl(at(finger(w, len), 0, y, front + 0.004), front + 0.004, len, 0.4));
  });
  parts.push(at(skin(roundedBox(0.012, 0.095, 0.02, 0.004), bellows, 'rubber'), PALM.t / 2 + 0.003, 0, front + 0.012));

  const thumb = revolve([
    [0, 0, gloveBack, 'fabric'], [0.012, 0.003], [0.017, 0.012], [0.019, 0.025], [0.0185, 0.045], [0.0172, 0.053, fingertip, 'rubber'], [0.0162, 0.062], ...dome(0.0162, 0.062, 1, 3),
  ], { segments: 12, color: gloveBack, layer: 'fabric' });
  thumb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(-0.12, 0.5, -0.866).normalize()));
  parts.push(at(thumb, -0.008, 0.04, 0.012));

  const cuff = revolve([[0, 0], [0.036, 0], [0.047, 0.006], [0.052, 0.014], [0.052, 0.05], [0, 0.055]], { segments: 20, color: gloveBack, layer: 'fabric' }).rotateX(Math.PI / 2);
  parts.push(at(cuff, 0, 0, PALM.l / 2 - 0.01));

  const glove = weather(merge(parts), (p) => 0.08 + 0.5 * THREE.MathUtils.smoothstep(-p.z, 0.03, 0.15));
  return side === 1 ? glove : mirrorX(glove);
}
