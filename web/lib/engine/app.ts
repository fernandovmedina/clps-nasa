import * as THREE from 'three';
import { Input } from './input';
import { AudioEngine } from './audio';
import { damp, lookQuat } from './util';
import { loadMoonTextures, type MoonTextures } from './moon';
import { Panel } from './panel';
import type { MissionData } from '../mission/sites';
import type { SiteMetrics } from '../mission/scoring';
import { RoomClient, type RoomStatus } from '../sync/room-client';

export interface Phase {
  readonly name: PhaseName;
  readonly scene: THREE.Scene;
  /** Objects the pointer/controller rays can hit. */
  targets: THREE.Object3D[];
  enter(): void;
  update(dt: number, t: number): void;
  exit(): void;
}

export type PhaseName = 'launch' | 'orbit' | 'pov' | 'landing' | 'transmit';

export interface AppOptions {
  loadData: (onProgress: (p: number, msg: string) => void) => Promise<MissionData>;
  onPhase?: (name: PhaseName) => void;
  /** Jump straight to a phase (dev/testing): ?phase=orbit|pov|landing|transmit */
  startPhase?: PhaseName;
  /** Dev only: speeds up the simulation clock (?speed=4). */
  timeScale?: number;
  /** Shared room for WebSocket sync (CLAUDE.md sec. 7); same room = synced. */
  room?: string;
  onRoomStatus?: (s: RoomStatus) => void;
  onRoomChange?: (room: string) => void;
  /**
   * True = this client generated its own room code (nobody handed it one) -
   * the usual VR/inspector role: broadcasts its camera in pov.ts, doesn't
   * render the spy-view PiP. False = arrived via a shared link or typed a
   * code into "Cambiar" - the monitoring role: watches the host's camera,
   * doesn't broadcast its own (a desktop mouse-look pose isn't useful to
   * show the VR person). See LunarExperience.tsx's resolveInitialRoom/joinRoom.
   */
  isHost?: boolean;
}

type PhaseFactory = (app: LunarApp) => Phase;

/**
 * Owns the renderer, the camera rig (needed for WebXR: the headset moves the camera
 * *inside* the rig, the experience moves the rig), fades and phase switching.
 */
export class LunarApp {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new THREE.Group();
  readonly input: Input;
  readonly room: RoomClient;
  readonly audio = new AudioEngine();
  readonly eyeHeight = 1.6;
  /** See AppOptions.isHost - mutable because joining a room at runtime (not just at load) also changes the role. */
  isHost: boolean;
  phase: Phase | null = null;
  moonTex!: MoonTextures;
  data: MissionData | null = null;
  ranking: SiteMetrics[] = [];
  selected: SiteMetrics | null = null;
  /** Session flags (e.g. 'orbit-done' to skip the scan lap when coming back). */
  flags = new Set<string>();
  time = 0;
  /** Objects clickable from any phase (e.g. the in-VR exit button) - merged with phase.targets by Input.cast(). */
  readonly globalTargets: THREE.Object3D[] = [];

  private clock = new THREE.Clock();
  private view = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), rate: 3, snap: true };
  private look = { yaw: 0, pitch: 0, idle: 0 };
  /** Child of `camera`, not `rig` - a spy-view capture (spy-view.ts) must hide this too. */
  readonly fadeMesh: THREE.Mesh;
  /** Head-locked, visible only in VR - the only way out of a session besides powering off the headset.
   *  Public like fadeMesh: a spy-view capture (spy-view.ts) must hide this too. */
  readonly exitPanel: Panel;
  private fade = { value: 1, target: 1, speed: 1, resolve: null as null | (() => void) };
  private transitioning = false;
  private ro: ResizeObserver;
  private factories = new Map<PhaseName, PhaseFactory>();

  constructor(readonly container: HTMLElement, readonly opts: AppOptions) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(1);
    r.domElement.style.display = 'block';
    r.domElement.style.touchAction = 'none';
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 250000);
    this.camera.position.set(0, this.eyeHeight, 0);
    this.rig.add(this.camera);

    // Fade sphere around the head (works in VR, where screen-space overlays don't exist)
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false }),
    );
    this.fadeMesh.renderOrder = 1000;
    this.camera.add(this.fadeMesh);

    // Head-locked exit button: child of `camera` (not `rig`) so it renders in every phase
    // without being re-added, and tracks the view the same way fadeMesh does.
    this.exitPanel = new Panel(640, 220, 0.26, (p, g) => {
      p.frame(g);
      p.button(g, 'exit-vr', 20, 20, 600, 180, '✕ Salir de VR', () => this.exitVR());
    });
    this.exitPanel.mesh.position.set(0.4, -0.26, -0.85);
    this.exitPanel.mesh.visible = false;
    this.camera.add(this.exitPanel.mesh);
    this.globalTargets.push(this.exitPanel.mesh);

    this.input = new Input(this);
    this.room = new RoomClient(opts.room ?? 'touchdown', opts.onRoomStatus, opts.onRoomChange);
    this.isHost = opts.isHost ?? true;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    r.xr.addEventListener('sessionend', () => { this.camera.position.set(0, this.eyeHeight, 0); this.camera.quaternion.identity(); this.view.snap = true; this.resize(); });
  }

  register(name: PhaseName, f: PhaseFactory) { this.factories.set(name, f); }

  async start() {
    this.moonTex = await loadMoonTextures();
    const first = this.opts.startPhase ?? 'launch';
    this.setPhase(first);
    this.fadeTo(0, 1.2);
    this.renderer.setAnimationLoop(this.loop);
  }

  get isXR() { return this.renderer.xr.isPresenting; }

  async enterVR() {
    if (!navigator.xr) throw new Error('WebXR no disponible en este navegador');
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    await this.renderer.xr.setSession(session);
    this.view.snap = true;
  }

  /** The in-world "✕ Salir de VR" button calls this - the headset's own UI has no other way out mid-session. */
  exitVR() {
    this.renderer.xr.getSession()?.end().catch(() => {});
  }

  /** Where the viewer's eyes should be and what they should face. Smoothed every frame. */
  setView(eye: THREE.Vector3, target: THREE.Vector3, o: { up?: THREE.Vector3; rate?: number; snap?: boolean } = {}) {
    const up = o.up ?? new THREE.Vector3(0, 1, 0);
    let tgt = target;
    if (this.isXR) {
      // In VR only yaw the rig (pitch/roll belong to the user's head — far more comfortable)
      const f = target.clone().sub(eye);
      f.addScaledVector(up, -f.dot(up));
      if (f.lengthSq() > 1e-6) tgt = eye.clone().add(f);
    }
    lookQuat(eye, tgt, up, this.view.quat);
    const rigUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.view.quat);
    this.view.pos.copy(eye).addScaledVector(rigUp, -this.eyeHeight);
    if (o.rate !== undefined) this.view.rate = o.rate;
    if (o.snap) this.view.snap = true;
  }

  lookDrag(dx: number, dy: number) {
    this.look.yaw -= dx * 0.004;
    this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - dy * 0.004, -1.2, 1.2);
    this.look.idle = 0;
  }

  fadeTo(v: number, seconds: number) {
    this.fade.target = v;
    this.fade.speed = 1 / Math.max(0.01, seconds);
    this.fade.resolve?.();
    return new Promise<void>((r) => (this.fade.resolve = r));
  }

  setPhase(name: PhaseName) {
    const f = this.factories.get(name);
    if (!f) throw new Error(`Fase no registrada: ${name}`);
    this.phase?.exit();
    const p = f(this);
    this.phase = p;
    p.scene.add(this.rig);
    p.enter();
    this.view.snap = true;
    this.look.yaw = 0; this.look.pitch = 0;
    this.opts.onPhase?.(name);
  }

  async goTo(name: PhaseName, fadeOut = 0.7, fadeIn = 1.0) {
    if (this.transitioning) return;
    this.transitioning = true;
    await this.fadeTo(1, fadeOut);
    this.setPhase(name);
    await this.fadeTo(0, fadeIn);
    this.transitioning = false;
  }

  /** Pixel scale for point sprites (desktop or per-eye in XR). */
  pointScale() {
    if (this.isXR) {
      const xc = this.renderer.xr.getCamera();
      const c0 = xc.cameras[0] as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 };
      if (c0?.viewport) return (c0.projectionMatrix.elements[5] * c0.viewport.w) / 2;
    }
    return (this.camera.projectionMatrix.elements[5] * this.renderer.domElement.height) / 2;
  }

  private resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    if (this.isXR) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    const dt = Math.min(this.clock.getDelta(), 1 / 20) * (this.opts.timeScale ?? 1);
    this.time += dt;
    const p = this.phase;
    if (!p) return;
    p.update(dt, this.time);

    this.exitPanel.mesh.visible = this.isXR;
    this.exitPanel.update();

    const k = this.view.snap ? 1 : damp(this.view.rate, dt);
    this.view.snap = false;
    this.rig.position.lerp(this.view.pos, k);
    this.rig.quaternion.slerp(this.view.quat, k);

    if (!this.isXR) {
      this.look.idle += dt;
      if (this.look.idle > 4) { const d = damp(1.2, dt); this.look.yaw *= 1 - d; this.look.pitch *= 1 - d; }
      this.camera.position.set(0, this.eyeHeight, 0);
      this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
    }

    const f = this.fade;
    if (f.value !== f.target) {
      const step = f.speed * dt * Math.sign(f.target - f.value);
      f.value = Math.abs(f.target - f.value) <= Math.abs(step) ? f.target : f.value + step;
      if (f.value === f.target) { f.resolve?.(); f.resolve = null; }
    }
    const fm = this.fadeMesh.material as THREE.MeshBasicMaterial;
    fm.opacity = f.value;
    this.fadeMesh.visible = f.value > 0.001;

    this.rig.updateMatrixWorld(true);
    this.input.update();
    this.renderer.render(p.scene, this.camera);
  };

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.phase?.exit();
    this.exitPanel.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.room.close();
    this.ro.disconnect();
    this.renderer.xr.getSession()?.end().catch(() => {});
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
