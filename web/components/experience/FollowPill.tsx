'use client';

import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
import styles from './MissionLayer.module.css';

/** Top centre of the monitor: which mission it follows and whether the room answers. */
export default function FollowPill({ code, open }: { code: string; open: boolean }) {
  const t = useT(missionDict);
  return (
    <p className={styles.followPill}>
      <span className={styles.dotStatus} data-state={open ? 'open' : 'wait'} role="img" aria-label={open ? t('pill.connected') : t('pill.connecting')} />
      <span>{t('pill.prefix')} <strong data-testid="room-code">{code}</strong></span>
    </p>
  );
}
