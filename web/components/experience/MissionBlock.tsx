import type { RoomStatus } from '@/lib/sync/room-client';
import type { MissionInfo } from './mission';
import styles from './MissionLayer.module.css';

interface Props {
  mission: MissionInfo;
  code: string;
  /** Mission Control: follows someone else's mission instead of flying its own. */
  follow: boolean;
  room: RoomStatus;
  /** The launch has not started: the plan can still change. */
  prelaunch: boolean;
  onChangeLaunch: () => void;
}

/** The "Misión" block of the left rail, for the crew and for the monitor that follows them. */
export default function MissionBlock({ mission, code, follow, room, prelaunch, onChangeLaunch }: Props) {
  if (follow) {
    return (
      <section className={styles.mission} aria-label="Misión que sigues">
        <h2>Misión que sigues</h2>
        {room === 'open' ? (
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
          : <a href="/mission-control/">Análisis de sitios y fechas</a>}
      </div>
      <div className={styles.codeBox}>
        <span>Código Mission Control</span>
        <strong data-testid="room-code">{code || '…'}</strong>
      </div>
    </section>
  );
}
