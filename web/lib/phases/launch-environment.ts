import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tryLoad } from '../engine/textures';
import { lerp, seeded, smooth } from '../engine/util';
import { disposeObject } from './rocket-model';

const PAD_R = 50;
const PAD_TOP = 0.6;
const GROUND_R = 1500;
const TILE = 40;
const GROUND_TILE = 320;
const PAD_TILE = 14;
const HORIZON_R = 9000;
const HORIZON_TOP = Math.tan((13 * Math.PI) / 180);
const HORIZON_BOTTOM = Math.tan((3 * Math.PI) / 180);
const TEXTURE_DIR = '/textures/launch/';
const ROAD_W = 9;

const UP = new THREE.Vector3(0, 1, 0);
const SHADOW_HALF = 58;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function texture(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rnd: () => number) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function wrapBlob(g: CanvasRenderingContext2D, size: number, x: number, y: number, r: number, color: string) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const cx = x + dx, cy = y + dy;
    if (cx < -r || cx > size + r || cy < -r || cy > size + r) continue;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
}

function groundTexture() {
  const S = 512, rnd = seeded('launch-ground');
  const [c, g] = canvas(S, S);
  g.fillStyle = '#8c9262'; g.fillRect(0, 0, S, S);
  const palette = ['rgba(176,170,114,.42)', 'rgba(112,128,76,.4)', 'rgba(198,180,126,.34)', 'rgba(92,108,62,.4)', 'rgba(150,146,98,.4)'];
  for (let i = 0; i < 150; i++) wrapBlob(g, S, rnd() * S, rnd() * S, 18 + rnd() * 80, palette[Math.floor(rnd() * palette.length)]!);
  speckle(g, S, S, 26, rnd);
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 3 + rnd() * 7;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(40,48,28,.22)' : 'rgba(190,176,120,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return texture(c, true);
}

function paintPadWear(g: CanvasRenderingContext2D, S: number, k: number, rnd: () => number) {
  const mid = S / 2, tw = 4.6 * k;
  g.fillStyle = '#292826'; g.fillRect(0, mid - tw, S, tw * 2);
  g.strokeStyle = 'rgba(176,172,162,.8)'; g.lineWidth = 5;
  g.strokeRect(-4, mid - tw, S + 8, tw * 2);
  const scorch = g.createRadialGradient(mid, mid, 0, mid, mid, 30 * k);
  scorch.addColorStop(0, 'rgba(22,20,18,.62)'); scorch.addColorStop(0.55, 'rgba(30,28,26,.3)'); scorch.addColorStop(1, 'rgba(30,28,26,0)');
  g.fillStyle = scorch; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = (6 + rnd() * 26) * k;
    wrapBlob(g, S, mid + Math.cos(a) * d, mid + Math.sin(a) * d, (1.5 + rnd() * 5) * k, 'rgba(26,24,22,.28)');
  }
}

function padTexture() {
  const S = 1024, k = S / (2 * PAD_R), rnd = seeded('launch-pad');
  const [c, g] = canvas(S, S);
  g.fillStyle = '#a2a098'; g.fillRect(0, 0, S, S);
  const slab = 6 * k;
  for (let x = 0; x < S; x += slab) for (let y = 0; y < S; y += slab) {
    const v = Math.round(110 + rnd() * 70);
    g.fillStyle = `rgba(${v},${v - 2},${v - 8},.16)`; g.fillRect(x, y, slab, slab);
  }
  for (let i = 0; i < 160; i++) wrapBlob(g, S, rnd() * S, rnd() * S, 12 + rnd() * 55, rnd() < 0.5 ? 'rgba(60,56,50,.1)' : 'rgba(210,206,196,.1)');
  speckle(g, S, S, 16, rnd);
  g.strokeStyle = 'rgba(58,56,52,.5)'; g.lineWidth = 1.6;
  for (let p = 0; p <= S; p += slab) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  paintPadWear(g, S, k, rnd);
  const mid = S / 2;
  g.lineWidth = 0.3 * k; g.strokeStyle = 'rgba(236,234,228,.7)';
  g.beginPath(); g.arc(mid, mid, 41 * k, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.3 * k; g.strokeStyle = 'rgba(222,176,52,.75)'; g.setLineDash([2 * k, 2 * k]);
  g.beginPath(); g.arc(mid, mid, 38.5 * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.lineWidth = 0.25 * k; g.strokeStyle = 'rgba(236,234,228,.55)';
  g.beginPath(); g.arc(mid, mid, 14 * k, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.beginPath(); g.moveTo(mid + Math.cos(a) * 14 * k, mid + Math.sin(a) * 14 * k); g.lineTo(mid + Math.cos(a) * 20 * k, mid + Math.sin(a) * 20 * k); g.stroke();
  }
  return texture(c);
}

/** Flame trench, scorch and soot over a transparent background, laid on top of the tiled concrete photo. */
function padWearTexture() {
  const S = 1024, k = S / (2 * PAD_R), rnd = seeded('launch-pad-wear'), [c, g] = canvas(S, S);
  for (let i = 0; i < 70; i++) wrapBlob(g, S, rnd() * S, rnd() * S, (2.5 + rnd() * 6) * k, rnd() < 0.7 ? `rgba(34,30,26,${0.08 + rnd() * 0.12})` : `rgba(214,210,200,${0.05 + rnd() * 0.07})`);
  paintPadWear(g, S, k, rnd);
  return texture(c);
}

function roadTexture() {
  const [c, g] = canvas(64, 256), rnd = seeded('launch-road');
  g.fillStyle = '#3c3e41'; g.fillRect(0, 0, 64, 256);
  speckle(g, 64, 256, 20, rnd);
  g.fillStyle = 'rgba(214,210,200,.75)'; g.fillRect(4, 0, 2, 256); g.fillRect(58, 0, 2, 256);
  g.fillStyle = 'rgba(226,186,60,.85)'; g.fillRect(31, 0, 2, 128);
  return texture(c, true);
}

const hash = (ix: number, iz: number) => { const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), u), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
const fbm = (x: number, z: number) => 0.55 * noise(x / 230, z / 230) + 0.3 * noise(x / 80, z / 80) + 0.15 * noise(x / 28, z / 28);

function groundGeometry(R: number) {
  const rings = 40, segs = 128, r0 = PAD_R - 1.5, r1 = GROUND_R;
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3), nor = new Float32Array(pos.length), uv = new Float32Array((rings + 1) * (segs + 1) * 2), col = new Float32Array(pos.length);
  const idx: number[] = [];
  const tint = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const r = r0 + (r1 - r0) * Math.pow(i / rings, 2.2);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = r * Math.cos(a), z = r * Math.sin(a);
      const y = Math.sqrt(R * R - r * r) - R + 0.15, v = i * (segs + 1) + j;
      pos.set([x, y, z], v * 3);
      nor.set([x / R, (y + R) / R, z / R], v * 3);
      uv.set([x / TILE, z / TILE], v * 2);
      const n = fbm(x, z), m = noise(x / 55 + 9, z / 55 - 4);
      const apron = 1 - smooth(PAD_R + 2, PAD_R + 60, r);
      tint.setRGB(lerp(0.9, 1.3, n), lerp(1.0, 1.08, n), lerp(0.86, 0.78, n));
      const shade = (0.8 + 0.4 * m) * (1 - apron * 0.32);
      col.set([tint.r * shade, tint.g * shade, tint.b * shade * (1 + apron * 0.12)], v * 3);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Lets distant ground dissolve into the sky haze instead of ending in a visible rim. */
function fadeWithDistance(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(fogFar * 0.4, fogFar * 1.0, vFogDepth);');
}

function roadGeometry(R: number, angleDeg: number, from: number, to: number) {
  const a = (angleDeg * Math.PI) / 180, dx = Math.cos(a), dz = Math.sin(a), n = 48;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = from + ((to - from) * i) / n;
    for (const side of [-1, 1]) {
      const x = dx * d - dz * side * (ROAD_W / 2), z = dz * d + dx * side * (ROAD_W / 2);
      const h = Math.hypot(x, z), y = Math.sqrt(R * R - h * h) - R + 0.3;
      pos.push(x, y, z); nor.push(x / R, (y + R) / R, z / R); uv.push(side < 0 ? 0 : 1, d / 14);
    }
    if (i < n) { const v = i * 2; idx.push(v, v + 1, v + 3, v, v + 3, v + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

class Parts {
  private list: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    return this.push(new THREE.BoxGeometry(w, h, d), x, y, z, color);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 12) {
    return this.push(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, color);
  }
  sphere(r: number, x: number, y: number, z: number, color: number) {
    return this.push(new THREE.SphereGeometry(r, 10, 8), x, y, z, color);
  }
  private push(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number) {
    g.translate(x, y, z);
    const c = new THREE.Color(color), n = g.attributes.position!.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.list.push(g);
    return this;
  }
  build() {
    const merged = mergeGeometries(this.list)!;
    for (const g of this.list) g.dispose();
    return merged;
  }
}

function structures() {
  const p = new Parts();
  for (const sx of [-1, 1]) p.box(3.2, 2.6, 3, sx * 5.2, 1.9, 4.4, 0xb0ada4).box(3.2, 2.6, 3.6, sx * 5.2, 1.9, -5.2, 0xb0ada4);
  p.box(4.4, 0.9, 13.1, -4.8, 3.35, -1.05, 0x7b7d80).box(4.4, 0.9, 13.1, 4.8, 3.35, -1.05, 0x7b7d80);
  p.box(5.2, 0.9, 2.9, 0, 3.35, 4.05, 0x7b7d80).box(5.2, 0.9, 5, 0, 3.35, -5.1, 0x7b7d80);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(1, 0.5, 1, sx * 2.25, 4.05, sz * 2.25, 0x34383e);
  p.box(18, 7, 12, -34, 4.1, -14, 0xc3c0b6).box(10, 3, 8, -34, 8.6, -14, 0x8c8f93);
  return p.build();
}

function lattice() {
  const mats: THREE.Matrix4[] = [], cols: number[] = [];
  const strut = (a: THREE.Vector3, b: THREE.Vector3, th: number, color: number) => {
    const d = b.clone().sub(a), len = d.length();
    mats.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(th, len, th)));
    cols.push(color);
  };
  const slab = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
    cols.push(color);
  };
  const cx = 0.41, cz = -4.64, w = 3.4, y0 = 3.8, bays = 10, bay = 2.45, y = (k: number) => y0 + k * bay;
  const corner = (i: number, h: number) => new THREE.Vector3(cx + (i === 1 || i === 2 ? w / 2 : -w / 2), h, cz + (i >= 2 ? w / 2 : -w / 2));
  for (let i = 0; i < 4; i++) strut(corner(i, y(0)), corner(i, y(bays)), 0.26, 0xb4472d);
  for (let k = 0; k <= bays; k++) for (let i = 0; i < 4; i++) strut(corner(i, y(k)), corner((i + 1) % 4, y(k)), 0.14, 0xc9ccd1);
  for (let k = 0; k < bays; k++) for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, up = k % 2 === 0;
    strut(corner(up ? i : j, y(k)), corner(up ? j : i, y(k + 1)), 0.11, 0xdadde1);
  }
  for (const k of [3, 6, 9]) slab(cx, y(k), cz, w + 0.7, 0.14, w + 0.7, 0x5b6068);
  strut(new THREE.Vector3(cx, y(bays), cz), new THREE.Vector3(cx, y(bays) + 0.9, cz), 0.1, 0xdadde1);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45 }), mats.length);
  const c = new THREE.Color();
  mats.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.set(cols[i]!)); });
  mesh.computeBoundingSphere();
  return mesh;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze; uniform vec3 space; uniform vec3 sunDir;
  uniform float day; uniform float ridge;
  varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    vec3 hor = mix(space, horizon, day);
    vec3 zen = mix(space, zenith, day * day);
    vec3 mid = mix(space, haze, day);
    float h = max(d.y, 0.0);
    vec3 col = mix(mix(hor, mid, clamp(h / 0.225, 0.0, 1.0)), zen, pow(clamp((h - 0.225) / 0.775, 0.0, 1.0), 0.55));
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.62, 0.34) * (pow(s, 5.0) * 0.2 + pow(s, 48.0) * 0.5) * day;
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9998, 0.99995, s) * 6.0 * day;
    float az = atan(d.x, d.z);
    float ridgeFar = 0.02 + 0.016 * (1.0 - abs(sin(az * 3.0 + 0.6))) + 0.009 * (1.0 - abs(sin(az * 8.0 + 2.1))) + 0.004 * (1.0 - abs(sin(az * 19.0 + 0.3)));
    float ridgeNear = 0.008 + 0.009 * (1.0 - abs(sin(az * 5.0 + 1.9))) + 0.005 * (1.0 - abs(sin(az * 13.0 + 0.7))) + 0.002 * sin(az * 31.0);
    col = mix(col, hor * vec3(0.84, 0.9, 0.96), ridge * (1.0 - smoothstep(ridgeFar - 0.002, ridgeFar, d.y)));
    col = mix(col, hor * vec3(0.64, 0.72, 0.76), ridge * (1.0 - smoothstep(ridgeNear - 0.002, ridgeNear, d.y)));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class LaunchEnvironment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly horizon = new THREE.Color();
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private fading: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private horizonDay = new THREE.Color().setRGB(146 / 255, 157 / 255, 170 / 255, THREE.SRGBColorSpace);
  private hazeDay = new THREE.Color().setRGB(128 / 255, 164 / 255, 195 / 255, THREE.SRGBColorSpace);
  private space = new THREE.Color(0x000004);
  private textures: THREE.Texture[] = [];
  private tower: THREE.InstancedMesh;
  private loadedTower: THREE.Object3D | null = null;
  private groundMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private padMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private horizonRig = new THREE.Group();
  private horizonBand: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null = null;
  private horizonDip0 = 0;
  private closed = false;

  /** `axisYaw` turns the horizon photo so its mirror axes fall to the sides of the first view. */
  constructor(private earthR: number, sunDir: THREE.Vector3, anisotropy: number, private axisYaw: number) {
    const g = this.group;
    this.horizonDip0 = Math.acos(earthR / (earthR + 9));
    this.horizon.copy(this.horizonDay);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(100000, 32, 16), new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(0x2a6fd0) }, horizon: { value: this.horizonDay }, haze: { value: this.hazeDay }, space: { value: this.space },
        sunDir: { value: sunDir }, day: { value: 1 }, ridge: { value: 1 },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    g.add(this.sky);

    const ground = new THREE.Mesh(groundGeometry(earthR), new THREE.MeshStandardMaterial({
      map: this.track(groundTexture()), vertexColors: true, roughness: 1, metalness: 0, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    ground.material.onBeforeCompile = fadeWithDistance;
    ground.material.customProgramCacheKey = () => 'launch-ground-fade';
    ground.receiveShadow = true;
    const roads = new THREE.Mesh(mergeGeometries([roadGeometry(earthR, 202, PAD_R + 1, 1000), roadGeometry(earthR, 340, PAD_R + 1, 800)])!, new THREE.MeshStandardMaterial({
      map: this.track(roadTexture()), roughness: 0.95, metalness: 0, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }));
    roads.material.onBeforeCompile = fadeWithDistance;
    roads.material.customProgramCacheKey = () => 'launch-road-fade';
    roads.receiveShadow = true;
    this.groundMesh = ground;
    this.fading.push(ground, roads);
    g.add(ground, roads);

    const pad = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 96), new THREE.MeshStandardMaterial({ map: this.track(padTexture()), roughness: 0.92, metalness: 0 }));
    this.padMesh = pad;
    pad.rotation.x = -Math.PI / 2; pad.position.y = PAD_TOP; pad.receiveShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R, PAD_R + 3, 0.9, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.95, metalness: 0 }));
    skirt.position.y = 0.15; skirt.receiveShadow = true;
    g.add(pad, skirt);

    const arch = new THREE.Mesh(structures(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.2 }));
    arch.castShadow = arch.receiveShadow = true;
    const tower = this.tower = lattice();
    tower.castShadow = tower.receiveShadow = true;
    g.add(arch, tower);

    const sun = new THREE.DirectionalLight(0xffe4c4, 3.4);
    sun.position.copy(sunDir).multiplyScalar(260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF; sc.near = 120; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
    this.sun = sun;
    g.add(sun, sun.target, this.horizonRig);
    this.loadPhotos(anisotropy);
  }

  private loadPhotos(anisotropy: number) {
    const load = (name: string, apply: (t: THREE.Texture) => void) => tryLoad(`${TEXTURE_DIR}${name}.webp`).then((t) => {
      if (!t) return;
      if (this.closed) { t.dispose(); return; }
      t.anisotropy = anisotropy;
      apply(this.track(t));
    });
    load('horizon-360', (t) => this.setHorizon(t));
    load('ground-scrub', (t) => this.setGround(t));
    load('pad-concrete', (t) => this.setPad(t));
  }

  private setHorizon(t: THREE.Texture) {
    const geometry = new THREE.CylinderGeometry(HORIZON_R, HORIZON_R, HORIZON_R * (HORIZON_TOP + HORIZON_BOTTOM), 128, 1, true);
    const band = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }));
    band.position.y = (HORIZON_R * (HORIZON_TOP - HORIZON_BOTTOM)) / 2; band.rotation.y = this.axisYaw;
    band.renderOrder = -9; band.frustumCulled = false;
    this.horizonRig.add(band);
    this.horizonBand = band;
  }

  private setGround(t: THREE.Texture) {
    const mat = this.groundMesh.material;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(TILE / GROUND_TILE);
    mat.map?.dispose(); mat.map = t;
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, texture2D(map, vMapUv.yx * 2.9 + vec2(0.37, 0.61)).rgb, 0.5);
        diffuseColor *= sampledDiffuseColor;`);
      fadeWithDistance(shader);
    };
    mat.customProgramCacheKey = () => 'launch-ground-photo';
    mat.needsUpdate = true;
  }

  private setPad(t: THREE.Texture) {
    const mat = this.padMesh.material, repeat = (2 * PAD_R) / PAD_TILE, wear = this.track(padWearTexture());
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(repeat);
    mat.map?.dispose(); mat.map = t;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.wearMap = { value: wear }; shader.uniforms.tiles = { value: repeat };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D wearMap; uniform float tiles;')
        .replace('#include <map_fragment>', `
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          vec2 slab = floor(vMapUv);
          sampledDiffuseColor.rgb *= 0.84 + 0.32 * fract(sin(dot(slab, vec2(12.9898, 78.233))) * 43758.5453);
          vec4 wear = texture2D(wearMap, vMapUv / tiles);
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, wear.rgb, wear.a);
          diffuseColor *= sampledDiffuseColor;`);
    };
    mat.customProgramCacheKey = () => 'launch-pad-photo';
    mat.needsUpdate = true;
  }

  private track<T extends THREE.Texture>(t: T) { this.textures.push(t); return t; }

  /** Swaps the stand-in lattice for the model of the tower. */
  setTower(model: THREE.Object3D) {
    this.tower.removeFromParent(); this.tower.geometry.dispose(); (this.tower.material as THREE.Material).dispose(); this.tower.dispose();
    this.loadedTower = model;
    this.group.add(model);
  }

  /** `sky` is the 0 (ground) → 1 (space) altitude blend; `alt` in scene units. */
  update(cam: THREE.Vector3, alt: number, sky: number, xr: boolean) {
    this.sky.position.copy(cam);
    const u = this.sky.material.uniforms;
    u.day!.value = 1 - sky;
    u.ridge!.value = this.horizonBand ? 0 : 1 - smooth(4, 90, alt);
    this.horizon.copy(this.space).lerp(this.horizonDay, 1 - sky);
    const fade = 1 - smooth(250, 900, alt);
    for (const m of this.fading) { m.material.opacity = fade; m.visible = fade > 0.01; }
    this.sun.castShadow = !xr;

    const band = this.horizonBand;
    if (band) {
      const dip = Math.acos(this.earthR / (this.earthR + Math.max(cam.y, 0)));
      this.horizonRig.position.set(cam.x, cam.y - HORIZON_R * Math.tan(Math.min(dip - this.horizonDip0, 0.7)), cam.z);
      band.material.opacity = 1 - sky; band.visible = sky < 0.99;
    }
  }

  dispose() {
    this.closed = true;
    this.group.removeFromParent();
    if (this.loadedTower) disposeObject(this.loadedTower);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
    for (const t of this.textures) t.dispose();
    this.sun.dispose();
  }
}

/** Low-poly stand-in for the rocket in the shadow pass: the detailed model is too heavy to draw twice. */
export function rocketShadowProxy(height: number, radius: number) {
  const parts = new Parts();
  const body = height * 0.72;
  parts.cyl(radius, radius, body, 0, body / 2, 0, 0xffffff, 12).cyl(radius * 0.12, radius, height - body, 0, body + (height - body) / 2, 0, 0xffffff, 12);
  const mesh = new THREE.Mesh(parts.build(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  mesh.castShadow = true; mesh.frustumCulled = false;
  return mesh;
}
