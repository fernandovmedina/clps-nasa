import * as THREE from 'three';
import { BOUNCE, DONKEY_HEIGHT_M, DonkeyGuide, type DonkeyMood } from './donkey';

const FOV_DEG = 28;
/** Room to the sides of the donkey for its sway, in metres (it is about 0.16 m wide). */
const HALF_WIDTH_M = 0.15;
const FLOOR_MARGIN_M = 0.03;
const CEILING_MARGIN_M = 0.04;

/** Tallest the donkey ever gets: its height stretched at the top of the highest hop. */
const TOP_M = (() => {
  const moods = Object.values(BOUNCE);
  const hop = Math.max(...moods.map((m) => m.height));
  const stretch = Math.max(...moods.map((m) => 0.6 * m.squash));
  return DONKEY_HEIGHT_M * (1 + stretch) + hop;
})();
const BOTTOM_M = -FLOOR_MARGIN_M;
const CENTER_Y = (TOP_M + CEILING_MARGIN_M + BOTTOM_M) / 2;
const HALF_HEIGHT_M = (TOP_M + CEILING_MARGIN_M - BOTTOM_M) / 2;

/**
 * The Burro Pardo on a canvas of its own, drawn with its own renderer: the welcome dialog's veil is DOM on top of the
 * main canvas, which would darken it, and the main canvas draws nothing until the engine starts. Inert (and `ok`
 * false) when there is no WebGL.
 */
export class DonkeyStage {
  readonly ok: boolean;
  private readonly parts: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    donkey: DonkeyGuide;
    observer: ResizeObserver | null;
  } | null = null;
  private raf = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const attributes = { alpha: true, antialias: true, premultipliedAlpha: true };
    let context: WebGL2RenderingContext | null = null;
    try { context = canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null; } catch { /* no WebGL */ }
    if (!context) { this.ok = false; return; }

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context, ...attributes });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6560, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4);
      sun.position.set(0.6, 1, 1.4);
      scene.add(sun);
      const donkey = new DonkeyGuide().load();
      scene.add(donkey.group);

      const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 10);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.resize);
      observer?.observe(canvas);
      this.parts = { renderer, scene, camera, donkey, observer };
      this.ok = true;
    } catch {
      renderer?.dispose();
      renderer?.forceContextLoss();
      this.ok = false;
      return;
    }
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  setMood(mood: DonkeyMood) {
    if (!this.disposed) this.parts?.donkey.setMood(mood);
  }

  /** Stops the loop and frees the donkey, the renderer and its WebGL context. Safe to call twice. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const parts = this.parts;
    if (!parts) return;
    parts.observer?.disconnect();
    parts.donkey.dispose();
    parts.renderer.dispose();
    parts.renderer.forceContextLoss();
  }

  private frame = () => {
    this.raf = 0;
    const parts = this.parts;
    if (this.disposed || !parts || document.hidden) return;
    parts.donkey.update(performance.now() / 1000);
    parts.renderer.render(parts.scene, parts.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  private onVisibility = () => {
    if (!document.hidden && !this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  };

  /** The size comes from the canvas's CSS box; the camera backs off until the whole hop fits whatever the aspect is. */
  private resize = () => {
    const parts = this.parts;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.disposed || !parts || !w || !h) return;
    parts.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    parts.renderer.setSize(w, h, false);
    const { camera } = parts;
    camera.aspect = w / h;
    const tanHalf = Math.tan((FOV_DEG * Math.PI) / 360);
    const distance = Math.max(HALF_HEIGHT_M / tanHalf, HALF_WIDTH_M / (tanHalf * camera.aspect));
    camera.position.set(0, CENTER_Y + 0.02, distance);
    camera.lookAt(0, CENTER_Y, 0);
    camera.updateProjectionMatrix();
  };
}
