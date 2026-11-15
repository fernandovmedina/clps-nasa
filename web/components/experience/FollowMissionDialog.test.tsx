import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FollowMissionDialog from './FollowMissionDialog';

afterEach(cleanup);

function mount(onJoin: (code: string) => boolean = () => true) {
  const join = vi.fn(onJoin);
  const onClose = vi.fn();
  render(<FollowMissionDialog code="ABCD" onJoin={join} onClose={onClose} />);
  const field = screen.getByLabelText('Código de la misión') as HTMLInputElement;
  return { join, onClose, field };
}

describe('FollowMissionDialog', () => {
  it('is a modal dialog with the brief texts and the field focused', () => {
    const { field } = mount();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', { level: 2, name: 'Seguir una misión' }).id);
    expect(screen.getByText('Mission Control', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Escribe el código que te dio quien va a despegar. Verás su misión en vivo: el despegue, la órbita, el alunizaje y la transmisión.')).toBeTruthy();
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.maxLength).toBe(64);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy();
  });

  it('refuses an invalid code in line, keeps the dialog open and clears the error as the person types', () => {
    const { join, onClose, field } = mount(() => false);
    fireEvent.change(field, { target: { value: 'AB CD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(screen.getByRole('alert').textContent).toBe('Código no válido');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(join).toHaveBeenCalledWith('AB CD');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'AB' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the person is already in the room when typing the current code', () => {
    const { field } = mount(() => false);
    fireEvent.change(field, { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(screen.getByRole('alert').textContent).toBe('Ya estás en esa sala');
  });

  it('calls joinRoom with the upper-cased, trimmed code and closes on success', () => {
    const { join, onClose, field } = mount();
    fireEvent.change(field, { target: { value: '  wxyz ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith('WXYZ');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats Enter as Conectar', () => {
    const { join, field } = mount();
    fireEvent.change(field, { target: { value: 'QRST' } });
    fireEvent.submit(field.form!);
    expect(join).toHaveBeenCalledWith('QRST');
  });

  it('does not call joinRoom for an empty field', () => {
    const { join, onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(join).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Código no válido');
  });

  it('cancels with the button and with Escape, without joining', () => {
    const { join, onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(join).not.toHaveBeenCalled();
  });
});
