import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import type { EphemerisFile, HorizonFile, SitesFile, TerrainInfo } from '@touchdown/core';
import { trackFromFile } from '@touchdown/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '../engine/app';
import { evaluateSites, horizonAt, type SiteMetrics } from '../mission/scoring';
import type { SiteInput } from '../mission/sites';
import { decodeTerrainPatch, terrainRoughness, type TerrainPatch } from '../mission/terrain';
import { palette } from '../ui/palette';
import { SurfaceWorld, SUN_CORE_DEG, earthOcclusionLabel, horizonName, patchGroundLight } from './surface-world';

// El modelo del módulo y el astronauta se descargan por red: aquí no aportan nada a la geometría.
vi.mock('./lander-model', () => ({ loadLanderModel: async () => null }));
vi.mock('./astronaut', async (original) => ({ ...(await original<typeof import('./astronaut')>()), loadAstronaut: async () => null }));

// vitest corre desde web/
const PUBLIC = join(process.cwd(), 'public') + '/';
const json = <T,>(path: string) => JSON.parse(readFileSync(PUBLIC + path, 'utf8')) as T;
const LANDING = new Date('2027-01-10T00:00:00Z');

/** Contexto 2D de mentira: jsdom no trae canvas y las etiquetas y texturas lo piden al construirse. */
function fakeCtx(): CanvasRenderingContext2D {
  const data = new Uint8ClampedArray(512 * 512 * 4);
  const fn: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === 'data' ? data : fn),
    set: () => true,
    apply: () => fn,
  });
  return fn as CanvasRenderingContext2D;
}

/** Lo que se pintó en cada lienzo: la prueba lee de ahí los colores de las fichas, sin leer píxeles. */
interface CanvasLog { fills: string[]; strokes: string[]; texts: { text: string; color: string }[] }
const canvasLogs = new Map<unknown, CanvasLog & { ctx: CanvasRenderingContext2D }>();
beforeEach(() => {
  canvasLogs.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const known = canvasLogs.get(this);
    if (known) return known.ctx as never;
    const base = fakeCtx() as unknown as Record<string | symbol, unknown>;
    const log = { fills: [] as string[], strokes: [] as string[], texts: [] as { text: string; color: string }[], ctx: null as unknown as CanvasRenderingContext2D };
    let fill = '';
    log.ctx = new Proxy(base, {
      get: (t, key) => (key === 'measureText' ? (s: string) => ({ width: s.length * 14 })
        : key === 'fillText' ? (text: string) => log.texts.push({ text, color: fill })
        : key === 'fillStyle' ? fill : t[key]),
      set: (_t, key, value) => {
        if (key === 'fillStyle') { if (typeof value === 'string') { fill = value; log.fills.push(fill); } }
        if (key === 'strokeStyle' && typeof value === 'string') log.strokes.push(value);
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    canvasLogs.set(this, log);
    return log.ctx as never;
  });
});
afterEach(() => vi.restoreAllMocks());
const logOf = (sprite: THREE.Sprite) => canvasLogs.get((sprite.material.map as THREE.CanvasTexture).image)!;
const DARK = /^rgba?\(\s*20\s*,\s*20\s*,\s*19/;

const catalog = json<SitesFile>('data/sites.json');
const terrains = json<Record<string, TerrainInfo>>('data/terrains.json');

/** Un sitio como lo arma loadMissionData, pero con los archivos reales leídos con fs. */
function loadSite(id: string): SiteInput {
  const s = catalog.sites.find((x) => x.id === id)!;
  let terrain: TerrainPatch | undefined;
  if (s.has_terrain) {
    const buf = readFileSync(PUBLIC + `static/terrain/${id}.raw`);
    terrain = decodeTerrainPatch(terrains[id]!, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
  }
  return {
    id, name: s.name, lat: s.lat, lon: s.lon, elevationKm: s.elevation_m / 1000, slopeDeg: 6.5,
    track: trackFromFile(json<EphemerisFile>(`data/ephemeris/${id}.json`)),
    horizon: json<HorizonFile>(`data/horizons/${id}.json`),
    hasTerrain: s.has_terrain, horizonSource: s.horizon_source, ephemerisSource: s.ephemeris_source, terrain,
  };
}

function metricsFor(id: string): SiteMetrics {
  return evaluateSites([loadSite(id)], LANDING)[0]!;
}

const fakeApp = { camera: new THREE.PerspectiveCamera(), eyeHeight: 1.6 } as unknown as LunarApp;
const built: SurfaceWorld[] = [];
function worldFor(id: string) {
  const w = new SurfaceWorld(fakeApp, metricsFor(id));
  built.push(w);
  return w;
}
afterEach(() => { while (built.length) built.pop()!.dispose(); });

/** Elevación (°) del rayo más alto que aún toca la malla, desde el ojo, hacia el azimut dado. */
function highestHit(world: SurfaceWorld, mesh: THREE.Mesh, azDeg: number) {
  mesh.updateMatrixWorld(true);
  const eye = new THREE.Vector3(0, world.heightAt(0, 0) + world.app.eyeHeight, 0);
  const az = azDeg * Math.PI / 180;
  const ray = new THREE.Raycaster(eye, new THREE.Vector3(), 0.1, 20000);
  const hits = (elDeg: number) => {
    const el = elDeg * Math.PI / 180;
    ray.set(eye, new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)));
    return ray.intersectObject(mesh, false).length > 0;
  };
  let el = 14;
  while (el > -3 && !hits(el)) el -= 0.1;
  for (let fine = el + 0.1; fine > el; fine -= 0.01) if (hits(fine)) return fine;
  return el;
}

describe('malla lejana del terreno real', () => {
  it('T1: el cerro de Nobile Rim 2 sube hasta lo que dice la máscara LOLA hacia la Tierra (±0.5°)', () => {
    const world = worldFor('nobile-rim-2');
    const az = world.m.earth.azimuth;
    expect(az).toBeGreaterThan(295); expect(az).toBeLessThan(297);
    const mask = horizonAt(world.m.site, az);
    const far = world.groundMeshes[0]!;
    expect(highestHit(world, far, az)).toBeCloseTo(mask, 0);
    expect(Math.abs(highestHit(world, far, az) - mask)).toBeLessThanOrEqual(0.5);
  }, 60_000);

  it('la malla nunca sube más de 0.5° por encima de la máscara en ningún azimut', () => {
    const world = worldFor('nobile-rim-2');
    const far = world.groundMeshes[0]!;
    for (let az = 0; az < 360; az += 30) {
      expect(highestHit(world, far, az) - horizonAt(world.m.site, az)).toBeLessThanOrEqual(0.5);
    }
  }, 120_000);
});

describe('contorno fantasma de la Tierra', () => {
  it('T2: en Nobile Rim 2 la Tierra está sobre 0° pero bajo el horizonte LOLA y se dibuja su contorno con la cifra calculada', () => {
    const world = worldFor('nobile-rim-2');
    const { earth } = world.m;
    expect(earth.elevation).toBeGreaterThan(0);
    expect(earth.aboveHorizon).toBeLessThan(0);
    const ghost = world.earthGhost;
    expect(ghost).not.toBeNull();
    // el contorno solo aparece en la vista del sitio: nace oculto y pov.ts lo enciende al entrar
    expect(ghost!.group.visible).toBe(false);
    world.setSiteViewLabels(true);
    expect(ghost!.group.visible).toBe(true);
    world.setSiteViewLabels(false);
    expect(ghost!.group.visible).toBe(false);
    expect(ghost!.label).toBe(`Tierra tapada por el relieve · ${(-earth.aboveHorizon).toFixed(1)}°`);
    expect(ghost!.label).toBe('Tierra tapada por el relieve · 5.7°');
    const lines = ghost!.group.children.filter((o) => (o as THREE.Line).isLine);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const mat = (line as THREE.Line).material as THREE.LineBasicMaterial;
      expect(mat.depthTest).toBe(false);
    }
  });

  it('no hay contorno cuando la Tierra se ve, ni cuando está bajo el horizonte geométrico', () => {
    for (const id of ['malapert-a', 'mons-mouton', 'malapert-massif', 'shackleton-ridge', 'nobile-rim-1', 'nobile-rim-2']) {
      const world = worldFor(id);
      const hidden = world.m.earth.elevation > 0 && world.m.earth.aboveHorizon < 0;
      expect(world.earthGhost !== null, id).toBe(hidden);
    }
    expect(worldFor('shackleton-ridge').m.earth.elevation).toBeLessThan(0);
  }, 60_000);

  it('el texto sale de la cifra, con un decimal', () => {
    expect(earthOcclusionLabel(-5.69)).toBe('Tierra tapada por el relieve · 5.7°');
    expect(earthOcclusionLabel(-0.04)).toBe('Tierra tapada por el relieve · 0.0°');
  });
});

describe('luz del regolito', () => {
  it('Lommel-Seeliger reemplaza al difuso lambertiano en el trozo de three, y falla ruidosamente si el trozo cambia', () => {
    const original = THREE.ShaderChunk.lights_physical_pars_fragment;
    const patched = patchGroundLight(original);
    expect(patched).not.toBe(original);
    expect(patched).toContain('lommelSeeliger');
    expect(patched).toMatch(/directDiffuse \+= lommelSeeliger\(/);
    expect(patched).not.toMatch(/\.directDiffuse \+= irradiance \* BRDF_Lambert/);
    expect(() => patchGroundLight('void RE_Direct_Physical() {}')).toThrow(/lights_physical_pars_fragment/);
  });

  it('el suelo y el anillo usan material con ese parche, y cada uno su propia llave de programa', () => {
    const world = worldFor('nobile-rim-2');
    const keys = new Set<string>();
    for (const mesh of [...world.groundMeshes, world.horizonRing]) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <lights_physical_pars_fragment>\n#include <lights_fragment_begin>\n#include <map_fragment>' } as unknown as THREE.WebGLProgramParametersWithUniforms;
      mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('lommelSeeliger');
      expect(shader.fragmentShader).not.toContain('#include <lights_physical_pars_fragment>');
      keys.add(mat.customProgramCacheKey());
    }
    expect(keys.size).toBe(3);
  });

  it('el anillo del horizonte lleva normales radiales hacia el centro, no hacia arriba', () => {
    const ring = worldFor('nobile-rim-2').horizonRing;
    const pos = ring.geometry.attributes.position as THREE.BufferAttribute;
    const nor = ring.geometry.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 17) {
      expect(nor.getY(i)).toBeCloseTo(0, 6);
      const radial = new THREE.Vector2(pos.getX(i), pos.getZ(i)).normalize();
      expect(nor.getX(i) * radial.x + nor.getZ(i) * radial.y).toBeCloseTo(-1, 5);
    }
  });
});

describe('earthshine', () => {
  it('es una luz direccional débil, azulada y sin sombras, solo si la Tierra está sobre el horizonte', () => {
    const hidden = worldFor('nobile-rim-2');
    expect(hidden.earthLight).toBeNull();
    const visible = ['malapert-a', 'mons-mouton', 'malapert-massif', 'nobile-rim-1'].map(worldFor).find((w) => w.earthVisible);
    expect(visible, 'algún sitio con Tierra visible el 2027-01-10').toBeDefined();
    const light = visible!.earthLight!;
    expect(light).toBeInstanceOf(THREE.DirectionalLight);
    expect(light.castShadow).toBe(false);
    expect(light.intensity).toBeGreaterThan(0);
    expect(light.intensity).toBeLessThan(1);
    expect(light.color.b).toBeGreaterThan(light.color.r);
    const toEarth = light.position.clone().sub(light.target.position).normalize();
    expect(toEarth.distanceTo(visible!.m.earth.local)).toBeLessThan(1e-6);
    const hemisphere = visible!.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined;
    expect(hemisphere ? hemisphere.intensity : 0).toBeLessThanOrEqual(0.08);
  });
});

describe('horizonte LOLA', () => {
  it('el perfil del anillo es la máscara tal cual: sin ruido inventado ni recorte a −1.5°', () => {
    for (const id of ['nobile-rim-2', 'shackleton-ridge']) {
      const world = worldFor(id);
      const pos = world.horizonRing.geometry.attributes.position as THREE.BufferAttribute;
      const R = Math.hypot(pos.getX(1), pos.getZ(1));
      let lowest = Infinity;
      for (let i = 0; i < pos.count / 2; i += 7) {
        const az = (i / (pos.count / 2 - 1)) * 360;
        const seen = Math.atan2(pos.getY(i * 2 + 1), R) * 180 / Math.PI;
        expect(seen, `${id} az ${az.toFixed(0)}`).toBeCloseTo(horizonAt(world.m.site, az), 4);
        lowest = Math.min(lowest, seen);
      }
      if (id === 'shackleton-ridge') expect(lowest).toBeLessThan(-1.6);
    }
  });

  it('una línea fina y tenue marca el borde superior del anillo, con su etiqueta', () => {
    const world = worldFor('nobile-rim-2');
    const line = world.horizonLine;
    const mat = line.material as THREE.LineBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThanOrEqual(0.5);
    // la etiqueta solo se muestra en la vista del sitio: nace oculta y pov.ts la enciende al entrar
    expect(world.horizonLabel.visible).toBe(false);
    world.setSiteViewLabels(true);
    expect(world.horizonLabel.visible).toBe(true);
    expect(world.horizonLabelText).toBe('Horizonte LOLA');
  });

  it('con horizonte esférico (sitio sintético de ?phase=) la etiqueta dice «geométrico», no «LOLA»', () => {
    const site = { ...loadSite('nobile-rim-2'), horizonSource: 'spherical' as const };
    const world = new SurfaceWorld(fakeApp, evaluateSites([site], LANDING)[0]!);
    built.push(world);
    expect(world.horizonLabelText).toBe('Horizonte geométrico');
    expect(logOf(world.horizonLabel).texts.map((t) => t.text)).toEqual(['Horizonte geométrico']);
    expect(horizonName(site)).toBe('geométrico');
    expect(horizonName(loadSite('nobile-rim-2'))).toBe('LOLA');
  });

  it('el trazo suelto de la etiqueta: la ficha es opaca y dibuja por encima de la línea, que no la atraviesa', () => {
    const world = worldFor('nobile-rim-2');
    const mat = world.horizonLabel.material as THREE.SpriteMaterial;
    expect(logOf(world.horizonLabel).fills[0]).toBe(palette['bg-surface']);
    expect(mat.depthTest).toBe(false);
    expect(world.horizonLabel.renderOrder).toBeGreaterThan(world.horizonLine.renderOrder);
  });
});

describe('fichas de papel en el 3D', () => {
  const named = (world: SurfaceWorld, name: string) => world.scene.getObjectByName(name) as THREE.Sprite;

  it('SOL, TIERRA, ZONA DE ALUNIZAJE, el horizonte y el fantasma de la Tierra: papel, tinta y ninguna ficha oscura', () => {
    const world = worldFor('nobile-rim-2');
    const sprites = [named(world, 'label:SOL'), named(world, 'label:TIERRA'), named(world, 'label:ZONA'), world.horizonLabel, world.earthGhost!.group.getObjectByName('label:fantasma') as THREE.Sprite];
    for (const s of sprites) {
      expect(s, 'ficha presente').toBeTruthy();
      const log = logOf(s);
      expect(log.fills[0]).toBe(palette['bg-surface']);
      expect(log.fills.filter((f) => DARK.test(f))).toEqual([]);
      for (const t of log.texts) expect([palette.label, palette['label-2']]).toContain(t.color);
    }
    // Sol y Tierra solo como detalle (el filete)
    expect(logOf(sprites[0]!).fills).toContain(palette.sun);
    expect(logOf(sprites[1]!).fills).toContain(palette.earth);
  });

  it('el contorno de la Tierra aclara que la cifra es desde la superficie', () => {
    const world = worldFor('nobile-rim-2');
    const texts = logOf(world.earthGhost!.group.getObjectByName('label:fantasma') as THREE.Sprite).texts.map((t) => t.text);
    expect(texts).toEqual(['Tierra tapada por el relieve · 5.7°', 'visto desde la superficie']);
  });
});

describe('Sol', () => {
  it('el núcleo mide ~0.53° de diámetro aparente', () => {
    const world = worldFor('nobile-rim-2');
    const core = world.sunCore;
    const angular = 2 * Math.atan((core.scale.x / 2) / core.position.length()) * 180 / Math.PI;
    expect(SUN_CORE_DEG).toBeCloseTo(0.53, 2);
    expect(angular).toBeGreaterThan(0.5);
    expect(angular).toBeLessThan(0.56);
  });
});

describe('rugosidad', () => {
  function patch(heightAt: (xE: number, zS: number) => number): TerrainPatch {
    const n = 65, extentM = 2560, cellM = extentM / (n - 1);
    const heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = heightAt(c * cellM - extentM / 2, r * cellM - extentM / 2);
    const info = { site_id: 'sintetico', heightmap_url: '', format: 'RAW16 little-endian', size_px: n, extent_m: extentM, min_height_m: 0, max_height_m: 1, texture_url: '', site_px: [32, 32] } as TerrainInfo;
    return { info, heights, cellM };
  }

  it('un plano inclinado liso da rugosidad ~0: la pendiente no es rugosidad', () => {
    const slope = patch((x, z) => 0.3 * x - 0.2 * z + 50);
    expect(terrainRoughness(slope, 0, 0)!).toBeLessThan(1e-4);
  });

  it('sobre un plano inclinado mide solo lo que sobresale del plano', () => {
    const plane = (x: number, z: number) => 0.3 * x - 0.2 * z;
    const bumpy = patch((x, z) => plane(x, z) + ((Math.round(x / 40) + Math.round(z / 40)) % 2 === 0 ? 2 : -2));
    const rough = terrainRoughness(bumpy, 0, 0)!;
    expect(rough).toBeGreaterThan(1.2);
    expect(rough).toBeLessThan(2.1);
  });

  it('el radio manda: un bulto fuera de los 120 m no cuenta', () => {
    const far = patch((x, z) => (Math.hypot(x - 800, z) < 100 ? 30 : 0));
    expect(terrainRoughness(far, 0, 0)!).toBeLessThan(1e-4);
    expect(terrainRoughness(far, 800, 0)!).toBeGreaterThan(1);
  });

  it('con terreno real la zona de alunizaje trae una cifra calculada del RAW, sin el aplanado; sin terreno no hay cifra', () => {
    const world = worldFor('nobile-rim-2');
    const site = world.m.site;
    expect(world.roughness).not.toBeNull();
    expect(world.roughness).toBeCloseTo(terrainRoughness(site.terrain!, world.lz.x, world.lz.z)!, 6);
    expect(worldFor('apollo-11').roughness).toBeNull();
  });
});
