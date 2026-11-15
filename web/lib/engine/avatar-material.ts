import * as THREE from 'three';
import { SUIT_COLORS } from './avatar-geometry';

const FABRIC_URL = '/textures/suit/suit-fabric.webp';
const FABRIC_NORMAL_URL = '/textures/suit/suit-fabric-normal.webp';

// Mean of suit-fabric.webp in linear space: dividing by it keeps the vertex colors (the palette) as the
// overall color once the texture is multiplied in, so the image only adds the weave.
const FABRIC_MEAN = new THREE.Color(0.803, 0.752, 0.636);

/**
 * Cloth takes its color from the vertex colors and, once they load, the fabric textures; until then
 * (or if they never load) it is plain. Metal is for the disconnect rings.
 */
export function createSuitMaterials() {
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: SUIT_COLORS.metal, roughness: 0.45, metalness: 0.8 });
  const textures: THREE.Texture[] = [];
  let disposed = false;

  const loader = new THREE.TextureLoader();
  const load = (url: string, use: (t: THREE.Texture) => void) => {
    loader.load(url, (t) => {
      if (disposed) { t.dispose(); return; }
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      textures.push(t);
      use(t);
      cloth.needsUpdate = true;
    });
  };
  load(FABRIC_URL, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    cloth.map = t;
    cloth.color.setRGB(1 / FABRIC_MEAN.r, 1 / FABRIC_MEAN.g, 1 / FABRIC_MEAN.b);
  });
  load(FABRIC_NORMAL_URL, (t) => {
    cloth.normalMap = t;
    cloth.normalScale.set(0.45, 0.45);
  });

  return {
    cloth,
    metal,
    dispose() {
      disposed = true;
      cloth.dispose();
      metal.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
