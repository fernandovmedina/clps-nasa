import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '@/lib/engine/app';
import type { SayOutcome } from '@/lib/engine/narration';
import { setLang } from '@/lib/i18n';
import WelcomeGuide from './WelcomeGuide';

const stages = vi.hoisted(() => [] as { canvas: HTMLCanvasElement; ok: boolean; setMood: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[]);
const webgl = vi.hoisted(() => ({ available: true }));

vi.mock('@/lib/capcom/donkey-stage', () => ({
  DonkeyStage: class {
    ok = webgl.available;
    setMood = vi.fn();
    dispose = vi.fn();
    constructor(readonly canvas: HTMLCanvasElement) { stages.push(this); }
  },
}));

const SUBTITLE = 'Bienvenido a TOUCHDOWN. Soy el burrito espacial, tu guía. Vamos a elegir dónde y cuándo alunizar en el polo sur de la Luna.';
const PRIMARY = 'Explorar la misión';
const SECONDARY = 'Seguir la misión de alguien (con código)';

interface Line { onStart?: () => void; resolve: (outcome: SayOutcome) => void }

function fakeApp({ muted = false, ready = Promise.resolve() }: { muted?: boolean; ready?: Promise<void> } = {}) {
  const lines: Line[] = [];
  const narrator = {
    ready,
    setMuted: vi.fn(),
    stop: vi.fn(),
    sayAndWait: vi.fn((_id: string, onStart?: () => void) => new Promise<SayOutcome>((resolve) => { lines.push({ onStart, resolve }); })),
  };
  const app = { narrator, audio: { muted } } as unknown as LunarApp;
  return { app, narrator, lines };
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = (line: Line | undefined, outcome: SayOutcome) => act(async () => { line!.resolve(outcome); await vi.advanceTimersByTimeAsync(0); });
const start = (line: Line | undefined) => act(async () => { line!.onStart?.(); await vi.advanceTimersByTimeAsync(0); });
const canvas = () => screen.getByTestId('welcome-donkey');
const dialog = () => screen.queryByRole('dialog');
const lastMood = () => stages.at(-1)!.setMood.mock.calls.at(-1)?.[0];

/** navigator.xr as the browser exposes it: absent without WebXR, or with isSessionSupported answering for immersive-vr. */
function setXr(support: 'none' | 'vr' | 'no-vr' | 'throws') {
  const isSessionSupported = vi.fn((mode: string) => (
    support === 'throws' ? Promise.reject(new Error('xr')) : Promise.resolve(support === 'vr' && mode === 'immersive-vr')
  ));
  Object.defineProperty(navigator, 'xr', { configurable: true, value: support === 'none' ? undefined : { isSessionSupported } });
  return isSessionSupported;
}

beforeEach(() => {
  setXr('none');
  stages.length = 0;
  webgl.available = true;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WelcomeGuide', () => {
  it('shows the donkey, no dialog and a Saltar button from the very first render', async () => {
    const { app } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    expect(dialog()).toBeNull();
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeTruthy();
    expect(canvas().getAttribute('aria-hidden')).toBe('true');
    expect(canvas().getAttribute('data-mood')).toBe('idle');
    expect(stages).toHaveLength(1);
    expect(stages[0]!.canvas).toBe(canvas());
    expect(lastMood()).toBe('idle');
    await flush();
    expect(dialog()).toBeNull();
  });

  it('asks for the welcome line after syncing the saved mute setting with the narrator', async () => {
    const { app, narrator } = fakeApp({ muted: true });
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    expect(narrator.setMuted).toHaveBeenCalledWith(true);
    expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
    expect(narrator.sayAndWait.mock.calls[0]![0]).toBe('welcome');
    expect(narrator.setMuted.mock.invocationCallOrder[0]).toBeLessThan(narrator.sayAndWait.mock.invocationCallOrder[0]!);
  });

  it('does not wait for the recorded clips for more than 1.5 s', async () => {
    const { app, narrator } = fakeApp({ ready: new Promise<void>(() => {}) });
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await advance(1499);
    expect(narrator.sayAndWait).not.toHaveBeenCalled();
    await advance(5);
    expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
  });

  it('subtitles the line while it is spoken, with the donkey talking, and then opens the dialog with it listening', async () => {
    const { app, lines } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    expect(screen.queryByText(SUBTITLE)).toBeNull();

    await start(lines[0]);
    const subtitle = screen.getByText(SUBTITLE);
    expect(subtitle.closest('[aria-live="polite"]')).not.toBeNull();
    expect(canvas().getAttribute('data-mood')).toBe('speaking');
    expect(lastMood()).toBe('speaking');
    expect(dialog()).toBeNull();

    await settle(lines[0], 'ended');
    const card = screen.getByRole('dialog', { name: 'Bienvenido a TOUCHDOWN' });
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: PRIMARY })).toBeTruthy();
    expect(screen.getByRole('button', { name: SECONDARY })).toBeTruthy();
    expect(screen.queryByText(SUBTITLE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull();
    expect(canvas().getAttribute('data-mood')).toBe('listening');
    expect(lastMood()).toBe('listening');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: PRIMARY }));
  });

  it('also opens the dialog when the line is cut off from outside', async () => {
    const { app, lines } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    await settle(lines[0], 'stopped');
    expect(dialog()).not.toBeNull();
  });

  describe('when the browser blocks the audio', () => {
    it('waits idle with "Toca para empezar" and no dialog, then tries again on that tap', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'blocked');
      const tap = screen.getByRole('button', { name: 'Toca para empezar' });
      expect(dialog()).toBeNull();
      expect(canvas().getAttribute('data-mood')).toBe('idle');
      expect(screen.getByRole('button', { name: 'Saltar' })).toBeTruthy();
      expect(document.activeElement).toBe(tap);
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);

      fireEvent.click(tap);
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(2);
      await start(lines[1]);
      expect(screen.getByText(SUBTITLE)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Toca para empezar' })).toBeNull();
      expect(canvas().getAttribute('data-mood')).toBe('speaking');
      await settle(lines[1], 'ended');
      expect(dialog()).not.toBeNull();
    });

    it('starts the voice from a click anywhere on the veil, and calls the narrator inside that click', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'blocked');
      fireEvent.click(screen.getByTestId('welcome-veil'));
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: 'Toca para empezar' })).toBeNull();
    });

    it('opens the dialog when the tap is blocked again', async () => {
      const { app, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'blocked');
      fireEvent.click(screen.getByRole('button', { name: 'Toca para empezar' }));
      await settle(lines[1], 'blocked');
      expect(dialog()).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Toca para empezar' })).toBeNull();
    });

    it('opens the dialog with Saltar instead of tapping', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'blocked');
      fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
      expect(dialog()).not.toBeNull();
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
    });
  });

  describe('skipping', () => {
    it('Saltar cuts the voice and shows the dialog', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await start(lines[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
      expect(narrator.stop).toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
      await settle(lines[0], 'stopped');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('Escape does the same', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await start(lines[0]);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(narrator.stop).toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it('a click on the veil while it talks does the same', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await start(lines[0]);
      fireEvent.click(screen.getByTestId('welcome-veil'));
      expect(narrator.stop).toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it('Escape does nothing once the dialog is up', async () => {
      const { app, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'ended');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(dialog()).not.toBeNull();
    });
  });

  describe('the welcome dialog by device', () => {
    const open = async () => {
      const { app, lines } = fakeApp();
      const onChoose = vi.fn();
      render(<WelcomeGuide app={app} onChoose={onChoose} />);
      await flush();
      await settle(lines[0], 'ended');
      return { onChoose };
    };
    const CTA = '[data-variant="cta"]';

    it('without WebXR: says what it is, offers «Explorar la misión» as the one clay button and tells where VR works', async () => {
      await open();
      const card = screen.getByRole('dialog');
      expect(screen.getByText('Compara sitios y fechas de alunizaje en el polo sur con datos reales de NASA')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Entrar en VR' })).toBeNull();
      expect(screen.getByText('Para VR, ábrelo en el navegador del Meta Quest')).toBeTruthy();
      const cta = card.querySelectorAll(CTA);
      expect(cta).toHaveLength(1);
      expect(cta[0]).toBe(screen.getByRole('button', { name: PRIMARY }));
      expect(screen.getByRole('button', { name: SECONDARY }).getAttribute('data-variant')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Voy en VR' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sigo la misión (Monitor)' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: PRIMARY }));
    });

    it('without WebXR: Explorar la misión makes the same choice «Voy en VR» made on desktop', async () => {
      const { onChoose } = await open();
      fireEvent.click(screen.getByRole('button', { name: PRIMARY }));
      expect(onChoose).toHaveBeenCalledWith('vr');
    });

    it('with WebXR immersive-vr: the clay button is «Entrar en VR», there is no Explorar and no Quest hint', async () => {
      const supported = setXr('vr');
      const { onChoose } = await open();
      expect(supported).toHaveBeenCalledWith('immersive-vr');
      const card = screen.getByRole('dialog');
      expect(screen.getByText('Compara sitios y fechas de alunizaje en el polo sur con datos reales de NASA')).toBeTruthy();
      expect(card.querySelectorAll(CTA)).toHaveLength(1);
      expect(card.querySelector(CTA)).toBe(screen.getByRole('button', { name: 'Entrar en VR' }));
      expect(screen.queryByRole('button', { name: PRIMARY })).toBeNull();
      expect(screen.queryByText('Para VR, ábrelo en el navegador del Meta Quest')).toBeNull();
      expect(screen.getByRole('button', { name: SECONDARY })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Entrar en VR' }));
      expect(onChoose).toHaveBeenCalledWith('vr');
    });

    it.each(['no-vr', 'throws'] as const)('treats a WebXR that says %s as no VR', async (support) => {
      setXr(support);
      await open();
      expect(screen.getByRole('button', { name: PRIMARY })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Entrar en VR' })).toBeNull();
    });

    it('both variants offer the code route and a quiet link to the analysis app', async () => {
      const { onChoose } = await open();
      const link = screen.getByRole('link', { name: 'Análisis de sitios y fechas' });
      expect(link.getAttribute('href')).toBe('/mission-control/');
      expect(link.closest('[role="dialog"]')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: SECONDARY }));
      expect(onChoose).toHaveBeenCalledWith('monitor');
    });

    it('never asks for a code or names Mission Control as a role', async () => {
      await open();
      const text = screen.getByRole('dialog').textContent ?? '';
      expect(text).not.toMatch(/Mission Control/);
      expect(text).not.toMatch(/Monitor/);
    });
  });

  describe('choosing', () => {
    it('calls onChoose once, in the same click, and cuts the voice', async () => {
      const { app, narrator, lines } = fakeApp();
      const onChoose = vi.fn();
      render(<WelcomeGuide app={app} onChoose={onChoose} />);
      await flush();
      await settle(lines[0], 'ended');
      fireEvent.click(screen.getByRole('button', { name: PRIMARY }));
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith('vr');
      expect(narrator.stop).toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: SECONDARY }));
      fireEvent.click(screen.getByRole('button', { name: PRIMARY }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('answers Monitor with the monitor role and never speaks again', async () => {
      const { app, narrator, lines } = fakeApp();
      const onChoose = vi.fn();
      render(<WelcomeGuide app={app} onChoose={onChoose} />);
      await flush();
      await settle(lines[0], 'ended');
      fireEvent.click(screen.getByRole('button', { name: SECONDARY }));
      expect(onChoose).toHaveBeenCalledWith('monitor');
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
    });

    it('keeps Tab inside the dialog', async () => {
      const { app, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'ended');
      const card = screen.getByRole('dialog');
      const first = screen.getByRole('button', { name: PRIMARY });
      const last = screen.getByRole('link', { name: 'Análisis de sitios y fechas' });
      last.focus();
      fireEvent.keyDown(card, { key: 'Tab' });
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(card, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);
    });
  });

  describe('never leaves the visitor stuck', () => {
    it('opens the dialog after 4 s if the engine never shows up, and Saltar works meanwhile', async () => {
      const onChoose = vi.fn();
      render(<WelcomeGuide app={null} onChoose={onChoose} />);
      await advance(3999);
      expect(dialog()).toBeNull();
      await advance(5);
      expect(dialog()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: PRIMARY }));
      expect(onChoose).toHaveBeenCalledWith('vr');
    });

    it('lets Saltar through while there is no engine', () => {
      render(<WelcomeGuide app={null} onChoose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
      expect(dialog()).not.toBeNull();
    });

    it('starts the greeting when the engine arrives in time', async () => {
      const { app, narrator } = fakeApp();
      const view = render(<WelcomeGuide app={null} onChoose={vi.fn()} />);
      await advance(2000);
      view.rerender(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
      await advance(5000);
      expect(dialog()).toBeNull();
    });

    it('gives an engine that arrives right at the limit one more turn before giving up on it', async () => {
      const { app, narrator } = fakeApp();
      const view = render(<WelcomeGuide app={null} onChoose={vi.fn()} />);
      await advance(4000);
      view.rerender(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await advance(10);
      expect(dialog()).toBeNull();
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
    });

    it('does not start talking once the dialog is already up', async () => {
      const { app, narrator } = fakeApp();
      const view = render(<WelcomeGuide app={null} onChoose={vi.fn()} />);
      await advance(4005);
      expect(dialog()).not.toBeNull();
      view.rerender(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      expect(narrator.sayAndWait).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it('subtitles a muted greeting for about 6.5 s and then opens the dialog', async () => {
      const { app, lines } = fakeApp({ muted: true });
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'silent');
      expect(screen.getByText(SUBTITLE)).toBeTruthy();
      expect(canvas().getAttribute('data-mood')).toBe('speaking');
      await advance(6499);
      expect(dialog()).toBeNull();
      await advance(1);
      expect(dialog()).not.toBeNull();
      expect(screen.queryByText(SUBTITLE)).toBeNull();
    });

    it('opens the dialog 15 s after calling the narrator when the audio never resolves, silencing it', async () => {
      const { app, narrator } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await advance(14_999);
      expect(dialog()).toBeNull();
      await advance(1);
      expect(dialog()).not.toBeNull();
      expect(narrator.stop).toHaveBeenCalled();
    });

    it('counts the 15 s again from the moment it starts talking', async () => {
      const { app, lines } = fakeApp();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await advance(10_000);
      await start(lines[0]);
      await advance(14_999);
      expect(dialog()).toBeNull();
      await advance(1);
      expect(dialog()).not.toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('frees the donkey stage, removes its canvas and cuts a pending voice on unmount', async () => {
      const { app, narrator } = fakeApp();
      const view = render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      const stage = stages[0]!;
      view.unmount();
      expect(stage.dispose).toHaveBeenCalledTimes(1);
      expect(document.querySelector('canvas')).toBeNull();
      expect(narrator.stop).toHaveBeenCalled();
    });

    it('does not touch the narrator on unmount once its line is over', async () => {
      const { app, narrator, lines } = fakeApp();
      const view = render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      await settle(lines[0], 'ended');
      narrator.stop.mockClear();
      view.unmount();
      expect(narrator.stop).not.toHaveBeenCalled();
    });

    it('collapses the donkey slot, and still opens the dialog, when the stage has no WebGL', async () => {
      webgl.available = false;
      const { app, lines } = (() => fakeApp())();
      render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
      await flush();
      expect(canvas().parentElement!.getAttribute('data-ok')).toBe('false');
      await settle(lines[0], 'ended');
      expect(dialog()).not.toBeNull();
    });

    it('keeps the donkey slot when the stage works', () => {
      render(<WelcomeGuide app={fakeApp().app} onChoose={vi.fn()} />);
      expect(canvas().parentElement!.getAttribute('data-ok')).toBe('true');
    });

    it('survives React StrictMode mounting twice: one live stage, one greeting', async () => {
      const { app, narrator, lines } = fakeApp();
      render(<StrictMode><WelcomeGuide app={app} onChoose={vi.fn()} /></StrictMode>);
      await flush();
      expect(stages.length).toBeGreaterThanOrEqual(2);
      expect(stages[0]!.dispose).toHaveBeenCalledTimes(1);
      expect(stages.at(-1)!.dispose).not.toHaveBeenCalled();
      expect(document.querySelectorAll('canvas')).toHaveLength(1);
      expect(stages.at(-1)!.canvas).toBe(canvas());
      expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
      await settle(lines[0], 'ended');
      expect(dialog()).not.toBeNull();
    });
  });
});

describe('WelcomeGuide in English', () => {
  const SUBTITLE_EN = 'Welcome to TOUCHDOWN. I\'m Burrito, your space donkey guide. Together we\'ll pick where and when to land at the Moon\'s south pole.';

  it('subtitles, asks and offers the way in in natural English', async () => {
    setLang('en', { persist: false });
    const onChoose = vi.fn();
    const { app, lines } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={onChoose} />);
    await flush();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    await start(lines[0]);
    expect(screen.getByText(SUBTITLE_EN)).toBeTruthy();
    await settle(lines[0], 'ended');
    const card = screen.getByRole('dialog', { name: 'Welcome to TOUCHDOWN' });
    expect(card.textContent).toContain('Burrito');
    expect(screen.getByText('Compare lunar south pole landing sites and dates with real NASA data')).toBeTruthy();
    expect(screen.getByText('For VR, open it in the Meta Quest browser')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Follow someone\'s mission (with a code)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Site and date analysis' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Explore the mission' }));
    expect(onChoose).toHaveBeenCalledWith('vr');
  });

  it('says «Enter VR» when the browser has WebXR', async () => {
    setLang('en', { persist: false });
    setXr('vr');
    const { app, lines } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    await settle(lines[0], 'ended');
    expect(screen.getByRole('button', { name: 'Enter VR' })).toBeTruthy();
    expect(screen.queryByText('For VR, open it in the Meta Quest browser')).toBeNull();
  });

  it('asks to tap in English when the browser blocks the voice', async () => {
    setLang('en', { persist: false });
    const { app, lines } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    await settle(lines[0], 'blocked');
    expect(screen.getByRole('button', { name: 'Tap to start' })).toBeTruthy();
  });

  it('switches language live without restarting the voice or losing the step', async () => {
    const { app, lines, narrator } = fakeApp();
    render(<WelcomeGuide app={app} onChoose={vi.fn()} />);
    await flush();
    await start(lines[0]);
    expect(screen.getByText(SUBTITLE)).toBeTruthy();
    act(() => setLang('en', { persist: false }));
    expect(screen.getByText(SUBTITLE_EN)).toBeTruthy();
    expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
    expect(narrator.stop).not.toHaveBeenCalled();
    await settle(lines[0], 'ended');
    expect(screen.getByRole('button', { name: 'Explore the mission' })).toBeTruthy();
    act(() => setLang('es', { persist: false }));
    expect(screen.getByRole('button', { name: PRIMARY })).toBeTruthy();
    expect(narrator.sayAndWait).toHaveBeenCalledTimes(1);
  });
});
