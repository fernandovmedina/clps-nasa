import { PHASE_LABELS, type PhaseHud, type RunMode } from '@/lib/engine/hud';
import type { PhaseName } from '@/lib/engine/app';
import { PauseIcon } from './icons';
import styles from './MissionLayer.module.css';

interface Props {
  phase: PhaseName;
  mode: RunMode;
  hud: PhaseHud | null;
  frozen: boolean;
  onAct: (id: string) => void;
}

export default function StatusPanel({ phase, mode, hud, frozen, onAct }: Props) {
  if (mode === 'stopped') {
    return (
      <section className={styles.status} aria-label="Estado de la misión">
        <p className={styles.figureRow}>
          <span className={styles.figure} data-testid="figure">Detenida</span>
          <span className={styles.caption}>fase de {PHASE_LABELS[phase].toLowerCase()}</span>
        </p>
        <p className={styles.detail}>Pausar congela la misión para seguir después; detener la termina y vuelve al inicio.</p>
      </section>
    );
  }
  if (!hud) return <section className={styles.status} aria-label="Estado de la fase" />;

  const paused = mode === 'paused';
  const { figure, progress, facts, toggles, detail } = hud;
  return (
    <section className={styles.status} aria-label="Estado de la fase">
      {paused && <p className={styles.pill} data-tone="warn"><PauseIcon size={14} />En pausa</p>}
      <p className={styles.figureRow} data-badge={figure.badge ? '' : undefined}>
        <span className={styles.figure} data-testid="figure">{figure.value}</span>
        {(figure.caption || figure.badge) && (
          <span className={styles.captionCol}>
            {figure.caption && <span className={styles.caption}>{figure.caption}</span>}
            {figure.badge && !paused && <span className={styles.pill} data-tone={figure.badge.tone}>{figure.badge.label}</span>}
          </span>
        )}
      </p>
      {paused ? (
        <p className={styles.detail}>La simulación y el sonido están en pausa.</p>
      ) : (
        <>
          {progress && (
            <div className={styles.progress}>
              <div
                className={styles.bar}
                role="progressbar"
                aria-label={progress.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.value * 100)}
              >
                <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
              {progress.text && <span className={styles.barText}>{progress.text}</span>}
            </div>
          )}
          {detail && <p className={styles.detail}>{detail}</p>}
        </>
      )}
      {facts && facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
          ))}
        </dl>
      )}
      {toggles && (
        <div className={styles.toggles} role="group" aria-label={toggles.label}>
          <span>{toggles.label}</span>
          {toggles.options.map((o) => (
            <button key={o.id} type="button" className={styles.chip} aria-pressed={o.pressed} disabled={frozen || o.disabled} onClick={() => onAct(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

