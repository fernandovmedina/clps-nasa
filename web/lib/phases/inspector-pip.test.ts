import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '@touchdown/core';

const spies: FakeSpy[] = [];
class FakeSpy {
  mesh = new THREE.Group();
  texture = new THREE.Texture();
  live = false;
  handled: unknown[] = [];
  updates: { now: number; hidden: THREE.Object3D[] }[] = [];
  disposed = false;
  constructor(public scene: THREE.Scene, public siteId: string, public size?: { w: number; h: number }) { spies.push(this); }
  handleRoomEvent(msg: unknown) { this.handled.push(msg); }
  update(now: number, _r: unknown, hidden: THREE.Object3D[]) { this.updates.push({ now, hidden }); }
  dispose() { this.disposed = true; }
}
vi.mock('./spy-view', () => ({ SpyView: FakeSpy, WIDE_SIZE: { w: 640, h: 360 } }));

const { InspectorFeed, InspectorPip, rectToViewport, viewportToPixels } = await import('./inspector-pip');

beforeEach(() => { spies.length = 0; });

describe('rectToViewport', () => {
  const canvas = { left: 0, top: 0, width: 1280, height: 720 };

  it('flips the vertical axis: the viewport starts at the bottom left', () => {
    // 400x225 box 20 px from the right and 84 px above the bottom edge
    const rect = { left: 860, top: 411, width: 400, height: 225 };
    expect(rectToViewport(rect, canvas)).toEqual({ x: 860, y: 84, width: 400, height: 225 });
  });

  it('is relative to the canvas, not to the page', () => {
    const offset = { left: 100, top: 50, width: 1000, height: 600 };
    const rect = { left: 700, top: 300, width: 200, height: 100 };
    expect(rectToViewport(rect, offset)).toEqual({ x: 600, y: 250, width: 200, height: 100 });
  });

  it('clips to the canvas and refuses what is off it', () => {
    expect(rectToViewport({ left: 1200, top: 600, width: 200, height: 200 }, canvas)).toEqual({ x: 1200, y: 0, width: 80, height: 120 });
    expect(rectToViewport({ left: 1300, top: 0, width: 100, height: 100 }, canvas)).toBeNull();
    expect(rectToViewport({ left: 10, top: 10, width: 0, height: 100 }, canvas)).toBeNull();
  });
});

describe('viewportToPixels', () => {
  const vp = { x: 860, y: 84, width: 400, height: 225 };

  it('scales by the renderer pixel ratio', () => {
    expect(viewportToPixels(vp, 1)).toEqual(vp);
    expect(viewportToPixels(vp, 2)).toEqual({ x: 1720, y: 168, width: 800, height: 450 });
    expect(viewportToPixels(vp, 1.5)).toEqual({ x: 1290, y: 126, width: 600, height: 337 });
  });

  it('follows the clamp the app puts on a dense screen: devicePixelRatio 3 renders at 2', () => {
    const ratio = Math.min(3, 2);
    expect(viewportToPixels(vp, ratio).width).toBe(800);
  });
});

describe('InspectorPip.draw', () => {
  function fakeRenderer(xr = false) {
    const calls: string[] = [];
    const renderer = {
      xr: { isPresenting: xr },
      domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
      autoClear: true,
      getScissorTest: () => false,
      getRenderTarget: () => null,
      getViewport: (v: THREE.Vector4) => v.set(0, 0, 1280, 720),
      getScissor: (v: THREE.Vector4) => v.set(0, 0, 1280, 720),
      setRenderTarget: () => calls.push('target'),
      setViewport: (...a: unknown[]) => calls.push(`viewport ${a.length === 1 ? 'restore' : a.join(',')}`),
      setScissor: (...a: unknown[]) => calls.push(`scissor ${a.length === 1 ? 'restore' : a.join(',')}`),
      setScissorTest: (v: boolean) => calls.push(`scissorTest ${v}`),
      render: () => calls.push(`render autoClear=${renderer.autoClear}`),
    };
    return { renderer: renderer as unknown as THREE.WebGLRenderer, calls, raw: renderer };
  }
  const host = { getBoundingClientRect: () => ({ left: 860, top: 411, width: 400, height: 225 }) as DOMRect };

  it('draws the capture into the rectangle of the container, without clearing the main render', () => {
    const pip = new InspectorPip();
    pip.source = { texture: new THREE.Texture(), live: true };
    pip.host = host;
    const { renderer, calls, raw } = fakeRenderer();
    pip.draw(renderer);
    expect(calls).toContain('viewport 860,84,400,225');
    expect(calls).toContain('scissor 860,84,400,225');
    expect(calls).toContain('scissorTest true');
    expect(calls).toContain('render autoClear=false');
    expect(raw.autoClear).toBe(true);
    expect(calls.at(-1)).toBe('scissorTest false');
  });

  it('draws nothing without signal, without a container, without a source or in the headset', () => {
    const base = () => { const p = new InspectorPip(); p.source = { texture: new THREE.Texture(), live: true }; p.host = host; return p; };
    const idle = fakeRenderer();
    const noSignal = base(); noSignal.source = { texture: new THREE.Texture(), live: false }; noSignal.draw(idle.renderer);
    const noHost = base(); noHost.host = null; noHost.draw(idle.renderer);
    const noSource = base(); noSource.source = null; noSource.draw(idle.renderer);
    expect(idle.calls).toEqual([]);
    const inXr = fakeRenderer(true);
    base().draw(inXr.renderer);
    expect(inXr.calls).toEqual([]);
  });

  it('reports whether the source is live', () => {
    const pip = new InspectorPip();
    expect(pip.live).toBe(false);
    pip.source = { texture: new THREE.Texture(), live: true };
    expect(pip.live).toBe(true);
    pip.source = { texture: new THREE.Texture(), live: false };
    expect(pip.live).toBe(false);
  });
});

function fakeApp(isHost: boolean, over: { xr?: boolean; preview?: boolean } = {}) {
  const sent: ClientMessage[] = [];
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const app = {
    isHost, isXR: over.xr === true, rig: new THREE.Group(), camera, renderer: {} as THREE.WebGLRenderer,
    room: { send: (m: ClientMessage) => { sent.push(m); } },
    pip: new InspectorPip(),
    opts: { vrPreview: over.preview === true },
  };
  return { app: app as unknown as ConstructorParameters<typeof InspectorFeed>[0], sent, pip: app.pip };
}

describe('InspectorFeed in each surface phase', () => {
  for (const phase of ['pov', 'landing', 'transmit']) {
    it(`${phase}: the host sends its camera at 10 Hz and has no picture-in-picture`, () => {
      const { app, sent, pip } = fakeApp(true);
      const feed = new InspectorFeed(app, new THREE.Scene(), `site-${phase}`);
      feed.sync();
      for (let t = 0; t < 3; t += 1 / 60) feed.update(t);
      const cams = sent.filter((m) => m.type === 'cam_update');
      expect(cams.length).toBeGreaterThanOrEqual(25);
      expect(cams.length).toBeLessThanOrEqual(31);
      expect(cams.every((m) => (m as { site_id: string }).site_id === `site-${phase}`)).toBe(true);
      expect(spies).toHaveLength(0);
      expect(pip.source).toBeNull();
    });

    it(`${phase}: the monitor sends nothing and offers its capture to the picture-in-picture`, () => {
      const { app, sent, pip } = fakeApp(false);
      const scene = new THREE.Scene();
      const feed = new InspectorFeed(app, scene, `site-${phase}`);
      feed.sync();
      for (let t = 0; t < 1; t += 1 / 60) feed.update(t);
      expect(sent).toEqual([]);
      expect(spies).toHaveLength(1);
      expect(spies[0]!.scene).toBe(scene);
      expect(pip.source).toBe(spies[0]);
    });
  }

  it('gives the monitor a 16:9 capture, so the on-screen box is never stretched', () => {
    const { app } = fakeApp(false);
    new InspectorFeed(app, new THREE.Scene(), 's').sync();
    expect(spies[0]!.size).toEqual({ w: 640, h: 360 });
  });

  it('hides the local rig from the capture by default', () => {
    const { app } = fakeApp(false);
    const feed = new InspectorFeed(app, new THREE.Scene(), 's');
    feed.update(1);
    expect(spies[0]!.updates[0]!.hidden).toEqual([app.rig]);
  });

  it('forwards room events to the capture', () => {
    const { app } = fakeApp(false);
    const feed = new InspectorFeed(app, new THREE.Scene(), 's');
    feed.sync();
    const msg = { type: 'cam_update', site_id: 's', px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 } as const;
    feed.handleRoom(msg, 4);
    expect(spies[0]!.handled).toEqual([msg]);
  });

  it('hides the 3D panel on a screen that has the picture-in-picture, and keeps it in the headset and the VR preview', () => {
    const screen = fakeApp(false);
    const f1 = new InspectorFeed(screen.app, new THREE.Scene(), 's', { panel3d: () => {} });
    f1.update(1);
    expect(f1.view!.mesh.visible).toBe(false);

    const headset = fakeApp(false, { xr: true });
    const f2 = new InspectorFeed(headset.app, new THREE.Scene(), 's', { panel3d: () => {} });
    f2.update(1);
    expect(f2.view!.mesh.visible).toBe(true);

    const preview = fakeApp(false, { preview: true });
    const f3 = new InspectorFeed(preview.app, new THREE.Scene(), 's', { panel3d: () => {} });
    f3.update(1);
    expect(f3.view!.mesh.visible).toBe(true);
  });

  it('only pov puts the panel in the rig; in the headset landing and transmit have nothing to show', () => {
    const pov = fakeApp(false, { xr: true });
    const panel = vi.fn();
    const f = new InspectorFeed(pov.app, new THREE.Scene(), 's', { panel3d: panel });
    f.sync();
    expect(panel).toHaveBeenCalledTimes(1);
    expect(pov.app.rig.children).toContain(spies[0]!.mesh);

    spies.length = 0;
    const landing = fakeApp(false, { xr: true });
    new InspectorFeed(landing.app, new THREE.Scene(), 's').sync();
    expect(spies).toHaveLength(0);
    expect(landing.pip.source).toBeNull();
  });

  it('follows the role: a monitor that becomes the host drops its capture and starts sending', () => {
    const { app, sent, pip } = fakeApp(false);
    const feed = new InspectorFeed(app, new THREE.Scene(), 's');
    feed.sync();
    expect(spies).toHaveLength(1);
    (app as { isHost: boolean }).isHost = true;
    feed.update(5);
    expect(spies[0]!.disposed).toBe(true);
    expect(pip.source).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('releases the capture on dispose, once, and only the one it owns', () => {
    const { app, pip } = fakeApp(false);
    const feed = new InspectorFeed(app, new THREE.Scene(), 's');
    feed.sync();
    const other = { texture: new THREE.Texture(), live: true };
    pip.source = other;
    feed.dispose();
    expect(spies[0]!.disposed).toBe(true);
    expect(pip.source).toBe(other);
    expect(() => feed.dispose()).not.toThrow();
  });
});
