import * as THREE from 'three';
import { Input } from './input';
import { AudioEngine } from './audio';
import { Avatar } from './avatar';
import { damp, lookQuat } from './util';
import { loadMoonTextures, type MoonTextures } from './moon';
import { Narrator } from './narration';
import { RunState, type PhaseHud } from './hud';
import { Panel, showPanels } from './panel';
import { createRunPanel } from './run-panel';
import type { MissionData } from '../mission/sites';
import { currentLanding, isLandingInRange, withLandingParam } from '../mission/launch-plan';
import type { SiteMetrics } from '../mission/scoring';
import { RoomClient, type RoomEvent, type RoomStatus } from '../sync/room-client';
import { PhaseFollow } from '../sync/phase-follow';
import { reduceRoom, type Marker } from '@touchdown/core';
import { subscribe as subscribeLang } from '../i18n';

export interface Phase {
  readonly name: PhaseName;
  readonly scene: THREE.Scene;
  /** Objects the pointer/controller rays can hit. */
  targets: THREE.Object3D[];
  enter(): void;
  update(dt: number, t: number): void;
  exit(): void;
  /** What the DOM control layer shows for this phase (see hud.ts). */
  controlHud?(): PhaseHud;
  /** The phase draws its own pause / stop / exit controls in VR: the generic run and exit panels stay hidden while it is current. */
  readonly ownsRunControls?: boolean;
  /** Every frame, also while paused or stopped, so the phase's own 3D controls keep redrawing. */
  updateUi?(): void;
  /**
   * El idioma cambió (lib/i18n): la fase vuelve a dibujar los paneles de canvas con los textos nuevos, por ejemplo
   * invalidando cada `Panel`. El HUD del DOM no lo necesita: `controlHud()` se vuelve a leer y ya trae el texto nuevo.
   */
  onLangChange?(): void;
  /** La fase deja que el visitante mire donde quiera: la vista no regresa sola a la del encuadre tras 4 s sin arrastrar. */
  readonly holdsLook?: boolean;
  /** Exposición y tone mapping propios de la fase; se restauran al pasar a otra. */
  readonly render?: RenderStyle;
}

export type PhaseName = 'launch' | 'orbit' | 'pov' | 'landing' | 'transmit';

export interface AppOptions {
  loadData: (onProgress: (p: number, msg: string) => void) => Promise<MissionData>;
  onPhase?: (name: PhaseName) => void;
  /** Jump straight to a phase (dev/testing): ?phase=orbit|pov|landing|transmit */
  startPhase?: PhaseName;
  /** Dev only: speeds up the simulation clock (?speed=4). */
  timeScale?: number;
  /** Dev only: shows the VR interface (3D panels, mouse as pointer) outside a headset session (?vr=preview). */
  vrPreview?: boolean;
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

/** Tone mapping y exposición con que una fase se dibuja; sin `render`, la fase usa los de siempre. */
export interface RenderStyle { toneMapping: THREE.ToneMapping; exposure: number }
const DEFAULT_RENDER: RenderStyle = { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.05 };

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
  readonly narrator = new Narrator();
  readonly eyeHeight = 1.6;
  /** See AppOptions.isHost - mutable because joining a room at runtime (not just at load) also changes the role. */
  isHost: boolean;
  phase: Phase | null = null;
  moonTex!: MoonTextures;
  /** Loading the data may be what lets a monitor catch up with the crew's phase. */
  get data(): MissionData | null { return this.missionData; }
  set data(d: MissionData | null) {
    this.missionData = d;
    if (d) this.follow.tryFollow();
  }
  private missionData: MissionData | null = null;
  ranking: SiteMetrics[] = [];
  selected: SiteMetrics | null = null;
  /**
   * Risk markers for the current room, kept current regardless of which phase
   * is listening (RoomClient only has one listener at a time - see
   * room-client.ts). Every phase's room handler should call applyMarkerEvent
   * on every message so this stays correct even while e.g. orbit.ts is
   * active and pov.ts isn't rendering them yet.
   */
  markers: Marker[] = [];
  /** Session flags (e.g. 'orbit-done' to skip the scan lap when coming back). */
  flags = new Set<string>();
  time = 0;
  /** Objects clickable from any phase (e.g. the in-VR exit button) - merged with phase.targets by Input.cast(). */
  readonly globalTargets: THREE.Object3D[] = [];
  readonly run = new RunState();
  /** Pause / stop controls for the headset; hidden outside VR like every Panel. */
  readonly runPanel: Panel;

  private clock = new THREE.Clock();
  private view = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), rate: 3, snap: true };
  /** setView() scratch - reused every frame instead of allocating. */
  private viewUpScratch = new THREE.Vector3();
  private viewFScratch = new THREE.Vector3();
  private viewTgtScratch = new THREE.Vector3();
  private viewRigUpScratch = new THREE.Vector3();
  private look = { yaw: 0, pitch: 0, idle: 0, releasing: false };
  /** Child of `camera`, not `rig` - a spy-view capture (spy-view.ts) must hide this too. */
  readonly fadeMesh: THREE.Mesh;
  /** Head-locked, visible only in VR - the only way out of a session besides powering off the headset.
   *  Public like fadeMesh: a spy-view capture (spy-view.ts) must hide this too. */
  readonly exitPanel: Panel;
  /** First-person torso + IK arms, visible only in VR. See avatar.ts. */
  private avatar: Avatar;
  private fade = { value: 1, target: 1, speed: 1, resolve: null as null | (() => void) };
  private transitioning = false;
  /** Bumped by stop/restart so a transition in flight does not swap the phase afterwards. */
  private epoch = 0;
  private runPanelMode = this.run.mode;
  private runPanelWaiting = false;
  private waitCheck = 0;
  private ro: ResizeObserver;
  private factories = new Map<PhaseName, PhaseFactory>();
  private follow: PhaseFollow;
  private unsubscribeLang: () => void;

  constructor(readonly container: HTMLElement, readonly opts: AppOptions) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = DEFAULT_RENDER.toneMapping;
    r.toneMappingExposure = DEFAULT_RENDER.exposure;
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

    // Exit button: fixed low on the left of the rig, mirroring the CAPCOM panel on the right,
    // so it never floats over whatever panel the user is looking at.
    this.exitPanel = new Panel(640, 220, 0.26, (p, g) => {
      p.frame(g);
      p.button(g, 'exit-vr', 20, 20, 600, 180, '✕ Salir de VR', () => this.exitVR());
    });
    this.exitPanel.place(-0.53, this.eyeHeight - 0.56, -0.92);
    this.exitPanel.mesh.visible = false;
    this.rig.add(this.exitPanel.mesh);
    this.globalTargets.push(this.exitPanel.mesh);

    this.input = new Input(this);
    this.runPanel = createRunPanel(this);
    this.rig.add(this.runPanel.mesh);
    this.globalTargets.push(this.runPanel.mesh);
    this.avatar = new Avatar(this);
    this.rig.add(this.avatar.group);
    this.room = new RoomClient(opts.room ?? 'touchdown', opts.onRoomStatus, opts.onRoomChange);
    this.isHost = opts.isHost ?? true;
    this.follow = new PhaseFollow({
      isHost: () => this.isHost,
      phase: () => this.phase?.name ?? null,
      busy: () => this.transitioning,
      hasData: () => this.missionData !== null,
      hasSite: (id) => this.selected?.site.id === id || this.ranking.some((m) => m.site.id === id),
      selectSite: (id) => { this.selected = this.ranking.find((m) => m.site.id === id) ?? this.selected; },
      goTo: (name) => { void this.goTo(name); },
      restart: () => this.restart(),
    }, this.room);
    this.unsubscribeLang = subscribeLang(() => {
      this.phase?.onLangChange?.();
      this.runPanel.invalidate();
      this.exitPanel.invalidate();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    r.xr.addEventListener('sessionend', () => { this.camera.position.set(0, this.eyeHeight, 0); this.camera.quaternion.identity(); this.view.snap = true; this.resize(); });
  }

  register(name: PhaseName, f: PhaseFactory) { this.factories.set(name, f); }

  /**
   * Applies a room event to `markers` using the same `reduceRoom` the Worker
   * runs (core/src/room.ts) - wrapped in a throwaway RoomState so we reuse
   * its id-dedup/MAX_MARKERS logic without re-implementing it here. The
   * Worker never echoes a message back to its own sender, so the host must
   * apply its own marker_add/marker_remove locally too, not just relayed ones.
   */
  applyMarkerEvent(msg: RoomEvent) {
    if (msg.type === 'state') { this.markers = msg.markers; return; }
    if (msg.type === 'marker_add' || msg.type === 'marker_remove') {
      this.markers = reduceRoom(
        { type: 'state', site_id: '', t: '', playing: false, speed: 1, markers: this.markers },
        msg,
      ).markers;
    }
  }

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

  /**
   * Where the viewer's eyes should be and what they should face. Smoothed every frame.
   * Called every frame by every phase - uses scratch vectors (below) instead of `new`/
   * `.clone()` so this doesn't add to per-frame GC pressure on top of each phase's own.
   */
  setView(eye: THREE.Vector3, target: THREE.Vector3, o: { up?: THREE.Vector3; rate?: number; snap?: boolean } = {}) {
    const up = o.up ?? this.viewUpScratch.set(0, 1, 0);
    let tgt = target;
    if (this.isXR) {
      // In VR only yaw the rig (pitch/roll belong to the user's head — far more comfortable)
      const f = this.viewFScratch.copy(target).sub(eye);
      f.addScaledVector(up, -f.dot(up));
      if (f.lengthSq() > 1e-6) tgt = this.viewTgtScratch.copy(eye).add(f);
    }
    lookQuat(eye, tgt, up, this.view.quat);
    const rigUp = this.viewRigUpScratch.set(0, 1, 0).applyQuaternion(this.view.quat);
    this.view.pos.copy(eye).addScaledVector(rigUp, -this.eyeHeight);
    if (o.rate !== undefined) this.view.rate = o.rate;
    if (o.snap) this.view.snap = true;
  }

  lookDrag(dx: number, dy: number) {
    this.look.yaw -= dx * 0.004;
    this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - dy * 0.004, -1.2, 1.2);
    this.look.idle = 0;
    this.look.releasing = false;
  }

  /** Suelta lo arrastrado con el ratón (suave) para que el encuadre de la fase vuelva a mandar, p. ej. tras «Mirar al Sol». */
  releaseLook() { this.look.releasing = true; }

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
    const style = p.render ?? DEFAULT_RENDER;
    this.renderer.toneMapping = style.toneMapping;
    this.renderer.toneMappingExposure = style.exposure;
    p.scene.add(this.rig);
    p.enter();
    this.view.snap = true;
    this.look.yaw = 0; this.look.pitch = 0; this.look.releasing = false;
    this.opts.onPhase?.(name);
    this.follow.announce(name, currentLanding(this.data, window.location.search));
  }

  async goTo(name: PhaseName, fadeOut = 0.7, fadeIn = 1.0) {
    if (this.transitioning || !this.run.simulating) return;
    const epoch = this.epoch;
    this.transitioning = true;
    await this.fadeTo(1, fadeOut);
    if (epoch !== this.epoch) return;
    this.setPhase(name);
    await this.fadeTo(0, fadeIn);
    if (epoch === this.epoch) {
      this.transitioning = false;
      this.follow.tryFollow();
    }
  }

  /**
   * Moves the mission to another landing date (the planner, or the crew through the room). The URL
   * carries it for a data load still in flight and for restart(); loaded data changes in place.
   * False, changing nothing, when the loaded ephemeris does not cover the date.
   */
  setLanding(date: Date): boolean {
    if (this.data && !isLandingInRange(date, this.data.ephemerisRange)) return false;
    window.history.replaceState(null, '', withLandingParam(window.location.href, date));
    if (this.data) this.data.landingDate = date;
    return true;
  }

  /** True while the current phase is waiting for the viewer to start it (see PhaseHud.waiting). */
  get awaitingStart() { return this.phase?.controlHud?.().waiting === true; }

  /** Freezes the simulation and the sound; the scene keeps drawing so the viewer can still look around. */
  setPaused(paused: boolean) {
    if (paused && this.awaitingStart) return;
    if (paused ? !this.run.pause() : !this.run.resume()) return;
    if (paused) this.audio.pause(); else this.audio.resume();
  }

  /** Ends the mission: silence, and the phase stays frozen on screen until restart(). */
  stop() {
    if (!this.run.stop()) return;
    this.epoch++;
    this.transitioning = false;
    this.audio.pause();
    this.fadeTo(0, 0.4);
  }

  /** Starts over from the launch with no selection or session flags; date and site come from the URL again. */
  restart() {
    this.epoch++;
    this.transitioning = false;
    this.run.restart();
    this.audio.resume();
    this.runPanelWaiting = false;
    this.flags.clear();
    this.selected = null;
    this.ranking = [];
    this.data = null;
    this.time = 0;
    this.clock.getDelta();
    this.fade.value = 1;
    this.setPhase('launch');
    this.fadeTo(0, 1.2);
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
    const frame = Math.min(this.clock.getDelta(), 1 / 20) * (this.opts.timeScale ?? 1);
    const dt = this.run.step(frame);
    this.time += dt;
    const p = this.phase;
    if (!p) return;
    const vrUi = this.isXR || this.opts.vrPreview === true;
    const genericPanels = vrUi && !p.ownsRunControls;
    showPanels(vrUi);
    this.runPanel.mesh.visible = genericPanels;
    if (this.run.simulating) p.update(dt, this.time);
    p.updateUi?.();

    this.exitPanel.mesh.visible = genericPanels;
    this.exitPanel.update();
    this.avatar.update(frame);
    this.narrator.setMuted(this.audio.muted);

    const k = this.view.snap ? 1 : damp(this.view.rate, frame);
    this.view.snap = false;
    this.rig.position.lerp(this.view.pos, k);
    this.rig.quaternion.slerp(this.view.quat, k);

    if (!this.isXR) {
      this.look.idle += frame;
      if ((this.look.idle > 4 && !p.holdsLook) || this.look.releasing) {
        const d = damp(this.look.releasing ? 4 : 1.2, frame);
        this.look.yaw *= 1 - d; this.look.pitch *= 1 - d;
        if (this.look.releasing && Math.abs(this.look.yaw) + Math.abs(this.look.pitch) < 1e-3) { this.look.yaw = 0; this.look.pitch = 0; this.look.releasing = false; }
      }
      this.camera.position.set(0, this.eyeHeight, 0);
      this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
    }

    const f = this.fade;
    if (f.value !== f.target) {
      const step = f.speed * frame * Math.sign(f.target - f.value);
      f.value = Math.abs(f.target - f.value) <= Math.abs(step) ? f.target : f.value + step;
      if (f.value === f.target) { f.resolve?.(); f.resolve = null; }
    }
    const fm = this.fadeMesh.material as THREE.MeshBasicMaterial;
    fm.opacity = f.value;
    this.fadeMesh.visible = f.value > 0.001;

    this.rig.updateMatrixWorld(true);
    this.input.update();
    if (vrUi) {
      this.waitCheck += frame;
      if (this.waitCheck > 0.25) {
        this.waitCheck = 0;
        const waiting = this.awaitingStart;
        if (waiting !== this.runPanelWaiting) { this.runPanelWaiting = waiting; this.runPanel.invalidate(); }
      }
    }
    if (this.run.mode !== this.runPanelMode) { this.runPanelMode = this.run.mode; this.runPanel.invalidate(); }
    this.runPanel.update();
    this.renderer.render(p.scene, this.camera);
  };

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.unsubscribeLang();
    this.phase?.exit();
    this.runPanel.dispose();
    this.exitPanel.dispose();
    this.avatar.dispose();
    this.narrator.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.room.close();
    this.ro.disconnect();
    this.renderer.xr.getSession()?.end().catch(() => {});
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
