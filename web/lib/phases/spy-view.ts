import * as THREE from 'three';
import { UI, textLabel } from '../engine/panel';
import type { RoomEvent } from '../sync/room-client';

const RT_W = 512, RT_H = 384;
const PANEL_W = 0.46;
const LABEL_W = PANEL_W * 0.9; // meters - this panel lives ~1.5-2m from the eye, NOT thousands of units away like the orbit-phase sky labels
const RENDER_INTERVAL_S = 1 / 12; // throttle the extra render pass independent of the main framerate
const STALE_AFTER_S = 3;

/**
 * "Picture in picture" showing what another client in the SAME room, on the
 * SAME site, is looking at right now - scoped to one site on purpose (see
 * CLAUDE.md / the chat decision: cheaper than WebRTC video, and reuses the
 * exact assets already loaded locally instead of a lossy video feed).
 *
 * Not literal video: it re-renders the shared SurfaceWorld scene from a
 * second camera placed at the remote peer's last known pose. Works the same
 * in desktop and VR because it's just a textured plane in the world, same as
 * the other UI panels - no screen-space viewport tricks needed.
 */
export class SpyView {
  readonly mesh: THREE.Mesh;
  private target: THREE.WebGLRenderTarget;
  private remoteCam: THREE.PerspectiveCamera;
  private liveMat: THREE.MeshBasicMaterial;
  private placeholderMat: THREE.MeshBasicMaterial;
  private frame: THREE.LineLoop;
  private label: THREE.Sprite;
  private lastSeenAt = -Infinity;
  private lastRenderedAt = -Infinity;

  constructor(private readonly scene: THREE.Scene, private readonly siteId: string) {
    this.target = new THREE.WebGLRenderTarget(RT_W, RT_H, { colorSpace: THREE.SRGBColorSpace });
    this.remoteCam = new THREE.PerspectiveCamera(60, RT_W / RT_H, 0.05, 250000);

    this.liveMat = new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false });
    this.placeholderMat = new THREE.MeshBasicMaterial({ color: 0x0d1420 });
    const h = PANEL_W * (RT_H / RT_W);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, h), this.placeholderMat);
    this.mesh.renderOrder = 20;

    this.frame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-PANEL_W / 2, -h / 2, 0.001), new THREE.Vector3(PANEL_W / 2, -h / 2, 0.001),
        new THREE.Vector3(PANEL_W / 2, h / 2, 0.001), new THREE.Vector3(-PANEL_W / 2, h / 2, 0.001),
      ]),
      new THREE.LineBasicMaterial({ color: 0x5cf2b0, transparent: true, opacity: 0.8 }),
    );
    this.mesh.add(this.frame);

    this.label = textLabel([{ text: 'VISTA DEL INSPECTOR VR', size: 26, color: UI.ok, weight: 800, mono: true }], LABEL_W);
    this.label.position.y = h / 2 + 0.07;
    this.mesh.add(this.label);
  }

  /** Feed a room event in; ignores anything that isn't a fresh cam_update for this site. */
  handleRoomEvent(msg: RoomEvent, now: number) {
    if (msg.type !== 'cam_update' || msg.site_id !== this.siteId) return;
    this.remoteCam.position.set(msg.px, msg.py, msg.pz);
    this.remoteCam.quaternion.set(msg.qx, msg.qy, msg.qz, msg.qw);
    this.lastSeenAt = now;
  }

  get hasSignal(): boolean {
    return this.lastSeenAt > -Infinity;
  }

  /**
   * Re-renders the spy texture (throttled) from the remote camera's last pose.
   * `hideWhileCapturing` are local-only objects (my own UI panels, VR
   * controllers, the fade sphere, this very mesh) that must not appear in the
   * capture - the caller is responsible for making sure they belong to
   * `scene`'s graph. Visibility is always restored, even if render() throws
   * (e.g. a dropped WebGL context mid-session) - otherwise a failed capture
   * would permanently hide the user's own UI.
   */
  update(now: number, renderer: THREE.WebGLRenderer, hideWhileCapturing: THREE.Object3D[]) {
    const stale = !this.hasSignal || now - this.lastSeenAt > STALE_AFTER_S;
    this.mesh.material = stale ? this.placeholderMat : this.liveMat;
    if (stale) return;
    if (now - this.lastRenderedAt < RENDER_INTERVAL_S) return;
    this.lastRenderedAt = now;

    const prevVisible = hideWhileCapturing.map((o) => o.visible);
    const prevTarget = renderer.getRenderTarget();
    try {
      hideWhileCapturing.forEach((o) => (o.visible = false));
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(this.scene, this.remoteCam);
    } finally {
      renderer.setRenderTarget(prevTarget);
      hideWhileCapturing.forEach((o, i) => (o.visible = prevVisible[i]!));
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.target.dispose();
    this.liveMat.dispose();
    this.placeholderMat.dispose();
    this.mesh.geometry.dispose();
    this.frame.geometry.dispose();
    (this.frame.material as THREE.Material).dispose();
    const labelMat = this.label.material as THREE.SpriteMaterial;
    labelMat.map?.dispose();
    labelMat.dispose();
  }
}
