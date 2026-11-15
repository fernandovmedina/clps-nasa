import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject } from './rocket-model';

const TOWER_URL = '/models/launch-tower.glb';
const TIMEOUT_MS = 20000;

// Same fit rocket-model.ts applies to the vehicle (bbox of the source file): scale and offset of the rocket's base.
const FIT_SCALE = 25.833115919471275;
const FIT_OFFSET = new THREE.Vector3(-0.4396127041461288, 0, -2.882397211348196);

/**
 * Loads the launch tower cut from the same file as the rocket and places it where it stood next to the vehicle,
 * given the point where the rocket's base starts. Resolves null on any error or after TIMEOUT_MS.
 */
export function loadLaunchTower(rocketBase: THREE.Vector3): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (tower: THREE.Group | null) => {
      if (settled) { if (tower) disposeObject(tower); return; }
      settled = true; clearTimeout(timer); resolve(tower);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(TOWER_URL)
      .then((gltf) => finish(place(gltf.scene, rocketBase)))
      .catch(() => finish(null));
  });
}

function place(scene: THREE.Group, rocketBase: THREE.Vector3): THREE.Group {
  scene.scale.setScalar(FIT_SCALE);
  scene.position.copy(rocketBase).add(FIT_OFFSET);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.roughness = 0.6; mat.metalness = 0; mat.color.multiplyScalar(2.2);
  });
  scene.updateMatrixWorld(true);
  return scene;
}
