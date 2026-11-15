import * as THREE from 'three';
import type { LunarApp } from '../engine/app';
import { CamBroadcaster } from '../sync/cam-broadcast';
import type { RoomEvent } from '../sync/room-client';
import { SpyView, WIDE_SIZE } from './spy-view';

export interface RectLike { left: number; top: number; width: number; height: number }
export interface Viewport { x: number; y: number; width: number; height: number }

/**
 * A DOM rectangle as the renderer's viewport: CSS pixels relative to the canvas, origin at the bottom
 * left, clipped to the canvas. three multiplies viewport and scissor by the renderer's pixel ratio, so
 * this stays in CSS pixels; null when nothing of the rectangle is on the canvas.
 */
export function rectToViewport(rect: RectLike, canvas: RectLike): Viewport | null {
  const left = Math.max(rect.left, canvas.left);
  const right = Math.min(rect.left + rect.width, canvas.left + canvas.width);
  const top = Math.max(rect.top, canvas.top);
  const bottom = Math.min(rect.top + rect.height, canvas.top + canvas.height);
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: left - canvas.left, y: canvas.top + canvas.height - bottom, width: right - left, height: bottom - top };
}

/** The same viewport in drawing-buffer pixels, which is what the GPU receives (app.ts: pixel ratio = min(devicePixelRatio, 2)). */
export function viewportToPixels(vp: Viewport, pixelRatio: number): Viewport {
  return { x: Math.floor(vp.x * pixelRatio), y: Math.floor(vp.y * pixelRatio), width: Math.floor(vp.width * pixelRatio), height: Math.floor(vp.height * pixelRatio) };
}

export interface PipSource { readonly texture: THREE.Texture; readonly live: boolean }

/**
 * Mission Control's on-screen picture-in-picture: the texture the inspector's SpyView captured, drawn
 * after the main render into the rectangle of a DOM container, which sits over the canvas and is
 * transparent. Only the monitor has one; the host never sets a source.
 */
export class InspectorPip {
  /** Set by the phase that owns the SpyView; null when there is nothing to show. */
  source: PipSource | null = null;
  /** The container the React layer put on screen. */
  host: Pick<HTMLElement, 'getBoundingClientRect'> | null = null;

  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor() {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get live(): boolean {
    return this.source?.live === true;
  }

  setHost(host: Pick<HTMLElement, 'getBoundingClientRect'> | null): void {
    this.host = host;
  }

  /** Call right after the main render; leaves the renderer exactly as it found it. */
  draw(renderer: THREE.WebGLRenderer): void {
    const source = this.source, host = this.host;
    if (!source || !host || !source.live || renderer.xr.isPresenting) return;
    const vp = rectToViewport(host.getBoundingClientRect(), renderer.domElement.getBoundingClientRect());
    if (!vp) return;

    if (this.material.map !== source.texture) { this.material.map = source.texture; this.material.needsUpdate = true; }
    const prevAuto = renderer.autoClear, prevScissorTest = renderer.getScissorTest(), prevTarget = renderer.getRenderTarget();
    const prevViewport = renderer.getViewport(new THREE.Vector4()), prevScissor = renderer.getScissor(new THREE.Vector4());
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
      renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
      renderer.setScissorTest(true);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setViewport(prevViewport);
      renderer.setScissor(prevScissor);
      renderer.setScissorTest(prevScissorTest);
      renderer.autoClear = prevAuto;
    }
  }

  dispose(): void {
    this.source = null;
    this.host = null;
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

export type FeedApp = Pick<LunarApp, 'isHost' | 'isXR' | 'rig' | 'camera' | 'room' | 'renderer' | 'pip' | 'opts'>;

export interface FeedOptions {
  /** pov also shows the capture as a 3D panel in the headset; landing and transmit only have the on-screen one. */
  panel3d?: (spy: SpyView) => void;
  /** Local-only objects to leave out of the capture. Defaults to the whole rig: the camera, the UI and the avatar live there. */
  hidden?: () => THREE.Object3D[];
}

/**
 * The inspector's view across the surface phases. The host sends its camera pose; the monitor keeps a
 * SpyView of the same world fed by those poses, and offers it to the on-screen picture-in-picture.
 */
export class InspectorFeed {
  private spy: SpyView | null = null;
  private readonly cam: CamBroadcaster;

  constructor(private app: FeedApp, private scene: THREE.Scene, private siteId: string, private options: FeedOptions = {}) {
    this.cam = new CamBroadcaster(app);
  }

  get view(): SpyView | null { return this.spy; }

  /** The role can change while a phase is running (joining a room), so this runs on enter and every frame. */
  sync(): void {
    const { app, options } = this;
    const wanted = !app.isHost && (!!options.panel3d || !app.isXR);
    if (wanted && !this.spy) {
      this.spy = new SpyView(this.scene, this.siteId, app.isXR ? undefined : WIDE_SIZE);
      if (options.panel3d) { app.rig.add(this.spy.mesh); options.panel3d(this.spy); }
      app.pip.source = this.spy;
    } else if (!wanted && this.spy) {
      this.release();
    }
  }

  /** `now` is the app clock. */
  handleRoom(msg: RoomEvent, now: number): void {
    this.spy?.handleRoomEvent(msg, now);
  }

  update(now: number): void {
    const { app, options } = this;
    this.cam.update(now, this.siteId);
    this.sync();
    const spy = this.spy;
    if (!spy) return;
    // The on-screen picture-in-picture replaces the 3D panel, except in the headset or the VR preview.
    spy.mesh.visible = app.isXR || app.opts.vrPreview === true;
    spy.update(now, app.renderer, options.hidden?.() ?? [app.rig]);
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    if (!this.spy) return;
    if (this.app.pip.source === this.spy) this.app.pip.source = null;
    this.spy.dispose();
    this.spy = null;
  }
}
