import { describe, expect, it, vi } from 'vitest';

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {} }));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

const { BOUNCE, DonkeyGuide, bouncePose } = await import('./donkey');

describe('bouncePose', () => {
  const style = BOUNCE.speaking;

  it('lands squashed and tops out stretched at the full hop height', () => {
    const land = bouncePose(0, style), top = bouncePose(0.5, style);
    expect(land.y).toBeCloseTo(0);
    expect(land.scaleY).toBeLessThan(1);
    expect(top.y).toBeCloseTo(style.height);
    expect(top.scaleY).toBeGreaterThan(1);
  });

  it('keeps the volume and repeats every hop', () => {
    for (const h of [0, 0.1, 0.37, 0.5, 0.8]) {
      const p = bouncePose(h, style);
      expect(p.scaleXZ * p.scaleXZ * p.scaleY).toBeCloseTo(1);
      expect(bouncePose(h + 2, style).y).toBeCloseTo(p.y);
    }
  });

  it('stands still when hidden', () => {
    expect(bouncePose(0.5, BOUNCE.hidden)).toMatchObject({ y: 0, scaleY: 1, roll: 0 });
  });
});

describe('DonkeyGuide', () => {
  it('eases into a new mood without jumping and hides when told to', () => {
    const d = new DonkeyGuide();
    let t = 0;
    const ys: number[] = [];
    for (let i = 0; i < 120; i++) { if (i === 60) d.setMood('speaking'); d.update((t += 1 / 72)); ys.push(d.group.children[0]!.position.y); }
    const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]!));
    expect(Math.max(...steps)).toBeLessThan(0.01);
    expect(Math.max(...ys.slice(90))).toBeGreaterThan(BOUNCE.idle.height);
    d.setMood('hidden'); d.update(t + 0.02);
    expect(d.group.children[0]!.visible).toBe(false);
  });
});
