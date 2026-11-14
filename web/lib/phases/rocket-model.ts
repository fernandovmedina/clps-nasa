import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_URL = '/models/rocket.glb';
const TIMEOUT_MS = 3000;

/**
 * Loads the rocket model and fits it to the reference group: same height, base at y = 0,
 * centred in x/z, nose towards +Y. Resolves null on any error or after TIMEOUT_MS.
 * `userData.baseRadius` holds the half width of the model, to place the engine emitters.
 */
export function loadRocketModel(reference: THREE.Object3D): Promise<THREE.Group | null> {
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
  const measure = () => { out.updateMatrixWorld(true); return new THREE.Box3().setFromObject(out); };
  const size = measure().getSize(new THREE.Vector3());
  if (size.x > size.y && size.x >= size.z) model.rotation.z = Math.PI / 2;
  else if (size.z > size.y) model.rotation.x = -Math.PI / 2;

  const box = measure();
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = targetHeight / s.y;
  model.scale.setScalar(k);
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  out.userData.baseRadius = (Math.min(s.x, s.z) * k) / 2;

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    // the baked textures are almost black; lift them so the hull keeps its shape under the scene lights
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.roughness = 0.55; mat.metalness = 0; mat.color.multiplyScalar(2.2);
  });
  return out;
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m)) {
        if (!(v instanceof THREE.Texture)) continue;
        const image = v.image as { close?: () => void } | null;
        v.dispose(); image?.close?.();
      }
      m.dispose();
    }
  });
}
