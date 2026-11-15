import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './audio';

class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  cancelScheduledValues() { return this; }
}
const node = () => ({ gain: new FakeParam(), threshold: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(), connect() {}, disconnect() {} });

class FakeContext {
  static last: FakeContext | null = null;
  sampleRate = 8000;
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = {};
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { FakeContext.last = this; }
  createGain() { return node(); }
  createDynamicsCompressor() { return node(); }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; }
}

const gesture = () => window.dispatchEvent(new Event('pointerdown'));

describe('AudioEngine pause and resume', () => {
  beforeEach(() => {
    FakeContext.last = null;
    vi.stubGlobal('AudioContext', FakeContext);
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('suspends and resumes the context without touching the mute preference', () => {
    const audio = new AudioEngine();
    gesture();
    const ctx = FakeContext.last!;
    expect(ctx.state).toBe('running');

    audio.pause();
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(audio.muted).toBe(false);
    expect(window.localStorage.getItem('touchdown:sound-muted')).toBeNull();

    audio.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(audio.muted).toBe(false);
    audio.dispose();
  });

  it('keeps the context suspended when the viewer clicks while paused', () => {
    const audio = new AudioEngine();
    gesture();
    const ctx = FakeContext.last!;
    audio.pause();
    ctx.resume.mockClear();
    gesture();
    gesture();
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.state).toBe('suspended');
    audio.dispose();
  });

  it('does not wake up on tab visibility while paused, and does afterwards', () => {
    const audio = new AudioEngine();
    gesture();
    const ctx = FakeContext.last!;
    audio.pause();
    ctx.resume.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resume).not.toHaveBeenCalled();
    audio.resume();
    expect(ctx.state).toBe('running');
    audio.dispose();
  });

  it('a tab that comes back to the foreground does not resume sound the viewer paused', () => {
    const audio = new AudioEngine();
    gesture();
    const ctx = FakeContext.last!;
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.state).toBe('suspended');
    audio.pause();
    hidden = false;
    ctx.resume.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resume).not.toHaveBeenCalled();
    audio.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document, 'hidden');
    audio.dispose();
  });

  it('starts suspended when the first gesture arrives while already paused', () => {
    const audio = new AudioEngine();
    audio.pause();
    gesture();
    expect(FakeContext.last!.suspend).toHaveBeenCalled();
    audio.dispose();
  });

  it('does not throw before any context exists', () => {
    const audio = new AudioEngine();
    expect(() => { audio.pause(); audio.resume(); }).not.toThrow();
    expect(audio.muted).toBe(false);
    audio.dispose();
  });
});
