import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import { PauseIcon, PlayIcon, StopIcon } from './icons';
import styles from './MissionLayer.module.css';

interface Props {
  mode: RunMode;
  hud: PhaseHud | null;
  pauseRef: React.Ref<HTMLButtonElement>;
  onTogglePause: () => void;
  onStop: () => void;
  onAct: (id: string) => void;
}

export default function Controls({ mode, hud, pauseRef, onTogglePause, onStop, onAct }: Props) {
  const paused = mode === 'paused';
  const primary = hud?.primary;
  return (
    <div className={styles.controls} role="group" aria-label="Controles de la misión">
      <button ref={pauseRef} type="button" className={styles.btn} data-variant={paused ? 'primary' : undefined} disabled={hud?.waiting === true} onClick={onTogglePause}>
        {paused ? <PlayIcon /> : <PauseIcon />}{paused ? 'Reanudar' : 'Pausar'}
      </button>
      <button type="button" className={styles.btn} onClick={onStop}><StopIcon />Detener</button>
      {hud?.secondary?.map((a) => (
        <button key={a.id} type="button" className={styles.btn} disabled={paused || a.disabled} onClick={() => onAct(a.id)}>{a.label}</button>
      ))}
      {primary && (primary.href ? (
        <a className={styles.btn} data-variant={paused ? undefined : 'primary'} href={primary.href} target="_blank" rel="noopener noreferrer">{primary.label}</a>
      ) : (
        <button type="button" className={styles.btn} data-primary="" data-variant={paused ? undefined : 'primary'} disabled={paused || primary.disabled} onClick={() => onAct(primary.id)}>
          {primary.label}
        </button>
      ))}
    </div>
  );
}
