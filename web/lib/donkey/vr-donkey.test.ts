import { describe, expect, it, vi } from 'vitest';

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { setMeshoptDecoder() { return this; } loadAsync() { return Promise.reject(new Error('no model in tests')); } } }));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

const { VrDonkey } = await import('./vr-donkey');

describe('VrDonkey', () => {
  it('only shows in VR, low and to the right of the viewer, facing them', () => {
    const d = new VrDonkey(1.6);
    expect(d.group.visible).toBe(false);
    d.update(true, false);
    const { x, y, z } = d.group.position;
    expect(d.group.visible).toBe(true);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeLessThan(0);
    expect(y).toBeLessThan(1.6);
    // its front (+Z) points back at the viewer's vertical axis
    const fx = Math.sin(d.group.rotation.y), fz = Math.cos(d.group.rotation.y);
    expect(fx * -x + fz * -z).toBeCloseTo(Math.hypot(x, z));
    d.update(false, false);
    expect(d.group.visible).toBe(false);
    d.dispose();
  });

  it('moves up onto the window pillar in the landing cabin', () => {
    const d = new VrDonkey(1.6);
    d.update(true, false);
    const outside = d.group.position.y;
    d.update(true, true);
    expect(d.group.position.y).toBeGreaterThan(outside);
    d.dispose();
  });
});
