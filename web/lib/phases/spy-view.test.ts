import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { INTERP_DELAY_S, SpyView } from './spy-view';

const SITE = 'malapert-a';

// jsdom ships no real canvas backend (no `canvas` npm package here), so
// HTMLCanvasElement#getContext('2d') returns null - stub it so the label/
// bezel textures SpyView builds at construction time don't throw.
function fakeCtx2d() {
  const noop = () => {};
  return {
    beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop,
    fill: noop, stroke: noop, clearRect: noop, fillRect: noop, fillText: noop,
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getContext's overloads don't admit a single stub return type
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx2d() as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function camUpdate(t: number, px: number, qy: number) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, qy, 0));
  return { type: 'cam_update' as const, site_id: SITE, px, py: 0, pz: 0, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}

function fakeRenderer() {
  return {
    getRenderTarget: vi.fn(() => null),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

describe('SpyView', () => {
  it('has no signal and shows the no-signal badge before any cam_update arrives', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    expect(spy.hasSignal).toBe(false);
    spy.update(0, fakeRenderer(), []);
    const s = spy as unknown as { videoMesh: THREE.Mesh; placeholderMat: THREE.Material; liveBadge: THREE.Sprite; noSignalBadge: THREE.Sprite };
    expect(s.videoMesh.material).toBe(s.placeholderMat);
    expect(s.liveBadge.visible).toBe(false);
    expect(s.noSignalBadge.visible).toBe(true);
  });

  it('parks exactly on the first sample instead of interpolating from the origin', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    spy.handleRoomEvent(camUpdate(0, 42, Math.PI / 2), 10);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };
    s.interpolatePose(10);
    expect(s.remoteCam.position.x).toBeCloseTo(42);
  });

  it('lerps/slerps smoothly between the last two samples instead of snapping', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };

    spy.handleRoomEvent(camUpdate(0, 0, 0), 0);
    spy.handleRoomEvent(camUpdate(0.1, 10, Math.PI / 2), 0.1);

    // interpolatePose renders at `now - INTERP_DELAY_S`, so "halfway between the samples" means
    // now = INTERP_DELAY_S + 0.05, not 0.05 itself - see the regression test below for why.
    s.interpolatePose(INTERP_DELAY_S + 0.05); // halfway between the two samples in time
    expect(s.remoteCam.position.x).toBeCloseTo(5, 1);
    const halfAngle = s.remoteCam.quaternion.angleTo(new THREE.Quaternion());
    expect(halfAngle).toBeGreaterThan(0.1);
    expect(halfAngle).toBeLessThan(Math.PI / 2 - 0.1);

    s.interpolatePose(INTERP_DELAY_S + 0.1); // right on the latest sample
    expect(s.remoteCam.position.x).toBeCloseTo(10, 1);
  });

  it('regression: does not snap to a new sample on the very next frame', () => {
    // `handleRoomEvent` is fed LunarApp.time (pov.ts), which only advances inside the render loop
    // and is bumped BEFORE phases update - so the first `update()`/`interpolatePose()` call after
    // any sample arrives always sees `now` already past that sample's own timestamp. Without a
    // render delay, alpha saturates to 1 right there and the camera snaps on every single sample,
    // exactly like before this feature existed. This is the bug the interpolation was meant to fix.
    const spy = new SpyView(new THREE.Scene(), SITE);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };

    spy.handleRoomEvent(camUpdate(0, 0, 0), 0);
    spy.handleRoomEvent(camUpdate(0.1, 10, 0), 0.1);

    s.interpolatePose(0.1 + 1 / 90); // "the next rendered frame" at a typical VR framerate
    expect(s.remoteCam.position.x).toBeLessThan(5);
  });

  it('regression: a same-timestamp burst (e.g. a backgrounded tab) does not evict real history', () => {
    // LunarApp.time freezes while this tab is backgrounded (no rAF), but cam_update messages
    // keep arriving over the WebSocket regardless - each one lands with the exact same `now`.
    const spy = new SpyView(new THREE.Scene(), SITE);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };

    for (let i = 0; i <= 7; i++) spy.handleRoomEvent(camUpdate(i * 0.1, i * 10, 0), i * 0.1); // fills the 8-sample buffer: x 0..70
    const frozenAt = 0.7;
    for (let i = 0; i < 12; i++) spy.handleRoomEvent(camUpdate(frozenAt, 70 + i, 0), frozenAt); // the burst while frozen

    // On resume the render clock starts advancing again from just past the freeze. If the burst
    // had evicted the real pre-freeze history, there would be nothing older than `frozenAt` left
    // to bracket against and this would land somewhere in the burst's range (70-81), not here.
    s.interpolatePose(frozenAt + 0.01);
    expect(s.remoteCam.position.x).toBeGreaterThanOrEqual(50);
    expect(s.remoteCam.position.x).toBeLessThanOrEqual(60);
  });

  it('tracks a steady 10 Hz stream smoothly under a realistic 90 fps render loop', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };
    const FRAME_DT = 1 / 90;
    const SEND_DT = 0.1; // matches CAM_SEND_INTERVAL_S in pov.ts
    let appTime = 0;
    let nextSendAt = 0;
    let hostX = 0;
    const seenX: number[] = [];

    for (let i = 0; i < 400; i++) {
      appTime += FRAME_DT;
      if (appTime >= nextSendAt) {
        hostX += 1; // the host walks forward at a steady 10 units/s
        spy.handleRoomEvent(camUpdate(appTime, hostX, 0), appTime);
        nextSendAt += SEND_DT;
      }
      s.interpolatePose(appTime);
      seenX.push(s.remoteCam.position.x);
    }

    // Past the initial delay-buffer warm-up, motion should be a smooth climb in small per-frame
    // steps, never a whole-unit jump (which is what snapping to each new sample would look like).
    const steady = seenX.slice(50);
    const steps = steady.slice(1).map((v, i) => v - steady[i]);
    expect(Math.max(...steps)).toBeLessThan(0.3);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0); // monotonic - the host never walks backward here
    expect(steady.at(-1)).toBeGreaterThan(30); // actually kept up over the ~4.4s simulated
  });

  it('clamps to the latest sample instead of overshooting when no fresher data has arrived', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    const s = spy as unknown as { interpolatePose: (now: number) => void; remoteCam: THREE.PerspectiveCamera };

    spy.handleRoomEvent(camUpdate(0, 0, 0), 0);
    spy.handleRoomEvent(camUpdate(0.1, 10, 0), 0.1);

    s.interpolatePose(5); // long after the last sample (e.g. the sender paused)
    expect(s.remoteCam.position.x).toBeCloseTo(10);
  });

  it('renders once per throttle window while live, and skips the stale placeholder', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    spy.handleRoomEvent(camUpdate(0, 1, 0), 0);
    const renderer = fakeRenderer();

    spy.update(0, renderer, []);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    spy.update(0.01, renderer, []); // well inside the 1/12s throttle window
    expect(renderer.render).toHaveBeenCalledTimes(1);

    spy.update(1, renderer, []); // long past the throttle window
    expect(renderer.render).toHaveBeenCalledTimes(2);

    const s = spy as unknown as { videoMesh: THREE.Mesh; liveMat: THREE.Material };
    expect(s.videoMesh.material).toBe(s.liveMat);
  });

  it('goes stale and falls back to the placeholder after a long silence', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    spy.handleRoomEvent(camUpdate(0, 1, 0), 0);
    const renderer = fakeRenderer();
    spy.update(0, renderer, []);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    spy.update(10, renderer, []); // past STALE_AFTER_S with no new cam_update
    expect(renderer.render).toHaveBeenCalledTimes(1); // no extra render while stale
    const s = spy as unknown as { videoMesh: THREE.Mesh; placeholderMat: THREE.Material };
    expect(s.videoMesh.material).toBe(s.placeholderMat);
  });

  it('reports live while the inspector is heard from and goes back to no signal after three seconds', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    expect(spy.live).toBe(false);
    spy.update(0, fakeRenderer(), []);
    expect(spy.live).toBe(false);

    spy.handleRoomEvent(camUpdate(1, 1, 0), 1);
    spy.update(1.05, fakeRenderer(), []);
    expect(spy.live).toBe(true);
    spy.update(3.9, fakeRenderer(), []);
    expect(spy.live).toBe(true);
    spy.update(4.1, fakeRenderer(), []);
    expect(spy.live).toBe(false);

    spy.handleRoomEvent(camUpdate(5, 2, 0), 5);
    spy.update(5.05, fakeRenderer(), []);
    expect(spy.live).toBe(true);
  });

  it('ignores a cam_update of another site, so it never turns live for it', () => {
    const spy = new SpyView(new THREE.Scene(), SITE);
    spy.handleRoomEvent({ ...camUpdate(1, 1, 0), site_id: 'other' }, 1);
    spy.update(1.05, fakeRenderer(), []);
    expect(spy.live).toBe(false);
  });

  it('exposes the texture of its capture and takes the size of the box it is drawn in', () => {
    const wide = new SpyView(new THREE.Scene(), SITE, { w: 640, h: 360 });
    const target = (wide as unknown as { target: THREE.WebGLRenderTarget }).target;
    expect(wide.texture).toBe(target.texture);
    expect([target.width, target.height]).toEqual([640, 360]);
    const classic = new SpyView(new THREE.Scene(), SITE);
    const t2 = (classic as unknown as { target: THREE.WebGLRenderTarget }).target;
    expect([t2.width, t2.height]).toEqual([640, 480]);
  });
});
