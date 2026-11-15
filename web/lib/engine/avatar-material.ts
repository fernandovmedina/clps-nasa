import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SUIT_COLORS } from './avatar-geometry';
import { LAYERS, type Layer } from './avatar-layers';
import { drawPatch } from './avatar-patch';
import { injectSuitLayers, SUIT_PROGRAM_KEY } from './avatar-shader';

const BASE_URL = '/textures/suit/';

/**
 * Per layer: the image (with its `-normal` map), its mean color in linear space (dividing by it keeps the palette in the
 * vertex colors as the overall color, so the image only adds detail), the relief strength and the roughness.
 * The normal maps have their green channel pointing down, hence the negative Y scale.
 */
const SPECS: Record<Layer, { file: string; mean: [number, number, number]; bump: number; rough: number }> = {
  quilt: { file: 'suit-quilt', mean: [0.7525, 0.7183, 0.6565], bump: 1, rough: 0.92 },
  bellows: { file: 'suit-bellows', mean: [0.7282, 0.692, 0.6218], bump: 1, rough: 0.9 },
  rubber: { file: 'glove-rubber', mean: [0.085, 0.0853, 0.084], bump: 0.9, rough: 0.78 },
  fabric: { file: 'suit-fabric', mean: [0.8031, 0.7524, 0.6358], bump: 0.5, rough: 0.95 },
};

const ENV_INTENSITY = { cloth: 0.12, metal: 0.6, patch: 0.1 };
const PATCH_SIZE = 512;

function makeEnvironment(renderer: THREE.WebGLRenderer) {
  let generator: THREE.PMREMGenerator | undefined, room: RoomEnvironment | undefined;
  try {
    generator = new THREE.PMREMGenerator(renderer);
    room = new RoomEnvironment();
    return generator.fromScene(room, 0.04);
  } catch {
    return null;
  } finally {
    room?.dispose();
    generator?.dispose();
  }
}

/**
 * One cloth material (quilting, bellows, rubber and fabric, picked per vertex), metal for the rings and details, and
 * the mission patch. They reflect a small room environment of their own (the scene's is left alone; if it cannot be
 * built, the metal keeps its color). Until the
 * images load, or if they never do, the cloth is plain vertex color and the patch a flat disc.
 */
export function createSuitMaterials(renderer?: THREE.WebGLRenderer) {
  const environment = renderer ? makeEnvironment(renderer) : null;
  const envMap = environment?.texture ?? null;
  const anisotropy = Math.min(16, renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  const textures: THREE.Texture[] = [];
  let disposed = false;

  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  blank.needsUpdate = flat.needsUpdate = true;
  const uniforms: Record<string, THREE.IUniform> = {
    suitMean: { value: LAYERS.map(() => new THREE.Vector3(1, 1, 1)) },
    suitBump: { value: LAYERS.map(() => new THREE.Vector2(0, 0)) },
    suitRough: { value: LAYERS.map((layer) => SPECS[layer].rough) },
  };
  LAYERS.forEach((_, i) => {
    uniforms[`suitMap${i}`] = { value: blank };
    uniforms[`suitNormal${i}`] = { value: flat };
  });

  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMap, envMapIntensity: ENV_INTENSITY.cloth });
  cloth.onBeforeCompile = (shader) => injectSuitLayers(shader, uniforms);
  cloth.customProgramCacheKey = () => SUIT_PROGRAM_KEY;
  const metal = new THREE.MeshStandardMaterial({ color: SUIT_COLORS.metal, roughness: 0.3, metalness: 0.9, envMap, envMapIntensity: ENV_INTENSITY.metal });

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PATCH_SIZE;
  const drawn = drawPatch(canvas);
  const patch = new THREE.MeshStandardMaterial({
    color: drawn ? 0xffffff : 0x141413, roughness: 0.95, metalness: 0, envMap, envMapIntensity: ENV_INTENSITY.patch,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  let patchTexture: THREE.CanvasTexture | null = null;
  if (drawn) {
    patchTexture = new THREE.CanvasTexture(canvas);
    patchTexture.colorSpace = THREE.SRGBColorSpace;
    patchTexture.anisotropy = anisotropy;
    patch.map = patch.bumpMap = patchTexture;
    patch.bumpScale = 1.5;
  }

  const loader = new THREE.TextureLoader();
  const load = (url: string, srgb: boolean, use: (t: THREE.Texture) => void) => {
    loader.load(url, (t) => {
      if (disposed) { t.dispose(); return; }
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      textures.push(t);
      use(t);
    });
  };
  LAYERS.forEach((layer, i) => {
    const { file, mean, bump } = SPECS[layer];
    load(`${BASE_URL}${file}.webp`, true, (t) => {
      uniforms[`suitMap${i}`].value = t;
      (uniforms.suitMean.value as THREE.Vector3[])[i].set(...mean);
    });
    load(`${BASE_URL}${file}-normal.webp`, false, (t) => {
      uniforms[`suitNormal${i}`].value = t;
      (uniforms.suitBump.value as THREE.Vector2[])[i].set(bump, -bump);
    });
  });

  return {
    cloth,
    metal,
    patch,
    environment: envMap,
    dispose() {
      disposed = true;
      [cloth, metal, patch].forEach((m) => m.dispose());
      [blank, flat, patchTexture, ...textures].forEach((t) => t?.dispose());
      environment?.dispose();
      canvas.width = canvas.height = 0;
    },
  };
}
