import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapcomController, CapcomSnapshot } from '@/lib/capcom/controller';
import MissionLayer from './MissionLayer';
import { CapcomButton, CapcomCaption } from './Capcom';

afterEach(cleanup);

const BASE: CapcomSnapshot = { state: 'disconnected', talking: false, question: '', answer: '', answerFinal: false, message: null, mic: 'unknown' };

function fakeController(initial: Partial<CapcomSnapshot> = {}) {
  let snap: CapcomSnapshot = { ...BASE, ...initial };
  const listeners = new Set<() => void>();
  const press = vi.fn();
  const release = vi.fn();
  const controller = {
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getSnapshot: () => snap,
    press, release,
  } as unknown as CapcomController;
  const set = (next: Partial<CapcomSnapshot>) => act(() => { snap = { ...snap, ...next }; listeners.forEach((l) => l()); });
  return { controller, press, release, set };
}

describe('CapcomButton', () => {
  it('is a button named "Hablar con CAPCOM" that describes how to talk, including the keyboard', () => {
    const { controller } = fakeController();
    render(<CapcomButton controller={controller} />);
    const button = screen.getByRole('button', { name: 'Hablar con CAPCOM' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('V');
    const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toMatch(/Mantén pulsado/);
    expect(hint?.textContent).toMatch(/tecla V/);
  });

  it('talks only while the pointer is held down', () => {
    const { controller, press, release } = fakeController();
    render(<CapcomButton controller={controller} />);
    const button = screen.getByRole('button', { name: 'Hablar con CAPCOM' });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    expect(press).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('holds with Space or Enter on the button without turning the key into a click', () => {
    const { controller, press, release } = fakeController();
    render(<CapcomButton controller={controller} />);
    const button = screen.getByRole('button', { name: 'Hablar con CAPCOM' });
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    expect(press).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key: ' ' });
    expect(release).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(press).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('holds with the V key from anywhere, but not while typing or with a modifier', () => {
    const { controller, press, release } = fakeController();
    render(<><input aria-label="Código" /><CapcomButton controller={controller} /></>);
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    expect(press).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Código'), { key: 'v' });
    expect(press).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'V' });
    fireEvent.keyDown(window, { key: 'V', repeat: true });
    expect(press).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(window, { key: 'v' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('lets go when the window loses focus while held', () => {
    const { controller, release } = fakeController();
    render(<CapcomButton controller={controller} />);
    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.blur(window);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('is disabled and says so when CAPCOM is not available', () => {
    const { controller, press } = fakeController({ state: 'unavailable', message: 'CAPCOM no disponible' });
    render(<CapcomButton controller={controller} />);
    const button = screen.getByRole('button', { name: 'CAPCOM no disponible' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'v' });
    expect(press).not.toHaveBeenCalled();
  });

  it('shows the state next to the button and marks it pressed while talking', () => {
    const { controller, set } = fakeController();
    render(<CapcomButton controller={controller} />);
    expect(screen.queryByTestId('capcom-status')).toBeNull();
    set({ state: 'connecting', talking: true });
    expect(screen.getByTestId('capcom-status').textContent).toBe('Escuchando…');
    expect(screen.getByRole('button', { name: 'Hablar con CAPCOM' }).getAttribute('aria-pressed')).toBe('true');
    set({ state: 'thinking', talking: false });
    expect(screen.getByTestId('capcom-status').textContent).toBe('Pensando…');
    set({ state: 'speaking' });
    expect(screen.getByTestId('capcom-status').textContent).toBe('Hablando…');
    set({ state: 'error', message: 'Permite el micrófono para hablar con CAPCOM.' });
    expect(screen.getByTestId('capcom-status').textContent).toMatch(/micrófono/);
    set({ state: 'error', message: 'x', errorCode: 'lostMessage' });
    expect(screen.getByTestId('capcom-status').textContent).toBe('CAPCOM perdió la conexión · pulsa para reintentar.');
  });
});

describe('CapcomCaption', () => {
  it('renders nothing visible until there is something to show', () => {
    const { controller } = fakeController();
    render(<CapcomCaption controller={controller} />);
    expect(screen.queryByTestId('capcom-caption')).toBeNull();
  });

  it('shows the question and the answer, and announces the answer only once it is final', () => {
    const { controller, set } = fakeController();
    render(<CapcomCaption controller={controller} />);
    set({ question: 'cómo va el viaje', answer: 'Vamos a 169 km de altitud.', answerFinal: false });
    expect(screen.getByTestId('capcom-question').textContent).toContain('cómo va el viaje');
    expect(screen.getByTestId('capcom-answer').textContent).toContain('Vamos a 169 km de altitud.');
    const live = screen.getByTestId('capcom-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    set({ answerFinal: true });
    expect(live.textContent).toBe('Vamos a 169 km de altitud.');
  });
});

describe('MissionLayer with CAPCOM', () => {
  const app = {
    phase: { name: 'launch', controlHud: () => null },
    run: { mode: 'running' },
    audio: { muted: false, setMuted: vi.fn() },
    data: null,
    selected: null,
  };
  const room = { code: 'ABCD', isHost: true, onJoin: vi.fn(), onLeave: vi.fn() };

  it('shows the button in the header only when a controller is given', () => {
    const { controller } = fakeController();
    const withIt = render(<MissionLayer app={app as never} vr="no" onEnterVR={vi.fn()} room={room} capcom={controller} />);
    expect(screen.getByRole('button', { name: 'Hablar con CAPCOM' })).toBeTruthy();
    withIt.unmount();
    render(<MissionLayer app={app as never} vr="no" onEnterVR={vi.fn()} room={room} capcom={null} />);
    expect(screen.queryByRole('button', { name: 'Hablar con CAPCOM' })).toBeNull();
  });
});
