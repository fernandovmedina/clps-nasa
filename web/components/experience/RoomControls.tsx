'use client';

import { useState } from 'react';
import styles from './MissionLayer.module.css';

interface Props {
  code: string;
  isHost: boolean;
  onJoin: (code: string) => void;
}

export default function RoomControls({ code, isHost, onJoin }: Props) {
  const [joining, setJoining] = useState(false);
  const [value, setValue] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard permission denied: the code itself is still readable */ }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const next = value.trim().toUpperCase();
    if (!next) return;
    onJoin(next);
    setJoining(false);
    setValue('');
  };

  return (
    <details className={styles.room}>
      <summary>Sala <code>{code || '…'}</code></summary>
      <div className={styles.roomBody}>
        <p>{isHost ? 'Tu cámara se transmite a quien se una con este código.' : 'Estás viendo la cámara de quien generó este código.'}</p>
        <div className={styles.roomRow}>
          <button type="button" className={styles.chip} onClick={copy}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
          <button type="button" className={styles.chip} aria-expanded={joining} onClick={() => setJoining((v) => !v)}>Unirse a otra sala</button>
        </div>
        {joining && (
          <form className={styles.roomRow} onSubmit={join}>
            <input
              className={styles.roomInput}
              aria-label="Código de sala"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setJoining(false); }}
              placeholder="Código de sala"
              maxLength={16}
              autoFocus
            />
            <button type="submit" className={styles.chip}>Unirse</button>
          </form>
        )}
      </div>
    </details>
  );
}
