import * as THREE from 'three';
import { Particles } from '../engine/particles';
import { clamp01, rand, smooth } from '../engine/util';

export interface ExhaustFrame {
  dt: number;
  t: number;
  ignited: boolean;
  thrust: number;
  alt: number;
  scale: number;
  rocket: THREE.Object3D;
  nozzles: THREE.Vector3[];
  back: THREE.Vector3;
  vel: THREE.Vector3;
}

const PLUME_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main(){
    vT = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const PLUME_FRAG = /* glsl */ `
  uniform float intensity; uniform float time; uniform vec3 core; uniform vec3 edge;
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main(){
    float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
    float along = pow(1.0 - vT, 1.3);
    float flick = 0.9 + 0.1 * sin(time * 58.0 + vT * 11.0) * sin(time * 37.0 + 1.7);
    vec3 col = mix(core, edge, smoothstep(0.0, 0.75, vT));
    gl_FragColor = vec4(col, rim * along * intensity * flick);
  }`;

function plumeGeometry() {
  const profile = [[0.02, 0], [0.8, 0], [1.05, 0.08], [1.25, 0.25], [1.15, 0.45], [0.85, 0.68], [0.45, 0.88], [0.02, 1]];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 20);
}

const noise = (t: number) => 0.5 * Math.sin(t * 41) + 0.3 * Math.sin(t * 67 + 1) + 0.2 * Math.sin(t * 113 + 2);

export class LaunchExhaust {
  readonly group = new THREE.Group();
  private flame: Particles;
  private smoke: Particles;
  private ground: Particles;
  private plume = new THREE.Group();
  private cones: THREE.Mesh<THREE.LatheGeometry, THREE.ShaderMaterial>[] = [];
  private halo: THREE.Sprite;
  private core: THREE.Sprite;
  private pool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(glow: THREE.Texture, private light: THREE.PointLight, padTop: number) {
    this.smoke = new Particles(1800, glow, false);
    this.ground = new Particles(1300, glow, false);
    this.flame = new Particles(2600, glow, true);
    this.smoke.points.renderOrder = 1; this.ground.points.renderOrder = 1; this.flame.points.renderOrder = 2;

    const geometry = plumeGeometry();
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: { intensity: { value: 0 }, time: { value: 0 }, core: { value: new THREE.Color(1, 0.9, 0.6) }, edge: { value: new THREE.Color(1, 0.4, 0.1) } },
        vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      cone.rotation.x = Math.PI; cone.renderOrder = 2; cone.frustumCulled = false; cone.visible = false;
      this.cones.push(cone); this.plume.add(cone);
    }

    const sprite = (color: number, depthTest: boolean) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest, blending: THREE.AdditiveBlending }));
      s.renderOrder = 3; s.visible = false;
      return s;
    };
    this.halo = sprite(0xff8a3c, false); this.core = sprite(0xfff1c8, true);

    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = padTop + 0.05; this.pool.renderOrder = 1; this.pool.visible = false;

    this.group.add(this.smoke.points, this.ground.points, this.flame.points, this.plume, this.halo, this.core, this.pool);
  }

  update(f: ExhaustFrame) {
    const { dt, t, thrust, alt, rocket, nozzles, back } = f;
    const flick = noise(t);
    this.plume.position.copy(rocket.position); this.plume.quaternion.copy(rocket.quaternion);
    this.emit(f);

    const k = clamp01(thrust);
    this.cones.forEach((cone, i) => {
      cone.visible = k > 0.02;
      if (!cone.visible) return;
      const big = i === 0;
      cone.position.copy(nozzles[i]!);
      const r = big ? 1 : 0.55, len = (big ? 22 : 14) * (0.35 + 0.65 * k) * (1 + 0.06 * flick);
      cone.scale.set(r, len, r);
      cone.material.uniforms.intensity!.value = k * (0.95 + 0.1 * flick);
      cone.material.uniforms.time!.value = t;
    });

    const base = nozzles[0]!.clone().applyMatrix4(rocket.matrixWorld);
    this.halo.visible = this.core.visible = k > 0.02;
    this.halo.position.copy(base).addScaledVector(back, 1.5);
    this.halo.scale.setScalar((8 + 14 * k) * (1 + 0.05 * flick));
    this.halo.material.opacity = 0.3 * k;
    this.core.position.copy(base).addScaledVector(back, 0.6);
    this.core.scale.setScalar((2.6 + 4 * k) * (1 + 0.08 * flick));
    this.core.material.opacity = 0.85 * k;

    const near = 1 - smooth(4, 70, alt);
    this.pool.visible = k > 0.02 && near > 0.01;
    this.pool.scale.setScalar(52 + 6 * flick);
    this.pool.material.opacity = 0.4 * k * near * (0.88 + 0.12 * flick);

    this.light.position.copy(rocket.position).addScaledVector(back, 3);
    this.light.intensity = thrust * 450 * (1 + 0.16 * flick) * (1 - smooth(200, 600, alt) * 0.9);

    this.flame.update(dt, f.scale); this.smoke.update(dt, f.scale); this.ground.update(dt, f.scale);
  }

  private emit(f: ExhaustFrame) {
    const { dt, thrust, alt, rocket, nozzles, back, vel } = f;
    if (thrust > 0.01) {
      const rate = thrust * 700 * dt;
      for (const nz of nozzles) {
        const w = nz.clone().applyMatrix4(rocket.matrixWorld);
        const big = nz.x === 0 ? 1 : 0.8;
        for (let i = 0, n = Math.floor(rate + Math.random()); i < n; i++) {
          const sp = (30 + Math.random() * 18) * (0.5 + 0.5 * thrust);
          this.flame.emit({
            x: w.x + rand(-0.25, 0.25), y: w.y + rand(-0.25, 0.25), z: w.z + rand(-0.25, 0.25),
            vx: back.x * sp + rand(-3, 3) + vel.x * 0.55, vy: back.y * sp + rand(-3, 3) + vel.y * 0.55, vz: back.z * sp + rand(-3, 3) + vel.z * 0.55,
            life: rand(0.18, 0.42) * (0.6 + 0.4 * thrust), drag: 1.5, lift: 0, s0: 2.2 * big, s1: 3.8 * big, a: 0.3,
            c0: [1, 0.93, 0.75], c1: [1, 0.32, 0.08],
          });
        }
      }
    }
    if (f.ignited && alt < 70) {
      const n = Math.floor(260 * clamp01(thrust * 1.4) * (1 - alt / 70) * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const along = Math.random() < 0.7, sx = Math.random() < 0.5 ? -1 : 1, ang = rand(0, Math.PI * 2), sp = rand(8, 24), g = rand(0.85, 1);
        const dx = along ? sx : Math.cos(ang), dz = along ? rand(-0.18, 0.18) : Math.sin(ang);
        this.ground.emit({
          x: dx * rand(3, 9), y: rand(0.9, 2.2), z: dz * rand(3, 9) + (along ? rand(-3, 3) : 0),
          vx: dx * sp, vy: rand(0, 1.2), vz: dz * sp,
          life: rand(7, 10), drag: 0.45, lift: 0.12, s0: 4, s1: rand(12, 20), a: 0.5,
          c0: [1, 0.82 * g, 0.62 * g], c1: [0.72, 0.7, 0.68],
        });
      }
    }
    if (alt > 6 && alt < 900 && thrust > 0.25) {
      const fade = 1 - smooth(300, 900, alt);
      const w = nozzles[0]!.clone().applyMatrix4(rocket.matrixWorld);
      for (let i = 0, n = Math.floor(90 * dt + Math.random()); i < n; i++) {
        const q = Math.random();
        this.smoke.emit({
          x: w.x - vel.x * dt * q, y: w.y - vel.y * dt * q, z: w.z - vel.z * dt * q,
          vx: back.x * 6 + rand(-1.5, 1.5), vy: back.y * 6 + rand(-1.5, 1.5), vz: back.z * 6 + rand(-1.5, 1.5),
          life: rand(2.5, 3.8), drag: 0.8, lift: 0.4, s0: 3, s1: rand(14, 22), a: 0.4 * fade,
          c0: [0.95, 0.9, 0.85], c1: [0.7, 0.72, 0.76],
        });
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
  }
}
