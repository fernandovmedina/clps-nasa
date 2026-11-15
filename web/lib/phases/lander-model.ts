import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject } from './rocket-model';

const MODEL_URL = '/models/lander.glb';
const TIMEOUT_MS = 20000;

/**
 * Loads the lander model and fits it to the reference group: same height, feet at y = 0,
 * centred in x/z. Resolves null on any error or after TIMEOUT_MS.
 */
export function loadLanderModel(reference: THREE.Object3D): Promise<THREE.Group | null> {
  const targetHeight = new THREE.Box3().setFromObject(reference).getSize(new THREE.Vector3()).y;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (model: THREE.Group | null) => {
      if (settled) { if (model) disposeObject(model); return; }
      settled = true; clearTimeout(timer); resolve(model);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL)
      .then((gltf) => finish(fit(gltf.scene, targetHeight)))
      .catch(() => finish(null));
  });
}

function fit(model: THREE.Group, targetHeight: number): THREE.Group {
  const out = new THREE.Group();
  out.add(model);
  out.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(out);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = targetHeight / s.y;
  model.scale.setScalar(k);
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    // the baked texture is dark; lift it so the gold foil keeps its shape under the grazing polar Sun
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.roughness = 0.55; mat.metalness = 0.15; mat.color.multiplyScalar(1.8);
  });
  return out;
}
