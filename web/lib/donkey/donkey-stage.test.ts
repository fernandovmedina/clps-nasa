import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type Spy = Mock<(...args: unknown[]) => unknown>;

const fakes = vi.hoisted(() => ({
  renderers: [] as {
    params: Record<string, unknown>;
    render: Spy;
    setSize: Spy;
    setPixelRatio: Spy;
    dispose: Spy;
    forceContextLoss: Spy;
  }[],
  guides: [] as {
    group: unknown;
    load: Spy;
    setMood: Spy;
    update: Spy;
    dispose: Spy;
  }[],
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeRenderer {
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    render = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    setClearColor = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    constructor(readonly params: Record<string, unknown>) { fakes.renderers.push(this); }
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

vi.mock('./donkey', async () => {
  const THREE = await import('three');
  class FakeGuide {
    group = new THREE.Group();
    load = vi.fn(() => this);
    setMood = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    constructor() { fakes.guides.push(this); }
  }
  return {
    DonkeyGuide: FakeGuide,
    DONKEY_HEIGHT_M: 0.2,
    BOUNCE: { hidden: { height: 0, squash: 0 }, idle: { height: 0.018, squash: 0.06 }, listening: { height: 0.012, squash: 0.05 }, speaking: { height: 0.03, squash: 0.1 } },
  };
});

const { DonkeyStage } = await import('./donkey-stage');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DonkeyStage without WebGL', () => {
  it('stays inert and never throws', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null); // what jsdom answers: it has no WebGL
    let stage!: InstanceType<typeof DonkeyStage>;
    expect(() => { stage = new DonkeyStage(canvas); }).not.toThrow();
    expect(stage.ok).toBe(false);
    expect(() => stage.setMood('speaking')).not.toThrow();
    expect(() => { stage.dispose(); stage.dispose(); }).not.toThrow();
    expect(fakes.renderers).toHaveLength(0);
    expect(fakes.guides).toHaveLength(0);
  });
});

describe('DonkeyStage with a WebGL context', () => {
  let frames: FrameRequestCallback[];
  let cancelled: number[];
  let resize: () => void;
  let disconnect: Spy;
  let canvas: HTMLCanvasElement;
  const hidden = (value: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    fakes.renderers.length = 0;
    fakes.guides.length = 0;
    frames = [];
    cancelled = [];
    disconnect = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.push(id); });
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { resize = cb; }
      observe() {}
      disconnect() { disconnect(); }
    });
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 200 });
    vi.spyOn(canvas, 'getContext').mockReturnValue({} as never);
  });
  afterEach(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });

  it('renders a transparent, tone-mapped scene with the donkey on its own renderer', () => {
    const stage = new DonkeyStage(canvas);
    expect(stage.ok).toBe(true);
    const [renderer] = fakes.renderers;
    expect(renderer!.params).toMatchObject({ canvas, alpha: true, antialias: true });
    expect(renderer!.setSize).toHaveBeenCalledWith(300, 200, false);
    expect(fakes.guides).toHaveLength(1);
    expect(fakes.guides[0]!.load).toHaveBeenCalledTimes(1);
    stage.dispose();
  });

  it('drives the donkey from its own animation loop and forwards the mood', () => {
    const stage = new DonkeyStage(canvas);
    const [guide] = fakes.guides;
    const [renderer] = fakes.renderers;
    stage.setMood('speaking');
    expect(guide!.setMood).toHaveBeenCalledWith('speaking');
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(guide!.update).toHaveBeenCalledTimes(1);
    expect(guide!.update.mock.calls[0]![0]).toBeTypeOf('number');
    expect(renderer!.render).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
    stage.dispose();
  });

  it('keeps the canvas size in step with its CSS box', () => {
    const stage = new DonkeyStage(canvas);
    const [renderer] = fakes.renderers;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 90 });
    resize();
    expect(renderer!.setSize).toHaveBeenLastCalledWith(120, 90, false);
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 0 });
    resize();
    expect(renderer!.setSize).toHaveBeenCalledTimes(2);
    stage.dispose();
  });

  it('stops drawing while the tab is hidden and resumes when it is back', () => {
    const stage = new DonkeyStage(canvas);
    const [renderer] = fakes.renderers;
    hidden(true);
    frames.shift()!(0);
    expect(renderer!.render).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    hidden(false);
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(renderer!.render).toHaveBeenCalledTimes(1);
    stage.dispose();
  });

  it('frees the donkey, the renderer and its WebGL context, once', () => {
    const stage = new DonkeyStage(canvas);
    const [guide] = fakes.guides;
    const [renderer] = fakes.renderers;
    expect(() => { stage.dispose(); stage.dispose(); }).not.toThrow();
    expect(guide!.dispose).toHaveBeenCalledTimes(1);
    expect(renderer!.dispose).toHaveBeenCalledTimes(1);
    expect(renderer!.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelled).toEqual([1]);
    stage.setMood('idle');
    expect(guide!.setMood).not.toHaveBeenCalled();
    hidden(false);
    expect(frames).toHaveLength(1);
  });
});
