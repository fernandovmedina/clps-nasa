import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject } from '../phases/rocket-model';

const MODEL_URL = '/models/donkey.glb';
const TIMEOUT_MS = 20000;
/** Height of the donkey, in metres. */
export const DONKEY_HEIGHT_M = 0.2;
/** Yaw that turns the model's front toward +Z. */
const MODEL_YAW = 0;
/** The suit is lit by each phase's lights; a bit of self-illumination keeps it readable in lunar shadow or deep space. */
const SELF_LIGHT = 0.45;
const MOOD_DAMP = 6;

/** How the donkey hops: calm while waiting, livelier while the welcome guide talks or asks. */
export type DonkeyMood = 'hidden' | 'idle' | 'listening' | 'speaking';

interface BounceStyle { period: number; height: number; squash: number; sway: number }

/** Hop period (s), hop height (m), squash-and-stretch and side sway (rad) per mood. */
export const BOUNCE: Record<DonkeyMood, BounceStyle> = {
  hidden: { period: 1.2, height: 0, squash: 0, sway: 0 },
  idle: { period: 1.15, height: 0.018, squash: 0.06, sway: 0.05 },
  listening: { period: 0.8, height: 0.012, squash: 0.05, sway: 0.12 },
  speaking: { period: 0.42, height: 0.03, squash: 0.1, sway: 0.08 },
};

export interface BouncePose { y: number; scaleY: number; scaleXZ: number; roll: number }

/**
 * Pose of a cartoon hop at `hops` (hops done so far, so 0.5 is the top of the first one): a sine arc off the ground,
 * squashed on landing and stretched in the air, keeping the volume (scaleXZ = 1 / sqrt(scaleY)), with a slow roll
 * from side to side that changes sides every hop.
 */
export function bouncePose(hops: number, style: BounceStyle): BouncePose {
  const phase = (hops % 1 + 1) % 1;
  const hop = Math.sin(Math.PI * phase);               // 0 on the ground, 1 at the top
  const contact = Math.max(0, 1 - hop / 0.3);          // 1 right on landing, fades out early in the hop
  const scaleY = 1 - style.squash * contact + style.squash * 0.6 * hop * (1 - contact);
  return {
    y: style.height * hop,
    scaleY,
    scaleXZ: 1 / Math.sqrt(scaleY),
    roll: style.sway * Math.sin(Math.PI * hops),
  };
}

/**
 * The Burro Pardo mascot: a small donkey in a space suit hopping in place (in the welcome guide and beside the
 * viewer in VR). Starts empty and fills in when the model loads; stays empty if it fails.
 */
export class DonkeyGuide {
  readonly group = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private model: THREE.Group | null = null;
  private mood: DonkeyMood = 'idle';
  private style: BounceStyle = { ...BOUNCE.idle };
  private last: number | null = null;
  private hops = 0;
  private disposed = false;

  constructor() {
    this.group.add(this.pivot);
    this.group.name = 'donkey-guide';
  }

  load() {
    loadDonkeyModel().then((model) => {
      if (!model) return;
      if (this.disposed) { disposeObject(model); return; }
      this.model = model;
      this.pivot.add(model);
    });
    return this;
  }

  setMood(mood: DonkeyMood) { this.mood = mood; }

  /** Call every rendered frame with the time in seconds. */
  update(t: number) {
    const dt = this.last === null ? 0 : Math.min(t - this.last, 0.1);
    this.last = t;
    const target = BOUNCE[this.mood];
    const k = dt ? 1 - Math.exp(-MOOD_DAMP * dt) : 1;
    // everything eases, the period too: the hop count is integrated, so a new rhythm never makes the pose jump
    for (const key of ['period', 'height', 'squash', 'sway'] as const) this.style[key] += (target[key] - this.style[key]) * k;
    this.hops += dt / this.style.period;
    this.pivot.visible = this.mood !== 'hidden';
    const pose = bouncePose(this.hops, this.style);
    this.pivot.position.y = pose.y;
    this.pivot.scale.set(pose.scaleXZ, pose.scaleY, pose.scaleXZ);
    this.pivot.rotation.z = pose.roll;
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    if (this.model) disposeObject(this.model);
    this.model = null;
  }
}

function loadDonkeyModel(): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (model: THREE.Group | null) => {
      if (settled) { if (model) disposeObject(model); return; }
      settled = true; clearTimeout(timer); resolve(model);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL)
      .then((gltf) => finish(fit(gltf.scene)))
      .catch(() => finish(null));
  });
}

/** Feet at y = 0, centred in x/z, DONKEY_HEIGHT_M tall, front toward +Z, not a pointer target. */
function fit(model: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  model.rotation.y = MODEL_YAW;
  out.add(model);
  out.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(out);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = DONKEY_HEIGHT_M / s.y;
  model.scale.multiplyScalar(k);
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.raycast = () => {};  // decoration: must not eat clicks or cost ray tests
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      if (std.map) { std.emissiveMap = std.map; std.emissive.setRGB(1, 1, 1); std.emissiveIntensity = SELF_LIGHT; }
      if ((std as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) (std as THREE.MeshPhysicalMaterial).transmission = 0;
    }
  });
  return out;
}
