import * as THREE from 'three';
import type { LunarApp } from '../engine/app';
import { UI, textLabel } from '../engine/panel';
import { starField } from '../engine/particles';
import { earthTexture, glowTexture, regolithTexture, solarCellTexture } from '../engine/textures';
import { disposeTree, seeded, smooth } from '../engine/util';
import { horizonAt, type SiteMetrics } from '../mission/scoring';
import { sampleTerrainHeight, terrainRoughness, type TerrainPatch } from '../mission/terrain';
import { Astronaut, astronautSpot, loadAstronaut, type AstronautMode } from './astronaut';
import { loadLanderModel } from './lander-model';
import { disposeObject } from './rocket-model';

const FAR_SIZE = 5200;
const NEAR_SIZE = 420;
const HORIZON_R = 2500;
const SKY_DIST = 30000;
const GROUND_COLOR = 0xc8c6c0;
const MOON_RADIUS_M = 1737400;
/** Diámetro angular real del disco solar (2 × 0.2666°), el del núcleo del sprite. */
export const SUN_CORE_DEG = 0.53;
const SUN_DIST = SKY_DIST * 1.5;
/** Luz de la Tierra sobre el regolito: débil y azulada, solo un relleno para que las caras sin Sol no queden negras. */
const EARTHSHINE_INTENSITY = 0.35, EARTHSHINE_COLOR = 0xa9c4ff;
const HORIZON_LABEL = 'Horizonte LOLA';
// Ganancia de Lommel-Seeliger: con 2 un Sol cenital y el ojo en el cenit dan el mismo brillo que Lambert (μ0 = μ = 1 → 1).
const LS_GAIN = 2.0;
// Cosmetic relief (small craters, the 9 m bumps) only exists where the near mesh can resolve it:
// it dies out before the near mesh ends, so the coarse far mesh meets it without a visible step.
const DETAIL_FADE_FROM = 120, DETAIL_FADE_TO = 190;
const FAR_SINK = 3;
const SHADOW_FADE_FROM = 70, SHADOW_FADE_TO = 190;
// The near mesh dissolves (screen-door) into the far one over this distance band from its centre.
const NEAR_DISSOLVE_FROM = 150, NEAR_DISSOLVE_TO = 205;

const LOMMEL_SEELIGER_GLSL = `
float lommelSeeliger( float mu0, float mu ) { return ${LS_GAIN.toFixed(2)} * mu0 / max( mu0 + mu, 0.02 ); }
`;
const LAMBERT_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';

/**
 * Cambia el difuso lambertiano (N·L) de RE_Direct_Physical por Lommel-Seeliger, μ0/(μ0+μ): el regolito
 * devuelve la luz hacia el Sol y con el Sol rasante una ladera plana sigue legible en vez de caer a ~0.
 * Falla si el trozo de three ya no tiene la línea esperada, para no dejar Lambert sin avisar tras una actualización.
 */
export function patchGroundLight(chunk: string): string {
  if (!chunk.includes(LAMBERT_DIFFUSE)) throw new Error('lights_physical_pars_fragment cambió: ya no está el difuso lambertiano de RE_Direct_Physical');
  return LOMMEL_SEELIGER_GLSL + chunk.replace(LAMBERT_DIFFUSE,
    'reflectedLight.directDiffuse += lommelSeeliger( dotNL, saturate( dot( geometryNormal, geometryViewDir ) ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );');
}

/** Etiqueta del contorno fantasma; `aboveHorizon` es negativo cuando el relieve tapa el cuerpo. */
export function earthOcclusionLabel(aboveHorizon: number) {
  return `Tierra tapada por el relieve · ${Math.abs(aboveHorizon).toFixed(1)}°`;
}

/* ---- seeded 2D Perlin noise ---- */
function perlin(rnd: () => number) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => { const u = h & 1 ? x : -x, v = h & 2 ? y : -y; return (h & 4 ? u + v : u - v) * 0.7; };
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
    const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
    return l1 + v * (l2 - l1);
  };
}

interface Crater { x: number; z: number; r: number; d: number; cosmetic: boolean }

/**
 * The local landing-site world shared by phases 3–5 (POV, landing, transmission):
 * real LOLA terrain where available (plus fine cosmetic detail - the real DEM is
 * ~39 m/px and can't show meter-scale bumps on its own), procedural terrain
 * elsewhere, a horizon ring built from the site's real horizon profile, Sun and
 * Earth placed at their computed azimuth/elevation, landing zone marker and lander.
 */
export class SurfaceWorld {
  readonly scene = new THREE.Scene();
  readonly lz: THREE.Vector3;               // landing zone centre (on the ground)
  readonly earthHoriz: THREE.Vector3;       // horizontal unit vector toward Earth
  readonly sunPos: THREE.Vector3; readonly earthPos: THREE.Vector3;
  readonly sunVisible: number; readonly earthVisible: boolean;
  readonly lzMarker = new THREE.Group();
  /** Far + near ground meshes, for the risk-marker aim raycast in pov.ts. */
  readonly groundMeshes: THREE.Mesh[] = [];
  readonly lander: THREE.Group;
  readonly dish: THREE.Object3D;
  readonly solarPanels: THREE.Mesh[] = [];
  /** Rugosidad (m) del DEM real en la zona, o null si el sitio no tiene terreno real. */
  readonly roughness: number | null;
  readonly horizonRing: THREE.Mesh;
  readonly horizonLine: THREE.Line;
  readonly horizonLabel: THREE.Sprite;
  readonly horizonLabelText = HORIZON_LABEL;
  /** Contorno de la Tierra cuando está sobre 0° pero bajo el horizonte LOLA. */
  readonly earthGhost: { group: THREE.Group; label: string } | null;
  readonly earthLight: THREE.DirectionalLight | null;
  readonly sunCore: THREE.Sprite;
  readonly stars = starField();
  private noise: (x: number, y: number) => number;
  private craters: Crater[] = [];
  private lzBase = 0;
  private readonly nearC: THREE.Vector2;
  private flatten = false;
  private beacon: THREE.Mesh;
  private readonly terrain: TerrainPatch | undefined;
  private hull: THREE.Group; private model: THREE.Group | null = null; private closed = false;
  private astronaut: Astronaut | null = null;
  private astronautAsk: { mode: AstronautMode; viewer: THREE.Vector3 } | null = null;

  constructor(readonly app: LunarApp, readonly m: SiteMetrics) {
    const rnd = seeded(m.site.id + '-terrain');
    this.noise = perlin(rnd);
    this.terrain = m.site.terrain;
    const sc = this.scene;
    sc.background = new THREE.Color(0x000002);
    sc.add(this.stars);

    // LZ 70 m ahead toward the Earth, so Earth sits above the LZ from the viewpoint
    const azE = m.earth.azimuth * Math.PI / 180;
    this.earthHoriz = new THREE.Vector3(Math.sin(azE), 0, -Math.cos(azE)).normalize();
    this.lz = this.earthHoriz.clone().multiplyScalar(70);
    this.nearC = new THREE.Vector2(this.lz.x * 0.5, this.lz.z * 0.5);

    // Craters: with real LOLA terrain, the macro shape (the actual hills/rims
    // that block Sun/Earth) already comes from the DEM - only add small
    // cosmetic ones for walking-surface detail. Without real terrain, keep
    // the original two size classes to shape the whole procedural landscape.
    const craterCount = this.terrain ? 70 : 140;
    for (let i = 0; i < craterCount; i++) {
      const big = !this.terrain && i < 70;
      const r = big ? 15 + Math.pow(rnd(), 2) * 260 : 2 + rnd() * 14;
      const spread = big ? 2400 : 260;
      const x = (rnd() * 2 - 1) * spread, z = (rnd() * 2 - 1) * spread;
      const dLz = Math.hypot(x - this.lz.x, z - this.lz.z), dO = Math.hypot(x, z);
      if (dLz < r * 1.4 + 26 || dO < r * 1.4 + 10) continue;
      this.craters.push({ x, z, r, d: r * (0.16 + rnd() * 0.08), cosmetic: !big });
    }
    this.lzBase = this.rawHeight(this.lz.x, this.lz.z);
    this.flatten = true;
    this.lz.y = this.heightAt(this.lz.x, this.lz.z);

    // terreno: malla lejana gruesa + malla cercana detallada alrededor del punto de vista y la zona de alunizaje.
    // Comparten un solo albedo (regolito procedural en mosaico) para que no se note la costura; el relieve lo da la luz.
    const tex = regolithTexture();
    const nearC = this.nearC;
    const far = this.terrainMesh(FAR_SIZE, 220, new THREE.Vector2(0, 0), tex, 140, FAR_SINK);
    const near = this.terrainMesh(NEAR_SIZE, 260, nearC, tex, 12, 0);
    near.castShadow = true; near.receiveShadow = true; far.receiveShadow = true;
    sc.add(far, near);
    this.groundMeshes.push(far, near);

    // La rugosidad sale del DEM crudo, antes del aplanado de la zona y sin el detalle cosmético.
    this.roughness = this.terrain ? terrainRoughness(this.terrain, this.lz.x, this.lz.z) : null;

    this.horizonRing = this.buildHorizonRing(tex);
    this.horizonLine = this.buildHorizonLine();
    sc.add(this.horizonRing, this.horizonLine);

    // Sun & Earth
    this.sunVisible = smooth(-0.27, 0.35, m.sun.aboveHorizon);
    this.earthVisible = m.earth.aboveHorizon > 0;
    const sunDir = m.sun.local.clone();
    const earthDir = m.earth.local.clone();
    this.sunPos = sunDir.clone().multiplyScalar(SUN_DIST);
    this.earthPos = earthDir.clone().multiplyScalar(SKY_DIST);

    const light = new THREE.DirectionalLight(0xfff6ea, 4.2 * this.sunVisible);
    light.position.set(nearC.x, 0, nearC.y).addScaledVector(sunDir, 1500);
    light.target.position.set(nearC.x, 0, nearC.y);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    const sh = light.shadow.camera as THREE.OrthographicCamera;
    sh.left = -230; sh.right = 230; sh.top = 230; sh.bottom = -230; sh.near = 10; sh.far = 4000;
    light.shadow.bias = -0.0004; light.shadow.normalBias = 0.6;
    sc.add(light, light.target);
    // Relleno mínimo para que lo que ni el Sol ni la Tierra tocan no sea negro puro; el earthshine real va aparte.
    sc.add(new THREE.HemisphereLight(0x9fb4d8, 0x1a1a1a, 0.08));
    if (this.earthVisible) {
      const earthLight = new THREE.DirectionalLight(EARTHSHINE_COLOR, EARTHSHINE_INTENSITY);
      earthLight.target.position.set(nearC.x, 0, nearC.y);
      earthLight.position.copy(earthLight.target.position).addScaledVector(earthDir, 1500);
      earthLight.castShadow = false;
      sc.add(earthLight, earthLight.target);
      this.earthLight = earthLight;
    } else {
      this.earthLight = null;
    }

    const glow = glowTexture();
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunGlow.position.copy(this.sunPos); sunGlow.scale.setScalar(SKY_DIST * 0.28);
    const sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunDisk.position.copy(this.sunPos); sunDisk.scale.setScalar(SUN_DIST * 2 * Math.tan(SUN_CORE_DEG * Math.PI / 360));
    this.sunCore = sunDisk;
    sc.add(sunGlow, sunDisk);

    const earth = new THREE.Mesh(new THREE.SphereGeometry(SKY_DIST * Math.tan(1.0 * Math.PI / 180), 64, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85 }));
    earth.position.copy(this.earthPos);
    earth.lookAt(0, 0, 0);
    const earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x6fa8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    earthGlow.position.copy(this.earthPos); earthGlow.scale.setScalar(SKY_DIST * 0.08);
    sc.add(earth, earthGlow);

    const lbl = (text: string, sub: string, dir: THREE.Vector3, color: string) => {
      const s = textLabel([{ text, size: 52, color, weight: 800, mono: true }, { text: sub, size: 34 }], 170);
      s.position.copy(dir).multiplyScalar(2200).add(new THREE.Vector3(0, -120, 0));
      return s;
    };
    this.earthGhost = m.earth.elevation > 0 && m.earth.aboveHorizon < 0 ? this.buildEarthGhost() : null;
    if (this.earthGhost) sc.add(this.earthGhost.group);
    this.horizonLabel = this.buildHorizonLabel();
    sc.add(this.horizonLabel);
    sc.add(lbl('SOL', `elev ${m.sun.elevation.toFixed(1)}° · az ${m.sun.azimuth.toFixed(0)}°`, sunDir, UI.sun));
    sc.add(lbl('TIERRA', `elev ${m.earth.elevation.toFixed(1)}° · az ${m.earth.azimuth.toFixed(0)}°`, earthDir, UI.earth));

    // landing zone marker following the terrain
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2, x = this.lz.x + Math.cos(a) * 20, z = this.lz.z + Math.sin(a) * 20;
      ringPts.push(new THREE.Vector3(x, this.heightAt(x, z) + 0.15, z));
    }
    const ringMat = new THREE.LineBasicMaterial({ color: 0x5cf2b0, transparent: true, opacity: 0.9 });
    this.lzMarker.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat));
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const pts = [-6, 6].map((k) => { const x = this.lz.x + dx * k, z = this.lz.z + dz * k; return new THREE.Vector3(x, this.heightAt(x, z) + 0.15, z); });
      this.lzMarker.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    }
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5cf2b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beacon.position.set(this.lz.x, this.lz.y + 30, this.lz.z);
    this.lzMarker.add(this.beacon);
    const lzLabel = textLabel([{ text: 'ZONA DE ALUNIZAJE', size: 40, color: UI.ok, weight: 800, mono: true }, { text: this.roughness === null ? 'Ø 40 m' : `Ø 40 m · rugosidad ${this.roughness.toFixed(2)} m`, size: 30 }], 14);
    lzLabel.position.set(this.lz.x, this.lz.y + 64, this.lz.z);
    this.lzMarker.add(lzLabel);
    sc.add(this.lzMarker);

    // lander (hidden until touchdown)
    const built = this.buildLander();
    this.lander = built.group; this.dish = built.dish; this.hull = built.hull;
    this.lander.position.copy(this.lz);
    this.lander.visible = false;
    sc.add(this.lander);
    loadLanderModel(this.hull).then((model) => {
      if (!model) return;
      if (this.closed) { disposeObject(model); return; }
      this.hull.removeFromParent(); disposeObject(this.hull);
      this.model = model; this.lander.add(model);
    });
    loadAstronaut().then((astronaut) => {
      if (!astronaut) return;
      if (this.closed) { astronaut.dispose(); return; }
      this.astronaut = astronaut; astronaut.root.visible = false; sc.add(astronaut.root);
      if (this.astronautAsk) this.showAstronaut(this.astronautAsk.mode, this.astronautAsk.viewer);
    });
  }

  /** Puts the astronaut by the lander, in view of `viewer`; asked before the model has loaded, it appears once it does. */
  showAstronaut(mode: AstronautMode, viewer: THREE.Vector3) {
    this.astronautAsk = { mode, viewer: viewer.clone() };
    const a = this.astronaut;
    if (!a) return;
    const horizontal = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z).normalize();
    const spot = astronautSpot(horizontal(this.sunPos), horizontal(viewer.clone().sub(this.lz)), this.earthHoriz);
    spot.x += this.lz.x; spot.z += this.lz.z; spot.y = this.heightAt(spot.x, spot.z);
    a.place(spot, viewer);
    a.setMode(mode); a.setPoint(0);
    a.root.visible = true;
  }
  hideAstronaut() { this.astronautAsk = null; if (this.astronaut) this.astronaut.root.visible = false; }
  pointAstronaut(amount: number) { this.astronaut?.setPoint(amount); }

  /* ----- height field ----- */
  private rawHeight(x: number, z: number) {
    const n = this.noise;
    const detail = 1 - smooth(DETAIL_FADE_FROM, DETAIL_FADE_TO, Math.hypot(x - this.nearC.x, z - this.nearC.y));
    let h: number;
    if (this.terrain) {
      // Real LOLA elevation (bilinear, ~39 m/px) + a small cosmetic detail
      // octave for walking-surface texture - NOT measured roughness, just
      // rendering fill-in below the DEM's own resolution.
      h = sampleTerrainHeight(this.terrain, x, z) + detail * 0.35 * fbm(n, x / 9 + 7, z / 9 + 3, 2);
    } else {
      const slopeK = this.m.site.slopeDeg / 6;
      h = slopeK * (55 * fbm(n, x / 800, z / 800, 4) + 6 * fbm(n, x / 90 + 31, z / 90 + 17, 3)) + detail * 0.45 * fbm(n, x / 9 + 7, z / 9 + 3, 2);
      h += 4.5 * Math.exp(-(x * x + z * z) / (2 * 22 * 22)); // small rise at the viewpoint
    }
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      const k = c.cosmetic ? detail : 1;
      if (d < 1) h -= k * c.d * (1 - d * d);
      else if (d < 1.5) h += k * c.d * 0.28 * (1 - (d - 1) / 0.5) ** 2;
    }
    return h;
  }
  heightAt(x: number, z: number) {
    const h = this.rawHeight(x, z);
    if (!this.flatten) return h;
    const w = 1 - smooth(18, 34, Math.hypot(x - this.lz.x, z - this.lz.z));
    return h + (this.lzBase - h) * w * 0.9;
  }

  private terrainMesh(size: number, segs: number, c: THREE.Vector2, tex: THREE.Texture, repeat: number, sink: number) {
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + c.x, z = pos.getZ(i) + c.y;
      const r = Math.hypot(x, z);
      pos.setXYZ(i, x, this.heightAt(x, z) - (r * r) / (2 * MOON_RADIUS_M), z); // caída real por la curvatura lunar: la máscara LOLA también la descuenta
    }
    geo.computeVertexNormals();
    if (sink) {
      // Tuck the far mesh under the near one, easing back to the true height before the near mesh ends.
      const edge = NEAR_SIZE / 2 - 4;
      for (let i = 0; i < pos.count; i++) {
        const d = Math.max(Math.abs(pos.getX(i) - this.nearC.x), Math.abs(pos.getZ(i) - this.nearC.y));
        pos.setY(i, pos.getY(i) - sink * (1 - smooth(edge - 36, edge, d)));
      }
    }
    const map = tex.clone(); map.needsUpdate = true; map.repeat.set(repeat, repeat);
    const mat = new THREE.MeshStandardMaterial({ map, color: GROUND_COLOR, roughness: 1, metalness: 0 });
    this.shadeGround(mat, !sink);
    if (sink) { mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 1; }
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Sombreado que comparten las dos mallas del suelo, para que nada cambie en su costura: luz de regolito
   * (Lommel-Seeliger) y sombras proyectadas que se desvanecen con la distancia a la zona (solo la malla cercana las
   * proyecta; más allá dejarían un escalón de brillo). La malla cercana además se disuelve en la lejana hacia su borde.
   */
  private shadeGround(mat: THREE.MeshStandardMaterial, dissolve: boolean) {
    const focus = this.nearC;
    mat.customProgramCacheKey = () => `ground-${dissolve ? 'near' : 'far'}`;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFocus = { value: focus };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      const lights = THREE.ShaderChunk.lights_fragment_begin.replace('directionalLightShadow.shadowIntensity', 'directionalLightShadow.shadowIntensity * shadowFade');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;\nuniform vec2 uFocus;')
        .replace('#include <lights_physical_pars_fragment>', patchGroundLight(THREE.ShaderChunk.lights_physical_pars_fragment))
        .replace('#include <clipping_planes_fragment>', dissolve ? `#include <clipping_planes_fragment>
        vec2 qEdge = abs( vGroundXZ - uFocus );
        if ( smoothstep( ${NEAR_DISSOLVE_FROM.toFixed(1)}, ${NEAR_DISSOLVE_TO.toFixed(1)}, max( qEdge.x, qEdge.y ) ) > fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;` : '#include <clipping_planes_fragment>')
        .replace('#include <lights_fragment_begin>', `
        float shadowFade = 1.0 - smoothstep( ${SHADOW_FADE_FROM.toFixed(1)}, ${SHADOW_FADE_TO.toFixed(1)}, distance( vGroundXZ, uFocus ) );
        ${lights}`);
    };
  }

  /** Falda del horizonte: su borde superior es la máscara LOLA tal cual, sin ruido ni recorte. */
  private buildHorizonRing(tex: THREE.Texture) {
    const N = this.horizonSteps, pos: number[] = [], uv: number[] = [], idx: number[] = [], nor: number[] = [];
    for (let i = 0; i <= N; i++) {
      const az = (i / N) * 360, a = az * Math.PI / 180;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const top = Math.tan(horizonAt(this.m.site, az) * Math.PI / 180) * HORIZON_R;
      pos.push(dx * HORIZON_R * 1.15, -260, dz * HORIZON_R * 1.15, dx * HORIZON_R, top, dz * HORIZON_R);
      // Normal radial hacia el centro: es la cara del cerro que mira al observador.
      nor.push(-dx, 0, -dz, -dx, 0, -dz);
      uv.push((i / N) * 45, 0, (i / N) * 45, 1);
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const t = tex.clone(); t.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: t, color: GROUND_COLOR, roughness: 1, side: THREE.DoubleSide });
    mat.customProgramCacheKey = () => 'ground-ring';
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', patchGroundLight(THREE.ShaderChunk.lights_physical_pars_fragment));
    };
    return new THREE.Mesh(g, mat);
  }

  private get horizonSteps() { return Math.round(360 / this.m.site.horizon.az_step_deg); }

  /** Línea fina y tenue sobre el borde superior de la falda: la silueta que la máscara LOLA dibuja. */
  private buildHorizonLine() {
    const r = HORIZON_R * 0.99, N = this.horizonSteps, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const az = (i / N) * 360, a = az * Math.PI / 180;
      pts.push(new THREE.Vector3(Math.sin(a) * r, Math.tan(horizonAt(this.m.site, az) * Math.PI / 180) * r, -Math.cos(a) * r));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xe9e5da, transparent: true, opacity: 0.35, fog: false }));
    line.renderOrder = 5;
    return line;
  }

  /** Etiqueta de la silueta, 20° al lado de la Tierra y 1.5° sobre la línea, donde no tapa nada. */
  private buildHorizonLabel() {
    const az = (this.m.earth.azimuth + 20) % 360, a = az * Math.PI / 180, r = HORIZON_R * 0.97;
    const label = textLabel([{ text: HORIZON_LABEL, size: 44, color: UI.dim, weight: 600 }], 520, 12);
    label.position.set(Math.sin(a) * r, Math.tan((horizonAt(this.m.site, az) + 1.5) * Math.PI / 180) * r, -Math.cos(a) * r);
    return label;
  }

  /** Circunferencia punteada de la Tierra (radio 1°) y su etiqueta, dibujadas por encima del relieve que la tapa. */
  private buildEarthGhost() {
    const group = new THREE.Group();
    const label = earthOcclusionLabel(this.m.earth.aboveHorizon);
    const dir = this.m.earth.local;
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(side).normalize();
    const radius = SKY_DIST * Math.tan(1.0 * Math.PI / 180), pts: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      pts.push(this.earthPos.clone().addScaledVector(side, Math.cos(t) * radius).addScaledVector(up, Math.sin(t) * radius));
    }
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: UI.earth, dashSize: radius * 0.12, gapSize: radius * 0.1, transparent: true, opacity: 0.9, depthTest: false, fog: false }));
    ring.computeLineDistances();
    ring.renderOrder = 20;
    const text = textLabel([{ text: label, size: 24, color: UI.earth, weight: 700 }], 900, 14);
    const el = (this.m.earth.elevation + 2.8) * Math.PI / 180, az = this.m.earth.azimuth * Math.PI / 180;
    text.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(2200);
    (text.material as THREE.SpriteMaterial).depthTest = false;
    text.renderOrder = 21;
    group.add(ring, text);
    return { group, label };
  }

  private buildLander() {
    const g = new THREE.Group(), hull = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 0.85, roughness: 0.35 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.5, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.4, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 2.2, 8), gold); body.position.y = 2.6;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 0.7, 8), grey); top.position.y = 4.05;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 0.9, 16, 1, true), dark); nozzle.position.y = 1.1;
    hull.add(body, top, nozzle);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.0, 8), grey);
      leg.position.set(Math.cos(a) * 2.3, 1.3, Math.sin(a) * 2.3);
      leg.lookAt(Math.cos(a) * 1.4, 2.6, Math.sin(a) * 1.4); leg.rotateX(Math.PI / 2);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 16), grey);
      foot.position.set(Math.cos(a) * 2.9, 0.06, Math.sin(a) * 2.9);
      hull.add(leg, foot);
    }
    g.add(hull);
    // vertical solar wings facing the Sun azimuth (the polar Sun is always near the horizon)
    const wings = new THREE.Group(); wings.position.y = 3.2;
    const cell = new THREE.MeshStandardMaterial({ map: solarCellTexture(), metalness: 0.6, roughness: 0.25, emissive: 0x2a4aa8, emissiveIntensity: 0 });
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), grey); arm.position.x = s * 2.2;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 0.05), cell); panel.position.x = s * 4.6;
      wings.add(arm, panel); this.solarPanels.push(panel);
    }
    const sunAz = this.m.sun.azimuth * Math.PI / 180;
    wings.lookAt(new THREE.Vector3(Math.sin(sunAz), 0, -Math.cos(sunAz)).multiplyScalar(1000).add(new THREE.Vector3(0, 3.2, 0)));
    g.add(wings);
    // high-gain antenna aimed at the Earth
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), grey); mast.position.y = 5.1;
    const dish = new THREE.Group(); dish.position.y = 5.9;
    // spherical cap: its concave side faces −Y; rotate so it faces +Z, then aim +Z at the Earth
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }));
    bowl.rotation.x = -Math.PI / 2; bowl.position.z = -0.9;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 8), grey);
    feed.rotation.x = Math.PI / 2; feed.position.z = 0.1;
    dish.add(bowl, feed);
    dish.lookAt(this.earthPos);
    g.add(mast, dish);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { group: g, dish, hull };
  }

  update(dt: number, t: number) {
    const camPos = new THREE.Vector3().setFromMatrixPosition(this.app.camera.matrixWorld);
    this.stars.position.copy(camPos);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.18 * Math.sin(t * 3);
    if (this.astronaut?.root.visible) this.astronaut.update(dt, camPos, this.earthPos);
  }

  dispose() {
    this.closed = true; disposeTree(this.scene);
    if (this.model) disposeObject(this.model);
    this.astronaut?.dispose();
  }
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, oct: number) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

/* ---- cache: phases 3–5 share one world per selected site ---- */
let cached: SurfaceWorld | null = null;
export function surfaceFor(app: LunarApp, m: SiteMetrics) {
  if (cached && cached.m.site.id === m.site.id && cached.app === app) return cached;
  cached?.dispose();
  cached = new SurfaceWorld(app, m);
  return cached;
}
export function clearSurface() { cached?.dispose(); cached = null; }
