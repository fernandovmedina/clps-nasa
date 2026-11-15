import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunarApp } from '@/lib/engine/app';
import { fmtInt } from '@/lib/engine/hud';
import { topSites } from '@/lib/mission/launch-plan';
import { realMissionData } from '@/lib/mission/test-data';
import type { MissionData } from '@/lib/mission/sites';
import { earthMoonDistanceKm } from '@/lib/phases/launch-telemetry';
import LaunchPlanner from './LaunchPlanner';

const data = realMissionData();

function fakeApp(loaded: MissionData | null = data) {
  const send = vi.fn();
  const setLanding = vi.fn((date: Date) => { if (loaded) loaded.landingDate = date; return true; });
  const app = { data: loaded, room: { send }, setLanding } as unknown as LunarApp;
  return { app, send, setLanding };
}

function mount(over: { loaded?: MissionData | null; onClose?: () => void; suspendEscape?: boolean } = {}) {
  const fake = fakeApp(over.loaded === undefined ? { ...data, landingDate: data.landingDate } : over.loaded);
  const onClose = over.onClose ?? vi.fn();
  render(<LaunchPlanner app={fake.app} code="ABCD" onClose={onClose} suspendEscape={over.suspendEscape} />);
  return { ...fake, onClose };
}

const dateField = () => screen.getByLabelText('Fecha de despegue') as HTMLInputElement;
const timeField = () => screen.getByLabelText('Hora de despegue (UTC)') as HTMLInputElement;
const confirmButton = () => screen.getByRole('button', { name: 'Confirmar lanzamiento' }) as HTMLButtonElement;
const rows = () => within(screen.getByRole('list', { name: 'Mejores sitios para esa llegada' })).getAllByRole('listitem');

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('LaunchPlanner', () => {
  it('is a labelled modal dialog with the texts of the brief, and the focus lands on the first field', () => {
    mount();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = screen.getByRole('heading', { level: 2, name: 'Planifica tu lanzamiento' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(within(dialog).getByText('Paso previo a la misión')).toBeTruthy();
    expect(within(dialog).getByText('Elige cuándo despega el cohete. Calculamos tu llegada al polo sur y qué sitios convienen ese día.')).toBeTruthy();
    expect(within(dialog).getByText('Tránsito directo de 4.5 días (supuesto)')).toBeTruthy();
    expect(within(dialog).getByText('JPL Horizons')).toBeTruthy();
    expect(within(dialog).getByText('Se recalcula al cambiar fecha u hora, con el mismo cálculo del ranking. El sitio final lo eliges en la órbita.')).toBeTruthy();
    expect(document.activeElement).toBe(dateField());
  });

  it('starts from the arrival of the mission minus 4.5 days: 5 Jan 2027 at 12:00 UTC for the default arrival', () => {
    mount();
    expect(dateField().value).toBe('2027-01-05');
    expect(timeField().value).toBe('12:00');
    expect(screen.getByTestId('planner-arrival').textContent).toBe('10 ene 2027 · 00:00 UTC');
  });

  it('starts from the arrival in the URL when there is one', () => {
    window.history.replaceState(null, '', '/?landing=2027-01-24T12:00:00Z');
    mount({ loaded: null });
    expect(dateField().value).toBe('2027-01-20');
    expect(timeField().value).toBe('00:00');
  });

  it('shows the Earth–Moon distance with spaces for thousands, and the top three of the orbit ranking with their badges', () => {
    mount();
    const km = earthMoonDistanceKm(data.global, data.landingDate)!;
    expect(screen.getByTestId('planner-distance').textContent).toBe(`${fmtInt(km)} km`);
    expect(screen.getByTestId('planner-distance').textContent).toMatch(/^\d{3} \d{3} km$/);
    const expected = topSites(data.sites, data.landingDate);
    const shown = rows();
    expect(shown).toHaveLength(3);
    shown.forEach((row, i) => {
      const m = expected[i]!;
      expect(row.textContent).toContain(m.site.name);
      expect(row.textContent).toContain(String(Math.round(m.score)));
      expect(row.textContent).toContain({ viable: 'Viable', marginal: 'Marginal', not_viable: 'No viable' }[m.status]);
    });
  });

  it('recalculates the arrival, the distance and the sites when the date changes', () => {
    mount();
    const before = rows().map((r) => r.textContent);
    const beforeKm = screen.getByTestId('planner-distance').textContent;
    fireEvent.change(dateField(), { target: { value: '2027-04-20' } });
    expect(screen.getByTestId('planner-arrival').textContent).toBe('25 abr 2027 · 00:00 UTC');
    const landing = new Date('2027-04-25T00:00:00Z');
    expect(screen.getByTestId('planner-distance').textContent).toBe(`${fmtInt(earthMoonDistanceKm(data.global, landing)!)} km`);
    const expected = topSites(data.sites, landing);
    rows().forEach((row, i) => expect(row.textContent).toContain(expected[i]!.site.name));
    expect(rows().map((r) => r.textContent)).not.toEqual(before);
    expect(screen.getByTestId('planner-distance').textContent).not.toBe(beforeKm);
  });

  it('recalculates when only the time changes, across a month boundary', () => {
    mount();
    fireEvent.change(dateField(), { target: { value: '2027-01-29' } });
    fireEvent.change(timeField(), { target: { value: '18:30' } });
    expect(screen.getByTestId('planner-arrival').textContent).toBe('3 feb 2027 · 06:30 UTC');
  });

  it('outside the range shows the allowed range in line and disables Confirmar', () => {
    mount();
    fireEvent.change(dateField(), { target: { value: '2028-03-01' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('1 nov 2026 · 00:00 UTC');
    expect(alert.textContent).toContain('1 ene 2028 · 00:00 UTC');
    expect(confirmButton().disabled).toBe(true);
    expect(dateField().getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('list', { name: 'Mejores sitios para esa llegada' })).toBeNull();

    fireEvent.change(dateField(), { target: { value: '2026-10-20' } });
    expect(confirmButton().disabled).toBe(true);

    fireEvent.change(dateField(), { target: { value: '2027-02-01' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('disables Confirmar while a field is empty', () => {
    mount();
    fireEvent.change(dateField(), { target: { value: '' } });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('válidas');
  });

  it('shows Calculando instead of figures, and cannot confirm, while the mission data loads', () => {
    vi.useFakeTimers();
    const fake = fakeApp(null);
    render(<LaunchPlanner app={fake.app} code="ABCD" onClose={vi.fn()} />);
    expect(screen.getByText('Calculando con los datos de la misión…')).toBeTruthy();
    expect(screen.queryByTestId('planner-distance')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Mejores sitios para esa llegada' })).toBeNull();
    expect(confirmButton().disabled).toBe(true);

    (fake.app as unknown as { data: MissionData }).data = data;
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText('Calculando con los datos de la misión…')).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(confirmButton().disabled).toBe(false);
  });

  it('shows the room code large and copies only the code, then says Copiado for two seconds', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    mount();
    expect(screen.getByText('Código para Mission Control')).toBeTruthy();
    expect(screen.getByTestId('planner-code').textContent).toBe('ABCD');
    expect(screen.getByText(/Compártelo ahora: quien lo use en «/)).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar código' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('ABCD');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1900); });
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeTruthy();
  });

  it('does nothing when the clipboard fails: the button keeps its label and the code stays readable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar código' })); });
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeTruthy();
    expect(screen.getByTestId('planner-code').textContent).toBe('ABCD');
  });

  it('does nothing either when there is no clipboard at all', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar código' })); });
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeTruthy();
  });

  it('links to the detailed analysis in a new tab without giving it the opener', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Análisis detallado de sitios y fechas' });
    expect(link.getAttribute('href')).toBe('/mission-control/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('confirms: applies the arrival to the mission, sends it to the room and closes', () => {
    const { setLanding, send, onClose } = mount();
    fireEvent.change(dateField(), { target: { value: '2027-01-20' } });
    fireEvent.click(confirmButton());
    expect(setLanding).toHaveBeenCalledTimes(1);
    expect(setLanding.mock.calls[0]![0].toISOString()).toBe('2027-01-25T00:00:00.000Z');
    expect(send).toHaveBeenCalledWith({ type: 'set_time', t: '2027-01-25T00:00:00.000Z' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms the default plan unchanged', () => {
    const { setLanding, send } = mount();
    fireEvent.click(confirmButton());
    expect(setLanding.mock.calls[0]![0].toISOString()).toBe('2027-01-10T00:00:00.000Z');
    expect(send).toHaveBeenCalledWith({ type: 'set_time', t: '2027-01-10T00:00:00.000Z' });
  });

  it('closes with Escape and leaves the mission as it was', () => {
    const { setLanding, send, onClose } = mount();
    fireEvent.change(dateField(), { target: { value: '2027-01-20' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setLanding).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves Escape to the dialog on top of it', () => {
    const { onClose } = mount({ suspendEscape: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the focus inside the dialog when tabbing past its ends', () => {
    mount();
    const dialog = screen.getByRole('dialog');
    const last = confirmButton();
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(dateField());
    fireEvent.keyDown(dateField(), { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(confirmButton());
  });
});
