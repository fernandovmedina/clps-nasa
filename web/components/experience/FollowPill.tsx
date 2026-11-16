import styles from './MissionLayer.module.css';

/** Top centre of the monitor: which mission it follows and whether the room answers. */
export default function FollowPill({ code, open }: { code: string; open: boolean }) {
  return (
    <p className={styles.followPill}>
      <span className={styles.dotStatus} data-state={open ? 'open' : 'wait'} role="img" aria-label={open ? 'Conectado' : 'Conectando'} />
      <span>Seguimiento · siguiendo la misión <strong data-testid="room-code">{code}</strong></span>
    </p>
  );
}
