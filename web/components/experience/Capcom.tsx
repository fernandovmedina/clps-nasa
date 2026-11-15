'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { CapcomController, CapcomUiState } from '@/lib/capcom/controller';
import { MicIcon } from './icons';
import { useCapcom } from './useCapcom';
import styles from './Capcom.module.css';

/** Hold-to-talk key for the keyboard. No other shortcut exists in the experience. */
export const CAPCOM_KEY = 'v';

const STATUS: Record<CapcomUiState, string> = {
  disconnected: '',
  connecting: 'Conectando…',
  listening: 'Listo',
  thinking: 'Pensando…',
  speaking: 'Hablando…',
  error: '',
  unavailable: '',
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** "Hablar con CAPCOM": hold it (mouse, touch, Space/Enter on the button, or the V key) to talk. */
export function CapcomButton({ controller }: { controller: CapcomController }) {
  const snap = useCapcom(controller);
  const unavailable = snap.state === 'unavailable';
  const holders = useRef(new Set<string>());

  const hold = (who: string) => {
    if (holders.current.size === 0) controller.press();
    holders.current.add(who);
  };
  const letGo = (who: string) => {
    if (!holders.current.delete(who) || holders.current.size > 0) return;
    controller.release();
  };

  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== CAPCOM_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (!unavailable) hold('key');
    };
    const up = (e: globalThis.KeyboardEvent) => { if (e.key.toLowerCase() === CAPCOM_KEY) letGo('key'); };
    const blur = () => { for (const who of [...holders.current]) letGo(who); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, unavailable]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    hold('pointer');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) hold('button');
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') letGo('button');
  };

  const status = snap.state === 'error' ? snap.message : snap.talking ? 'Escuchando…' : STATUS[snap.state];

  return (
    <div className={styles.capcom} data-state={snap.state} data-talking={snap.talking ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.button}
        aria-pressed={snap.talking}
        aria-keyshortcuts={CAPCOM_KEY.toUpperCase()}
        aria-describedby="capcom-hint"
        disabled={unavailable}
        aria-label={unavailable ? 'CAPCOM no disponible' : 'Hablar con CAPCOM'}
        onPointerDown={onPointerDown}
        onPointerUp={() => letGo('pointer')}
        onPointerCancel={() => letGo('pointer')}
        onLostPointerCapture={() => letGo('pointer')}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MicIcon />
        <span>{unavailable ? <>CAPCOM <span className={styles.long}>no disponible</span></> : <><span className={styles.long}>Hablar con </span>CAPCOM</>}</span>
      </button>
      <span id="capcom-hint" className={styles.sr}>
        Mantén pulsado para hablar. Con el teclado, mantén pulsada la tecla {CAPCOM_KEY.toUpperCase()}, o Espacio con el foco en el botón.
      </span>
      {status && <span className={styles.status} data-testid="capcom-status">{status}</span>}
    </div>
  );
}

/** What was heard and what CAPCOM answers; the final answer is also announced by a polite live region. */
export function CapcomCaption({ controller }: { controller: CapcomController }) {
  const snap = useCapcom(controller);
  const shown = snap.question || snap.answer;
  return (
    <>
      {shown && (
        <section className={styles.caption} aria-label="Subtítulos de CAPCOM" data-testid="capcom-caption">
          {snap.question && <p className={styles.question} data-testid="capcom-question"><span>Tú</span>{snap.question}</p>}
          {snap.answer && <p className={styles.answer} data-testid="capcom-answer"><span>CAPCOM</span>{snap.answer}</p>}
        </section>
      )}
      <div className={styles.sr} aria-live="polite" aria-atomic="true" data-testid="capcom-live">
        {snap.answerFinal ? snap.answer : ''}
      </div>
    </>
  );
}
