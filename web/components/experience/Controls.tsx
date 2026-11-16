import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
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
  const t = useT(missionDict);
  const paused = mode === 'paused';
  const primary = hud?.primary;
  return (
    <div className={styles.controls} role="group" aria-label={t('controls.group')}>
      <button ref={pauseRef} type="button" className={styles.btn} data-variant={paused ? 'cta' : undefined} disabled={hud?.waiting === true} onClick={onTogglePause}>
        {paused ? <PlayIcon /> : <PauseIcon />}{paused ? t('controls.resume') : t('controls.pause')}
      </button>
      <button type="button" className={styles.btn} onClick={onStop}><StopIcon />{t('controls.stop')}</button>
      {hud?.secondary?.map((a) => (
        <button key={a.id} type="button" className={styles.btn} disabled={paused || a.disabled} onClick={() => onAct(a.id)}>{a.label}</button>
      ))}
      {primary && (primary.href ? (
        <a className={styles.btn} data-variant={paused ? undefined : 'cta'} href={primary.href} target="_blank" rel="noopener noreferrer">{primary.label}</a>
      ) : (
        <button type="button" className={styles.btn} data-primary="" data-variant={paused ? undefined : 'cta'} disabled={paused || primary.disabled} onClick={() => onAct(primary.id)}>
          {primary.label}
        </button>
      ))}
    </div>
  );
}
