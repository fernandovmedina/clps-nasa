import * as THREE from 'three';
import { UI, roundRect, textLabel } from '../engine/panel';
import type { RoomEvent } from '../sync/room-client';

const RT_W = 640, RT_H = 480;
/** The on-screen picture-in-picture is 16:9, so it gets a 16:9 capture and is drawn 1:1, never stretched. */
export const WIDE_SIZE = { w: 640, h: 360 };
const PANEL_W = 0.78; // was 0.46 - too small to read at a glance across the cabin
const BEZEL_M = 0.05; // backing frame margin around the video quad, in meters
const LABEL_W = PANEL_W * 0.9;
const RENDER_INTERVAL_S = 1 / 12; // throttle the extra render pass independent of the main framerate
const STALE_AFTER_S = 3;
// cam_update arrives over the wire at ~10 Hz (CAM_SEND_INTERVAL_S in pov.ts) and `now` here is
// LunarApp.time, which has already advanced past a sample's arrival time by the next frame (it's
// bumped before phases update). Rendering at `now - INTERP_DELAY_S` instead of `now` keeps the
// interpolation window inside a pair of real samples instead of overshooting it on frame one -
// without this delay, alpha saturates to 1 immediately and the camera snaps exactly like before.
// The delay is deliberately bigger than one cam_update interval so a full transition between two
// samples is actually replayed smoothly, not just its tail end.
export const INTERP_DELAY_S = 0.15;
// Keeping only the latest two samples isn't enough once the delay exceeds the send interval: a
// fresh sample can arrive before the delayed clock has finished replaying the previous one, and
// discarding it mid-replay would jump the camera. A short history lets interpolatePose always
// pick the pair that actually brackets the delayed render time, however many newer samples exist.
const MAX_SAMPLES = 8;

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
 *
 * The remote pose only arrives over the wire at ~10 Hz (cam_update in
 * pov.ts), so `remoteCam` is driven by continuous lerp/slerp across a short
 * history of recent samples, replayed `INTERP_DELAY_S` behind the wall clock
 * (see interpolatePose) instead of snapping to each new one - that's what
 * makes the mirror feel smooth instead of jittery, independent of how often
 * the capture itself is throttled below.
 */
export class SpyView {
  /** Group, not the video plane itself, so the bezel/badges/label all hide and move together. */
  readonly mesh: THREE.Group;
  private videoMesh: THREE.Mesh;
  private bezelMesh: THREE.Mesh;
  private target: THREE.WebGLRenderTarget;
  private remoteCam: THREE.PerspectiveCamera;
  private liveMat: THREE.MeshBasicMaterial;
  private placeholderMat: THREE.MeshBasicMaterial;
  private label: THREE.Sprite;
  private liveBadge: THREE.Sprite;
  private noSignalBadge: THREE.Sprite;
  private lastSeenAt = -Infinity;
  private lastRenderedAt = -Infinity;
  private stale = true;
  private readonly rtW: number;
  private readonly rtH: number;

  // Recent network samples, oldest first, for interpolating the pose actually used to render.
  private samples: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number }[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly siteId: string, size: { w: number; h: number } = { w: RT_W, h: RT_H }) {
    this.rtW = size.w;
    this.rtH = size.h;
    this.target = new THREE.WebGLRenderTarget(this.rtW, this.rtH, { colorSpace: THREE.SRGBColorSpace });
    this.remoteCam = new THREE.PerspectiveCamera(60, this.rtW / this.rtH, 0.05, 250000);

    const h = PANEL_W * (this.rtH / this.rtW);
    this.liveMat = new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false });
    this.placeholderMat = new THREE.MeshBasicMaterial({ color: 0x0d1420 });
    this.videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, h), this.placeholderMat);
    this.videoMesh.position.z = 0.001; // sits just in front of the bezel backing
    this.videoMesh.renderOrder = 20; // renderOrder isn't inherited from the parent Group - each mesh needs its own

    this.bezelMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W + BEZEL_M * 2, h + BEZEL_M * 2), bezelMaterial(this.rtW, this.rtH));
    this.bezelMesh.renderOrder = 19; // behind the video plane

    this.mesh = new THREE.Group();
    this.mesh.add(this.bezelMesh, this.videoMesh);

    this.label = textLabel([{ text: 'VISTA DEL INSPECTOR VR', size: 32, color: UI.text, weight: 800, mono: true }], LABEL_W);
    this.label.position.y = h / 2 + BEZEL_M + 0.09;
    this.mesh.add(this.label);

    this.liveBadge = textLabel([{ text: '● EN VIVO', size: 28, color: UI.ok, weight: 800, mono: true }], LABEL_W * 0.55);
    this.noSignalBadge = textLabel([{ text: '● SIN SEÑAL', size: 28, color: UI.dim, weight: 800, mono: true }], LABEL_W * 0.55);
    this.liveBadge.position.set(0, -h / 2 - BEZEL_M - 0.075, 0);
    this.noSignalBadge.position.copy(this.liveBadge.position);
    this.mesh.add(this.liveBadge, this.noSignalBadge);
  }

  /** Feed a room event in; ignores anything that isn't a fresh cam_update for this site. */
  handleRoomEvent(msg: RoomEvent, now: number) {
    if (msg.type !== 'cam_update' || msg.site_id !== this.siteId) return;
    const lastSample = this.samples[this.samples.length - 1];
    if (lastSample && now <= lastSample.t) {
      // `now` is LunarApp.time, which freezes while this tab is backgrounded (no rAF) even
      // though cam_update messages keep arriving over the WebSocket - a burst like that would
      // otherwise push several same-timestamp entries and shift() out the real pre-freeze
      // history interpolatePose still needs. Overwrite in place instead of burning buffer slots.
      lastSample.pos.set(msg.px, msg.py, msg.pz);
      lastSample.quat.set(msg.qx, msg.qy, msg.qz, msg.qw);
    } else {
      this.samples.push({
        pos: new THREE.Vector3(msg.px, msg.py, msg.pz),
        quat: new THREE.Quaternion(msg.qx, msg.qy, msg.qz, msg.qw),
        t: now,
      });
      if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    }
    this.lastSeenAt = now;
  }

  get hasSignal(): boolean {
    return this.samples.length > 0;
  }

  /** True while the capture is fresh: the inspector's camera was heard from in the last few seconds. */
  get live(): boolean {
    return !this.stale;
  }

  /** What the last capture drew; the on-screen picture-in-picture shows it. */
  get texture(): THREE.Texture {
    return this.target.texture;
  }

  /** Moves `remoteCam` to the point in the sample history that corresponds to `now - INTERP_DELAY_S`. */
  private interpolatePose(now: number) {
    const renderAt = now - INTERP_DELAY_S;
    const samples = this.samples;
    const last = samples.length - 1;
    // Walk back from the newest sample to the latest one at or before renderAt - that's `a`;
    // `b` is whatever comes right after it (or itself, at either end of the history).
    let i = last;
    while (i > 0 && samples[i]!.t > renderAt) i--;
    const a = samples[i]!;
    const b = samples[Math.min(i + 1, last)]!;
    const span = b.t - a.t;
    const alpha = span > 1e-6 ? Math.min(1, Math.max(0, (renderAt - a.t) / span)) : 1;
    this.remoteCam.position.lerpVectors(a.pos, b.pos, alpha);
    this.remoteCam.quaternion.slerpQuaternions(a.quat, b.quat, alpha);
  }

  /**
   * Re-renders the spy texture (throttled) from the remote camera's
   * interpolated pose. `hideWhileCapturing` are local-only objects (my own UI
   * panels, VR controllers, the fade sphere, this very mesh) that must not
   * appear in the capture - the caller is responsible for making sure they
   * belong to `scene`'s graph. Visibility is always restored, even if
   * render() throws (e.g. a dropped WebGL context mid-session) - otherwise a
   * failed capture would permanently hide the user's own UI.
   */
  update(now: number, renderer: THREE.WebGLRenderer, hideWhileCapturing: THREE.Object3D[]) {
    const stale = !this.hasSignal || now - this.lastSeenAt > STALE_AFTER_S;
    this.stale = stale;
    this.videoMesh.material = stale ? this.placeholderMat : this.liveMat;
    this.liveBadge.visible = !stale;
    this.noSignalBadge.visible = stale;
    if (stale) return;

    // Advance the camera every frame so motion stays smooth even though the
    // capture below only runs a handful of times per second.
    this.interpolatePose(now);
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
    this.videoMesh.geometry.dispose();
    this.bezelMesh.geometry.dispose();
    disposeSpriteLike(this.bezelMesh);
    for (const sprite of [this.label, this.liveBadge, this.noSignalBadge]) disposeSpriteLike(sprite);
  }
}

/** Rounded-rect canvas texture behind the video quad, in the same frame style as the app's other panels (see Panel.frame). */
function bezelMaterial(rtW: number, rtH: number): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = Math.round((320 * (rtH + 1)) / (rtW + 1));
  const g = canvas.getContext('2d')!;
  roundRect(g, 4, 4, canvas.width - 8, canvas.height - 8, 18);
  g.fillStyle = UI.bg;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = UI.ok;
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
}

function disposeSpriteLike(obj: THREE.Mesh | THREE.Sprite) {
  const mat = obj.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
}
