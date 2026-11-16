import { afterEach, describe, expect, it, vi } from 'vitest';
import { T_TOUCH, impactShakeAmplitude, touchdownJolt, watchReducedMotion } from './landing';

/** A matchMedia whose answer can be flipped, as when the person changes the system setting mid-flight. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const query = {
    matches,
    addEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn)),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal('matchMedia', matchMedia);
  return { query, matchMedia, change: (next: boolean) => listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent)) };
}

afterEach(() => vi.unstubAllGlobals());

describe('watchReducedMotion', () => {
  it('asks for prefers-reduced-motion and follows the setting while it is watched', () => {
    const media = stubMatchMedia(true);
    const watcher = watchReducedMotion();
    expect(media.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(watcher.reduced()).toBe(true);
    media.change(false);
    expect(watcher.reduced()).toBe(false);
  });

  it('stops listening when told to', () => {
    const media = stubMatchMedia(false);
    watchReducedMotion().stop();
    expect(media.query.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('leaves motion on where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const watcher = watchReducedMotion();
    expect(watcher.reduced()).toBe(false);
    expect(() => watcher.stop()).not.toThrow();
  });
});

describe('camera shake on the desktop', () => {
  it('shakes after the impact, fading out within 1.2 s', () => {
    expect(impactShakeAmplitude(0, false, false)).toBeCloseTo(0.6);
    expect(impactShakeAmplitude(0.6, false, false)).toBeCloseTo(0.3);
    expect(impactShakeAmplitude(1.2, false, false)).toBe(0);
  });

  it('does not shake in VR or with reduced motion', () => {
    expect(impactShakeAmplitude(0.1, true, false)).toBe(0);
    expect(impactShakeAmplitude(0.1, false, true)).toBe(0);
  });

  it('jolts at touchdown for half a second, and never in VR or with reduced motion', () => {
    expect(touchdownJolt(T_TOUCH + 0.02, false, false)).not.toBe(0);
    expect(touchdownJolt(T_TOUCH - 0.1, false, false)).toBe(0);
    expect(touchdownJolt(T_TOUCH + 0.5, false, false)).toBe(0);
    expect(touchdownJolt(T_TOUCH + 0.02, true, false)).toBe(0);
    expect(touchdownJolt(T_TOUCH + 0.02, false, true)).toBe(0);
  });
});
