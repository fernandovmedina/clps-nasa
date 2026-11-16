import type { MissionInfo } from './mission';
import styles from './MissionLayer.module.css';

interface Props {
  mission: MissionInfo;
  code: string;
  /** Follower: follows someone else's mission instead of flying its own. */
  follow: boolean;
  roomOpen: boolean;
  /** The launch has not started: the plan can still change. */
  prelaunch: boolean;
  onChangeLaunch: () => void;
  /** The analysis app (Mission Control) with this mission already loaded. */
  controlHref: string;
}

/** The "Misión" block of the left rail, for the crew and for the monitor that follows them. */
export default function MissionBlock({ mission, code, follow, roomOpen, prelaunch, onChangeLaunch, controlHref }: Props) {
  if (follow) {
    return (
      <section className={styles.mission} aria-label="Misión que sigues">
        <h2>Misión que sigues</h2>
        {roomOpen ? (
          <>
            <p className={styles.site}>{mission.site}</p>
            <p className={styles.date}>{mission.launch}</p>
            <p className={styles.date}>{mission.landing}</p>
          </>
        ) : (
          <p className={styles.date}>Conectando con la misión…</p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.mission} aria-label="Misión">
      <h2>Misión</h2>
      <p className={styles.site}>{mission.site}</p>
      <p className={styles.date}>{mission.launch}</p>
      <p className={styles.date}>{mission.landing}</p>
      <div className={styles.missionLinks}>
        {prelaunch
          ? <button type="button" className={styles.linkBtn} onClick={onChangeLaunch}>Cambiar lanzamiento</button>
          : <a href={controlHref}>Análisis de sitios y fechas</a>}
      </div>
      <div className={styles.codeBox}>
        <span>Código de seguimiento</span>
        <strong data-testid="room-code">{code || '…'}</strong>
      </div>
      <p className={styles.small}>Quien lo escriba en «Seguir la misión» verá tu misión en vivo.</p>
    </section>
  );
}
