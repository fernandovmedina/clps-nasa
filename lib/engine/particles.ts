import * as THREE from 'three';
import { lerp } from './util';

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; drag: number; lift: number;
  s0: number; s1: number; a: number;
  c0: [number, number, number]; c1: [number, number, number];
  age?: number;
}

/** GPU point sprites with per-particle size/colour/alpha (fire, smoke, dust, data packets). */
export class Particles {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private list: Required<Particle>[] = [];
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;

  constructor(private max: number, tex: THREE.Texture, additive: boolean) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    const attr = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('pcolor', attr(this.col, 3));
    geo.setAttribute('psize', attr(this.size, 1));
    geo.setAttribute('palpha', attr(this.alpha, 1));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float scale; varying vec3 vC; varying float vA;
        void main(){
          vC = pcolor; vA = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(psize * scale / max(-mv.z, 0.1), 512.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  get count() { return this.list.length; }

  emit(p: Particle) {
    if (this.list.length < this.max) { p.age = 0; this.list.push(p as Required<Particle>); }
  }

  clear() { this.list.length = 0; }

  update(dt: number, scale: number) {
    this.material.uniforms.scale.value = scale;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.age += dt;
      if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.lift * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (let i = 0; i < L.length; i++) {
      const p = L[i], t = p.age / p.life, j = i * 3;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.col[j] = lerp(p.c0[0], p.c1[0], t); this.col[j + 1] = lerp(p.c0[1], p.c1[1], t); this.col[j + 2] = lerp(p.c0[2], p.c1[2], t);
      this.size[i] = lerp(p.s0, p.s1, t);
      this.alpha[i] = p.a * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, L.length);
    for (const k of ['position', 'pcolor', 'psize', 'palpha']) g.attributes[k].needsUpdate = true;
  }
}

export function starField(count = 4000, radius = 150000) {
  const sp = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) { v.randomDirection().multiplyScalar(radius); sp.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 1, fog: false, depthWrite: false }));
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  return pts;
}
