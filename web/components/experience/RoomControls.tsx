'use client';

import { useId, useState } from 'react';
import styles from './MissionLayer.module.css';

interface Props {
  code: string;
  isHost: boolean;
  onJoin: (code: string) => boolean;
}

export default function RoomControls({ code, isHost, onJoin }: Props) {
  const [joining, setJoining] = useState(false);
  const [value, setValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard permission denied: the code itself is still readable */ }
  };

  const close = () => { setJoining(false); setError(null); };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const next = value.trim().toUpperCase();
    if (!next) return;
    if (!onJoin(next)) {
      setError(next === code ? 'Ya estás en esa sala' : 'Código no válido');
      return;
    }
    close();
    setValue('');
  };

  return (
    <details className={styles.room}>
      <summary>Sala <code>{code || '…'}</code></summary>
      <div className={styles.roomBody}>
        <p>{isHost ? 'Tu cámara se transmite a quien se una con este código.' : 'Estás viendo la cámara de quien generó este código.'}</p>
        <div className={styles.roomRow}>
          <button type="button" className={styles.chip} onClick={copy}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
          <button type="button" className={styles.chip} aria-expanded={joining} onClick={() => (joining ? close() : setJoining(true))}>Unirse a otra sala</button>
        </div>
        {joining && (
          <>
            <form className={styles.roomRow} onSubmit={join}>
              <input
                className={styles.roomInput}
                aria-label="Código de sala"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
                placeholder="Código de sala"
                maxLength={16}
                autoFocus
              />
              <button type="submit" className={styles.chip}>Unirse</button>
            </form>
            {error && <p id={errorId} role="alert" className={styles.roomError}>{error}</p>}
          </>
        )}
      </div>
    </details>
  );
}
