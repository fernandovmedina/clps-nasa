import type { RoomStatus } from '@/lib/sync/room-client';
import styles from './MissionLayer.module.css';

/** Top centre of the monitor: which mission it follows and whether the room answers. */
export default function FollowPill({ code, room }: { code: string; room: RoomStatus }) {
  const open = room === 'open';
  return (
    <p className={styles.followPill}>
      <span className={styles.dotStatus} data-state={open ? 'open' : 'wait'} role="img" aria-label={open ? 'Conectado' : 'Conectando'} />
      <span>Mission Control · siguiendo la misión <strong data-testid="room-code">{code}</strong></span>
    </p>
  );
}
