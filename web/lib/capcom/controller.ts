import type { LunarApp } from '../engine/app';
import { PcmPlayer } from './audio-playback';
import { startMicrophoneCapture, type MicrophoneCapture } from './audio-capture';
import {
  CAPCOM_ACCESS_EXPIRES_AT,
  CAPCOM_ENDPOINTING,
  CAPCOM_IDLE_CLOSE_MS,
  CAPCOM_RENEW_AFTER_MS,
  CAPCOM_SESSION_LIMIT_MS,
} from './config';
import { createMissionTools, type MissionSource } from './mission-tools';
import type { CapcomEvent, CapcomState, CapcomTool } from './types';

export type CapcomUiState = 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'unavailable';
export type MicPermission = 'unknown' | 'granted' | 'denied';

export interface CapcomSnapshot {
  state: CapcomUiState;
  /** The talk control is held down: the microphone is live. */
  talking: boolean;
  question: string;
  answer: string;
  /** False while the answer is still the model's preview of what it is about to say. */
  answerFinal: boolean;
  message: string | null;
  mic: MicPermission;
}

export interface SessionLike {
  state: CapcomState;
  subscribe: (listener: (event: CapcomEvent) => void) => () => void;
  start: () => Promise<void>;
  sendAudio: (pcm: Int16Array) => void;
  setMuted: (muted: boolean) => void;
  close: () => Promise<void>;
}

export interface PlayerLike {
  start: () => Promise<void>;
  enqueue: (pcm: Int16Array) => void;
  clear: () => void;
  onDrain: (listener: () => void) => () => void;
  close: () => Promise<void>;
}

export type CaptureLike = Pick<MicrophoneCapture, 'stop'>;

export type CapcomHost = MissionSource & Pick<LunarApp, 'audio' | 'narrator'>;

export interface CapcomDeps {
  loadSession: (tools: CapcomTool[]) => Promise<SessionLike>;
  createPlayer: () => PlayerLike;
  startCapture: (onFrame: (pcm: Int16Array) => void) => Promise<CaptureLike>;
  now: () => number;
  /** Receives every session event, for the dev-only debug hook. */
  debug?: (event: CapcomEvent | { type: 'ui'; snapshot: CapcomSnapshot }) => void;
}

export const CAPCOM_UNAVAILABLE = 'CAPCOM no disponible';
const MIC_MESSAGE = 'Permite el micrófono para hablar con CAPCOM.';
const LOST_MESSAGE = 'CAPCOM perdió la conexión · pulsa para reintentar.';
const MAX_PENDING_FRAMES = 320;
const MIN_HOLD_MS = 350;
const ANSWER_WAIT_MS = 15_000;
const DRAIN_GRACE_MS = 1500;
const SPEAKING_WATCHDOG_MS = 45_000;
const CHECK_MS = 1000;

async function defaultLoadSession(tools: CapcomTool[], provider: { current: unknown }) {
  const [{ CapcomSession }, { createGuestCredentialProvider }] = await Promise.all([import('./session'), import('./credentials')]);
  const credentials = (provider.current ??= createGuestCredentialProvider()) as ReturnType<typeof createGuestCredentialProvider>;
  credentials.invalidate();
  return new CapcomSession({ credentials, tools, endpointing: CAPCOM_ENDPOINTING });
}

function readMicPermission(): Promise<MicPermission> {
  const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
  if (!permissions?.query) return Promise.resolve('unknown');
  return permissions
    .query({ name: 'microphone' as PermissionName })
    .then((status) => (status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'unknown') as MicPermission)
    .catch(() => 'unknown' as MicPermission);
}

/**
 * Push-to-talk voice assistant: owns the session, the microphone, the playback queue and what the UI shows.
 * Plain class (no React) so the DOM layer and the in-headset panel read the same state.
 */
export class CapcomController {
  private snap: CapcomSnapshot = { state: 'disconnected', talking: false, question: '', answer: '', answerFinal: false, message: null, mic: 'unknown' };
  private readonly listeners = new Set<() => void>();
  private readonly deps: CapcomDeps;
  private readonly credentialsRef: { current: unknown } = { current: null };

  private session: SessionLike | null = null;
  private opening: Promise<void> | null = null;
  private connecting = false;
  private closing: Promise<void> | null = null;
  private ready = false;
  private capture: CaptureLike | null = null;
  private capturing: Promise<void> | null = null;
  private keepCapture = false;
  private player: PlayerLike | null = null;
  private unsubscribers: Array<() => void> = [];
  private pending: Int16Array[] = [];
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private startedAt = 0;
  private lastActivity = 0;
  private pressedAt = 0;
  private disposed = false;
  private unavailable = false;
  private errorMessage: string | null = null;
  private sessionOff: (() => void) | null = null;

  private awaitingUser = false;
  private questionParts: string[] = [];
  private speculative: string[] = [];
  private finals: string[] = [];
  private thinking = false;
  private speaking = false;
  private modelAudioOpen = false;
  private dropAudio = false;
  private turnEnded = false;
  private playbackPending = false;

  constructor(private readonly host: CapcomHost, deps: Partial<CapcomDeps> = {}) {
    this.deps = {
      loadSession: deps.loadSession ?? ((tools) => defaultLoadSession(tools, this.credentialsRef)),
      createPlayer: deps.createPlayer ?? (() => new PcmPlayer()),
      startCapture: deps.startCapture ?? startMicrophoneCapture,
      now: deps.now ?? Date.now,
      debug: deps.debug,
    };
    if (this.deps.now() >= Date.parse(CAPCOM_ACCESS_EXPIRES_AT)) {
      this.unavailable = true;
      this.snap = { ...this.snap, state: 'unavailable', message: CAPCOM_UNAVAILABLE };
    }
    void readMicPermission().then((mic) => { if (!this.disposed && this.snap.mic === 'unknown') this.publish({ mic }); });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snap;

  /** Starts talking: opens the session on first use, and cuts CAPCOM off if it was speaking. */
  press() {
    if (this.disposed || this.unavailable || this.snap.talking) return;
    const now = this.deps.now();
    this.pressedAt = now;
    this.lastActivity = now;
    if (this.speaking) this.interrupt();
    this.clearThinking();
    this.errorMessage = null;
    this.awaitingUser = true;
    this.questionParts = [];
    this.speculative = [];
    this.finals = [];
    this.pending = [];
    this.session?.setMuted(false);
    this.publish({ talking: true, question: '', answer: '', answerFinal: false });
    void Promise.all([this.ensureCapture(), this.ensureSession()]).then(() => {
      if (!this.capture && this.ready) void this.closeSession();
    });
  }

  /** Stops talking: the microphone goes back to sending silence, and CAPCOM answers. */
  release() {
    if (!this.snap.talking) return;
    this.session?.setMuted(true);
    const held = this.deps.now() - this.pressedAt;
    this.lastActivity = this.deps.now();
    if (held >= MIN_HOLD_MS && !this.errorMessage) this.startThinking();
    this.publish({ talking: false });
  }

  /** Called from the "enter VR" click: asks for the microphone and warms the audio up while a gesture is still available. */
  async prepareForVR(): Promise<boolean> {
    if (this.disposed || this.unavailable) return false;
    this.keepCapture = true;
    await this.ensurePlayer();
    await this.ensureCapture();
    return this.snap.mic === 'granted';
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    void this.closeSession();
    this.keepCapture = false;
    void this.stopCapture();
    void this.player?.close();
    this.player = null;
  }

  private uiState(talking: boolean): CapcomUiState {
    if (this.unavailable) return 'unavailable';
    if (this.errorMessage) return 'error';
    if (this.speaking) return 'speaking';
    if (this.connecting) return 'connecting';
    if (this.thinking && !talking) return 'thinking';
    return this.ready ? 'listening' : 'disconnected';
  }

  private publish(changes: Partial<Omit<CapcomSnapshot, 'state' | 'message'>> = {}) {
    if (this.disposed) return;
    const next = { ...this.snap, ...changes };
    this.snap = { ...next, state: this.uiState(next.talking), message: this.unavailable ? CAPCOM_UNAVAILABLE : this.errorMessage };
    this.deps.debug?.({ type: 'ui', snapshot: this.snap });
    for (const listener of [...this.listeners]) listener();
  }

  private async ensurePlayer() {
    if (this.player) return;
    const player = this.deps.createPlayer();
    this.player = player;
    this.unsubscribers.push(player.onDrain(() => this.onDrained()));
    try {
      await player.start();
    } catch {
      /* playback is retried through the next press; the session still works for text */
    }
  }

  private ensureCapture(): Promise<void> {
    if (this.capture) return Promise.resolve();
    this.capturing ??= (async () => {
      try {
        await this.ensurePlayer();
        this.capture = await this.deps.startCapture((frame) => this.onFrame(frame));
        this.publish({ mic: 'granted' });
      } catch {
        this.errorMessage = MIC_MESSAGE;
        this.publish({ mic: 'denied', talking: false });
        this.session?.setMuted(true);
      } finally {
        this.capturing = null;
      }
    })();
    return this.capturing;
  }

  private async stopCapture() {
    const capture = this.capture;
    this.capture = null;
    await capture?.stop().catch(() => undefined);
  }

  private onFrame(frame: Int16Array) {
    if (!this.ready) {
      if (this.snap.talking && this.pending.length < MAX_PENDING_FRAMES) this.pending.push(frame);
      return;
    }
    this.session?.sendAudio(frame);
  }

  private ensureSession(): Promise<void> {
    if (this.ready) return Promise.resolve();
    this.opening ??= this.openSession();
    return this.opening;
  }

  private async openSession() {
    this.connecting = true;
    this.publish();
    try {
      await this.closing;
      const session = await this.deps.loadSession(createMissionTools(this.host));
      const off = session.subscribe((event) => this.onEvent(event));
      try {
        await session.start();
      } catch (error) {
        off();
        throw error;
      }
      if (this.disposed) { off(); void session.close(); return; }
      this.session = session;
      this.sessionOff = off;
      this.startedAt = this.deps.now();
      this.lastActivity = this.startedAt;
      this.ready = true;
      this.connecting = false;
      // What was said while connecting goes out as real audio even if the button is already up; only then does it go silent.
      session.setMuted(false);
      for (const frame of this.pending) session.sendAudio(frame);
      this.pending = [];
      session.setMuted(!this.snap.talking);
      this.checkTimer ??= setInterval(() => this.check(), CHECK_MS);
      this.publish();
    } catch (error) {
      this.session = null;
      this.ready = false;
      this.pending = [];
      this.opening = null;
      this.connecting = false;
      this.fail(error);
    } finally {
      this.connecting = false;
      this.opening = null;
    }
  }

  private fail(error: unknown) {
    this.deps.debug?.({ type: 'error', code: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) });
    this.endSpeaking();
    this.clearThinking();
    this.unavailable = true;
    void this.teardown();
    this.publish({ talking: false });
  }

  private onEvent(event: CapcomEvent) {
    this.deps.debug?.(event);
    if (this.disposed) return;
    this.lastActivity = this.deps.now();
    switch (event.type) {
      case 'transcript':
        this.onTranscript(event);
        break;
      case 'tool-call':
        if (!this.snap.talking) this.startThinking();
        break;
      case 'audio':
        this.onAudio(event.pcm);
        break;
      case 'audio-end':
        this.modelAudioOpen = false;
        this.dropAudio = false;
        if (event.stopReason !== 'PARTIAL_TURN') this.turnEnded = true;
        this.maybeFinishSpeaking();
        break;
      case 'interrupted':
        this.player?.clear();
        this.modelAudioOpen = false;
        this.dropAudio = false;
        this.endSpeaking();
        this.publish();
        break;
      case 'error':
        this.onSessionError();
        break;
      case 'closed':
        if (event.reason === 'server') void this.closeSession();
        break;
      default:
        break;
    }
  }

  private onTranscript(event: Extract<CapcomEvent, { type: 'transcript' }>) {
    if (event.role === 'user') {
      this.awaitingUser = false;
      this.questionParts.push(event.text.trim());
      this.publish({ question: this.questionParts.join(' ') });
      return;
    }
    if (this.awaitingUser) return;
    if (event.stage === 'final') this.finals.push(event.text.trim());
    else this.speculative.push(event.text.trim());
    const shown = [...this.finals, ...this.speculative.slice(this.finals.length)].join(' ');
    this.publish({ answer: shown, answerFinal: this.finals.length > 0 && this.finals.length >= this.speculative.length });
  }

  private onAudio(pcm: Int16Array) {
    if (this.dropAudio) return;
    this.awaitingUser = false;
    this.clearThinking();
    this.modelAudioOpen = true;
    this.turnEnded = false;
    this.playbackPending = true;
    this.player?.enqueue(pcm);
    if (this.drainTimer) { clearTimeout(this.drainTimer); this.drainTimer = null; }
    if (!this.speaking) this.startSpeaking();
  }

  private startSpeaking() {
    this.speaking = true;
    this.host.audio.setDucked(true);
    this.host.narrator.setSuspended(true);
    this.watchdogTimer = setTimeout(() => this.endSpeaking(true), SPEAKING_WATCHDOG_MS);
    this.publish();
  }

  private endSpeaking(refresh = false) {
    if (this.drainTimer) { clearTimeout(this.drainTimer); this.drainTimer = null; }
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
    this.turnEnded = false;
    this.playbackPending = false;
    if (!this.speaking) return;
    this.speaking = false;
    this.host.audio.setDucked(false);
    this.host.narrator.setSuspended(false);
    this.lastActivity = this.deps.now();
    if (refresh) { this.player?.clear(); this.publish(); }
    else this.publish();
  }

  private onDrained() {
    this.playbackPending = false;
    if (!this.speaking) return;
    if (this.turnEnded) this.endSpeaking();
    else this.drainTimer = setTimeout(() => this.endSpeaking(), DRAIN_GRACE_MS);
  }

  private maybeFinishSpeaking() {
    if (this.speaking && !this.playbackPending) this.endSpeaking();
  }

  private interrupt() {
    this.player?.clear();
    if (this.modelAudioOpen) this.dropAudio = true;
    this.modelAudioOpen = false;
    this.endSpeaking();
  }

  private startThinking() {
    this.thinking = true;
    this.thinkingTimer ??= setTimeout(() => { this.clearThinking(); this.publish(); }, ANSWER_WAIT_MS);
    this.publish();
  }

  private clearThinking() {
    this.thinking = false;
    if (this.thinkingTimer) { clearTimeout(this.thinkingTimer); this.thinkingTimer = null; }
  }

  private onSessionError() {
    const wasReady = this.ready;
    if (!wasReady) return;
    this.endSpeaking();
    this.clearThinking();
    void this.teardown().then(() => {
      this.errorMessage = LOST_MESSAGE;
      this.publish({ talking: false });
    });
  }

  private check() {
    if (!this.ready) return;
    const now = this.deps.now();
    const busy = this.snap.talking || this.speaking || this.thinking;
    if (!busy && now - this.lastActivity >= CAPCOM_IDLE_CLOSE_MS) void this.closeSession();
    else if (!busy && now - this.startedAt >= CAPCOM_RENEW_AFTER_MS) void this.closeSession();
    else if (now - this.startedAt >= CAPCOM_SESSION_LIMIT_MS - 5000) void this.closeSession();
  }

  private closeSession(): Promise<void> {
    if (this.closing) return this.closing;
    if (!this.session && !this.ready) return Promise.resolve();
    this.closing = this.teardown().then(() => {
      this.closing = null;
      if (this.disposed) return;
      this.publish();
    });
    return this.closing;
  }

  private async teardown() {
    const session = this.session;
    this.session = null;
    this.ready = false;
    if (this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = null; }
    this.endSpeaking();
    this.clearThinking();
    this.pending = [];
    if (!this.keepCapture) await this.stopCapture();
    await session?.close().catch(() => undefined);
    this.sessionOff?.();
    this.sessionOff = null;
  }
}
