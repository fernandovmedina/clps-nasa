import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/lib/i18n';
import { CapcomController, type CapcomHost, type CapcomSnapshot, type SessionLike } from './controller';
import type { CapcomEvent } from './types';
import { CAPCOM_ACCESS_EXPIRES_AT, CAPCOM_IDLE_CLOSE_MS } from './config';

const AFTER_EXPIRY = new Date(Date.parse(CAPCOM_ACCESS_EXPIRES_AT) + 1000);

const pcm = (...values: number[]) => new Int16Array(values);
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

class FakeSession implements SessionLike {
  state: SessionLike['state'] = 'closed';
  muted: boolean[] = [];
  sent: Int16Array[] = [];
  private silenced = false;
  closed = 0;
  private listener: ((e: CapcomEvent) => void) | null = null;
  constructor(private startError: Error | null = null, private gate: Promise<void> | null = null) {}
  subscribe(listener: (e: CapcomEvent) => void) { this.listener = listener; return () => { this.listener = null; }; }
  start = vi.fn(async () => { await this.gate; if (this.startError) throw this.startError; this.state = 'listening'; });
  /** Like the real session: while muted, the microphone is replaced by silence. */
  sendAudio = (frame: Int16Array) => { this.sent.push(this.silenced ? new Int16Array(frame.length) : frame); };
  setMuted = (muted: boolean) => { this.silenced = muted; this.muted.push(muted); };
  close = vi.fn(async () => { this.closed++; this.state = 'closed'; });
  emit(event: CapcomEvent) { this.listener?.(event); }
}

function setup(options: { startError?: Error | null; captureError?: Error; hold?: boolean } = {}) {
  const sessions: FakeSession[] = [];
  let open = () => {};
  const gate = options.hold ? new Promise<void>((resolve) => { open = resolve; }) : null;
  const loadSession = vi.fn(async () => {
    const session = new FakeSession(options.startError ?? null, gate);
    sessions.push(session);
    return session;
  });
  const player = { start: vi.fn(async () => {}), enqueue: vi.fn(), clear: vi.fn(), close: vi.fn(async () => {}), drain: () => {} };
  const drainListeners: Array<() => void> = [];
  const playerLike = { ...player, onDrain: (l: () => void) => { drainListeners.push(l); return () => {}; } };
  const frames: { push: (frame: Int16Array) => void } = { push: () => {} };
  const capture = { stop: vi.fn(async () => {}) };
  const startCapture = vi.fn(async (onFrame: (frame: Int16Array) => void) => {
    if (options.captureError) throw options.captureError;
    frames.push = onFrame;
    return capture;
  });
  const host = {
    audio: { setDucked: vi.fn() },
    narrator: { setSuspended: vi.fn() },
    phase: null, selected: null, ranking: [], data: null, run: { mode: 'running' }, awaitingStart: false,
  } as unknown as CapcomHost;
  const controller = new CapcomController(host, { loadSession, createPlayer: () => playerLike, startCapture, now: () => Date.now() });
  const states: string[] = [];
  controller.subscribe(() => { const s = controller.getSnapshot().state; if (states.at(-1) !== s) states.push(s); });
  return {
    controller, host, options, open: () => open(), sessions, loadSession, player: playerLike, playerSpies: player, drain: () => drainListeners.forEach((l) => l()), frames, capture, startCapture, states,
    snap: (): CapcomSnapshot => controller.getSnapshot(),
    session: () => sessions.at(-1)!,
  };
}

const audioEvent = (v = 1): CapcomEvent => ({ type: 'audio', pcm: pcm(v, v), sampleRate: 24000 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('CapcomController', () => {
  it('does not load the session or touch the microphone until the first press', async () => {
    const t = setup();
    await flush();
    expect(t.loadSession).not.toHaveBeenCalled();
    expect(t.startCapture).not.toHaveBeenCalled();
    expect(t.snap().state).toBe('disconnected');
  });

  it('opens the session on first press and keeps what was said while it connected', async () => {
    const t = setup({ hold: true });
    t.controller.press();
    expect(t.snap()).toMatchObject({ state: 'connecting', talking: true });
    await flush();
    t.frames.push(pcm(1));
    t.frames.push(pcm(2));
    expect(t.sessions).toHaveLength(1);
    expect(t.session().sent).toHaveLength(0);
    t.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('listening');
    expect(t.session().sent.map((f) => f[0])).toEqual([1, 2]);
    t.frames.push(pcm(3));
    expect(t.session().sent.map((f) => f[0])).toEqual([1, 2, 3]);
    expect(t.session().muted.at(-1)).toBe(false);
  });

  it('keeps the question as real audio when the button is released before the session connects', async () => {
    const t = setup({ hold: true });
    t.controller.press();
    await flush();
    t.frames.push(pcm(11));
    t.frames.push(pcm(12));
    t.frames.push(pcm(13));
    t.controller.release();
    t.frames.push(pcm(99));
    t.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('listening');
    expect(t.session().sent.map((f) => Array.from(f))).toEqual([[11], [12], [13]]);
    expect(t.session().muted.at(-1)).toBe(true);
    t.frames.push(pcm(5));
    expect(Array.from(t.session().sent.at(-1)!)).toEqual([0]);
  });

  it('sends silence instead of the microphone while the control is not held, and never cuts the stream', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    expect(t.session().muted.at(-1)).toBe(true);
    const before = t.session().sent.length;
    t.frames.push(pcm(9));
    expect(t.session().sent.length).toBe(before + 1);
    t.controller.press();
    expect(t.session().muted.at(-1)).toBe(false);
  });

  it('goes listening -> thinking -> speaking -> listening, ducking the sound and the narrator only while it speaks', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(800);
    t.controller.release();
    expect(t.snap().state).toBe('thinking');

    t.session().emit({ type: 'transcript', role: 'user', stage: 'final', text: 'cómo va el viaje' });
    t.session().emit({ type: 'tool-call', toolUseId: 'u', name: 'estado_del_viaje', input: {} });
    t.session().emit({ type: 'transcript', role: 'assistant', stage: 'speculative', text: 'Vamos a 169 km de altitud.' });
    expect(t.snap().state).toBe('thinking');
    expect(t.host.audio.setDucked).not.toHaveBeenCalled();

    t.session().emit(audioEvent());
    expect(t.snap().state).toBe('speaking');
    expect(t.host.audio.setDucked).toHaveBeenLastCalledWith(true);
    expect(t.host.narrator.setSuspended).toHaveBeenLastCalledWith(true);
    expect(t.playerSpies.enqueue).toHaveBeenCalledTimes(1);

    t.session().emit({ type: 'audio-end', stopReason: 'END_TURN' });
    expect(t.snap().state).toBe('speaking');
    t.drain();
    expect(t.snap().state).toBe('listening');
    expect(t.host.audio.setDucked).toHaveBeenLastCalledWith(false);
    expect(t.host.narrator.setSuspended).toHaveBeenLastCalledWith(false);
  });

  it('keeps speaking for as long as the playback lasts, even after the model finished generating', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.session().emit(audioEvent());
    t.session().emit({ type: 'audio-end', stopReason: 'END_TURN' });
    vi.advanceTimersByTime(5000);
    expect(t.snap().state).toBe('speaking');
    t.drain();
    expect(t.snap().state).toBe('listening');
  });

  it('shows the transcribed question and the answer, final once the spoken text arrives', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.session().emit({ type: 'transcript', role: 'user', stage: 'final', text: 'cómo va el viaje' });
    t.session().emit({ type: 'transcript', role: 'user', stage: 'final', text: 'cuánto falta' });
    t.session().emit({ type: 'transcript', role: 'assistant', stage: 'speculative', text: 'Faltan 404 200 km.' });
    expect(t.snap()).toMatchObject({ question: 'cómo va el viaje cuánto falta', answer: 'Faltan 404 200 km.', answerFinal: false });
    t.session().emit({ type: 'transcript', role: 'assistant', stage: 'final', text: 'Faltan 404 200 kilómetros.' });
    expect(t.snap()).toMatchObject({ answer: 'Faltan 404 200 kilómetros.', answerFinal: true });
  });

  it('ignores a late answer from the previous turn until the new question is heard', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.controller.press();
    t.session().emit({ type: 'transcript', role: 'assistant', stage: 'final', text: 'respuesta vieja' });
    expect(t.snap().answer).toBe('');
    t.session().emit({ type: 'transcript', role: 'user', stage: 'final', text: 'otra pregunta' });
    t.session().emit({ type: 'transcript', role: 'assistant', stage: 'final', text: 'respuesta nueva' });
    expect(t.snap().answer).toBe('respuesta nueva');
  });

  it('pressing while CAPCOM speaks cuts its audio and drops what the model is still sending', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.session().emit(audioEvent());
    expect(t.snap().state).toBe('speaking');

    t.controller.press();
    expect(t.playerSpies.clear).toHaveBeenCalled();
    expect(t.host.audio.setDucked).toHaveBeenLastCalledWith(false);
    expect(t.snap()).toMatchObject({ talking: true, state: 'listening' });

    t.session().emit(audioEvent(5));
    expect(t.playerSpies.enqueue).toHaveBeenCalledTimes(1);
    t.session().emit({ type: 'audio-end', stopReason: 'INTERRUPTED' });
    t.controller.release();
    t.session().emit(audioEvent(7));
    expect(t.playerSpies.enqueue).toHaveBeenCalledTimes(2);
    expect(t.snap().state).toBe('speaking');
  });

  it('a barge-in signal from the model also clears the queue and ends the speaking state', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.session().emit(audioEvent());
    t.session().emit({ type: 'interrupted' });
    expect(t.playerSpies.clear).toHaveBeenCalled();
    expect(t.snap().state).toBe('listening');
    expect(t.host.narrator.setSuspended).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['AccessDenied', Object.assign(new Error('not allowed'), { name: 'AccessDenied' })],
    ['NotAuthorizedException', Object.assign(new Error('x'), { name: 'NotAuthorizedException' })],
    ['ExpiredToken', Object.assign(new Error('x'), { name: 'ExpiredTokenException' })],
    ['a 403 response', Object.assign(new Error('forbidden'), { $metadata: { httpStatusCode: 403 } })],
  ])('becomes unavailable for good when the access is refused (%s), and then ignores the button', async (_label, error) => {
    const t = setup({ startError: error });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap()).toMatchObject({ state: 'unavailable', message: 'CAPCOM no disponible', talking: false });
    t.controller.press();
    expect(t.snap().talking).toBe(false);
    expect(t.loadSession).toHaveBeenCalledTimes(1);
  });

  it('a network failure while connecting is an error to retry: the button stays usable and the next press connects from scratch', async () => {
    const t = setup({ startError: new Error('Failed to fetch') });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap()).toMatchObject({ state: 'error', talking: false });
    expect(t.snap().message).toMatch(/pulsa para reintentar/);
    expect(t.loadSession).toHaveBeenCalledTimes(1);

    t.options.startError = null;
    t.controller.press();
    expect(t.snap()).toMatchObject({ talking: true, message: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.loadSession).toHaveBeenCalledTimes(2);
    expect(t.sessions).toHaveLength(2);
    expect(t.snap()).toMatchObject({ state: 'listening', message: null });
  });

  it('does not leave the microphone open after a failed connection, and the retry opens it again', async () => {
    const t = setup({ startError: new Error('Failed to fetch') });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('error');
    expect(t.capture.stop).toHaveBeenCalledTimes(1);
    t.options.startError = null;
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.startCapture).toHaveBeenCalledTimes(2);
    expect(t.snap().state).toBe('listening');
  });

  it('a timeout or a closed socket while connecting is also retryable, any number of times', async () => {
    const t = setup({ startError: Object.assign(new Error('timeout'), { $metadata: { httpStatusCode: 500, websocketSynthetic500Error: true } }) });
    for (let i = 0; i < 3; i++) {
      t.controller.press();
      await vi.advanceTimersByTimeAsync(0);
      expect(t.snap().state).toBe('error');
      t.controller.release();
    }
    expect(t.loadSession).toHaveBeenCalledTimes(3);
  });

  it('the guest access ending while the page is open makes CAPCOM unavailable on the next press, without connecting', async () => {
    const t = setup();
    vi.setSystemTime(AFTER_EXPIRY);
    t.controller.press();
    expect(t.snap()).toMatchObject({ state: 'unavailable', message: 'CAPCOM no disponible', talking: false });
    expect(t.loadSession).not.toHaveBeenCalled();
  });

  it('a failed connection after the expiry is unavailable even when the error looks like a network one', async () => {
    const t = setup({ startError: new Error('Failed to fetch') });
    t.controller.press();
    vi.setSystemTime(AFTER_EXPIRY);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('unavailable');
  });

  it('is unavailable from the start once the guest access has expired', () => {
    vi.setSystemTime(AFTER_EXPIRY);
    const t = setup();
    expect(t.snap()).toMatchObject({ state: 'unavailable', message: 'CAPCOM no disponible' });
    t.controller.press();
    expect(t.loadSession).not.toHaveBeenCalled();
  });

  it('reports a denied microphone as a recoverable error and does not make CAPCOM unavailable', async () => {
    const t = setup({ captureError: new Error('NotAllowedError') });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap()).toMatchObject({ state: 'error', mic: 'denied', talking: false });
    expect(t.snap().message).toMatch(/micrófono/);
    expect(t.session().closed).toBe(1);
    t.controller.press();
    expect(t.snap().state).not.toBe('unavailable');
  });

  it('closes after 90 seconds without use and reopens by itself on the next press', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    await vi.advanceTimersByTimeAsync(89_000);
    expect(t.session().closed).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.sessions[0]!.closed).toBe(1);
    expect(t.capture.stop).toHaveBeenCalled();
    expect(t.snap().state).toBe('disconnected');

    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sessions).toHaveLength(2);
    expect(t.snap().state).toBe('listening');
  });

  it('renews the session at 7:30 when it is not busy, even if it was used recently', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    for (let i = 0; i < 14; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      t.session().emit({ type: 'transcript', role: 'user', stage: 'final', text: '.' });
    }
    expect(t.sessions[0]!.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.sessions[0]!.closed).toBe(1);
  });

  it('does not close in the middle of an answer', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.session().emit(audioEvent());
    await vi.advanceTimersByTimeAsync(100_000);
    expect(t.sessions[0]!.closed).toBe(0);
  });

  it('a lost connection is an error to retry; a retry that fails on the network is retryable again, one refused by AWS is not', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.session().emit({ type: 'error', code: 'ThrottlingException', message: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap()).toMatchObject({ state: 'error' });
    expect(t.snap().message).toMatch(/pulsa para reintentar/);

    t.options.startError = new Error('Failed to fetch');
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('error');
    t.controller.release();

    t.options.startError = Object.assign(new Error('denied'), { name: 'AccessDenied' });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('unavailable');
  });

  it('a close from the server goes back to disconnected without an error', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.release();
    t.session().emit({ type: 'closed', reason: 'server' });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().state).toBe('disconnected');
  });

  it('prepareForVR asks for the microphone ahead of time and keeps it open for the headset', async () => {
    const t = setup();
    await expect(t.controller.prepareForVR()).resolves.toBe(true);
    expect(t.startCapture).toHaveBeenCalledTimes(1);
    expect(t.loadSession).not.toHaveBeenCalled();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.capture.stop).not.toHaveBeenCalled();
  });

  it('prepareForVR reports a denied microphone', async () => {
    const t = setup({ captureError: new Error('NotAllowedError') });
    await expect(t.controller.prepareForVR()).resolves.toBe(false);
    expect(t.snap().mic).toBe('denied');
  });

  it('dispose closes the session, the microphone and the player', async () => {
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    t.controller.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sessions[0]!.closed).toBe(1);
    expect(t.capture.stop).toHaveBeenCalled();
    expect(t.playerSpies.close).toHaveBeenCalled();
  });
});

describe('CapcomController language', () => {
  it('shows its messages in English and follows a later language change', async () => {
    setLang('en', { persist: false });
    const t = setup({ startError: new Error('Failed to fetch') });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap()).toMatchObject({ state: 'error', message: 'Could not reach CAPCOM · press to retry.' });
    setLang('es', { persist: false });
    expect(t.snap().message).toBe('No se pudo conectar con CAPCOM · pulsa para reintentar.');
  });

  it('says it is unavailable in English', () => {
    setLang('en', { persist: false });
    vi.setSystemTime(AFTER_EXPIRY);
    const t = setup();
    expect(t.snap()).toMatchObject({ state: 'unavailable', message: 'CAPCOM unavailable' });
  });

  it('English microphone message when the permission is denied', async () => {
    setLang('en', { persist: false });
    const t = setup({ captureError: new Error('NotAllowedError') });
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.snap().message).toBe('Allow the microphone to talk to CAPCOM.');
  });

  it('opens each session in the language of that moment and never cuts an open one when the language changes', async () => {
    setLang('es', { persist: false });
    const t = setup();
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.loadSession).toHaveBeenLastCalledWith(expect.any(Array), 'es');

    setLang('en', { persist: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sessions[0]!.closed).toBe(0);
    expect(t.snap().state).toBe('listening');

    // The open session's tools keep speaking Spanish.
    const spanishTools = (t.loadSession.mock.calls as unknown[][])[0]![0] as Array<{ name: string; run: (i: unknown) => unknown }>;
    expect(spanishTools.find((x) => x.name === 'datos_de_mision')!.run({})).toMatchObject({ disponible: false, motivo: 'Los datos de la misión todavía se están cargando.' });

    t.controller.release();
    await vi.advanceTimersByTimeAsync(CAPCOM_IDLE_CLOSE_MS + 2000);
    expect(t.sessions[0]!.closed).toBe(1);
    t.controller.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.loadSession).toHaveBeenLastCalledWith(expect.any(Array), 'en');
    const englishTools = (t.loadSession.mock.calls as unknown[][])[1]![0] as Array<{ name: string; run: (i: unknown) => unknown }>;
    expect(englishTools.find((x) => x.name === 'datos_de_mision')!.run({})).toMatchObject({ disponible: false, motivo: 'The mission data is still loading.' });
  });

  it('stops listening to the language after dispose', () => {
    const t = setup();
    const seen = vi.fn();
    t.controller.subscribe(seen);
    t.controller.dispose();
    setLang('en', { persist: false });
    expect(seen).not.toHaveBeenCalled();
  });
});
