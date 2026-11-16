import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
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
  const t = useT(missionDict);
  if (follow) {
    return (
      <section className={styles.mission} aria-label={t('block.followTitle')}>
        <h2>{t('block.followTitle')}</h2>
        {roomOpen ? (
          <>
            <p className={styles.site}>{mission.site}</p>
            <p className={styles.date}>{mission.launch}</p>
            <p className={styles.date}>{mission.landing}</p>
          </>
        ) : (
          <p className={styles.date}>{t('block.connecting')}</p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.mission} aria-label={t('block.title')}>
      <h2>{t('block.title')}</h2>
      <p className={styles.site}>{mission.site}</p>
      <p className={styles.date}>{mission.launch}</p>
      <p className={styles.date}>{mission.landing}</p>
      <div className={styles.missionLinks}>
        {prelaunch
          ? <button type="button" className={styles.linkBtn} onClick={onChangeLaunch}>{t('block.change')}</button>
          : <a href={controlHref}>{t('analysis')}</a>}
      </div>
      <div className={styles.codeBox}>
        <span>{t('block.code')}</span>
        <strong data-testid="room-code">{code || '…'}</strong>
      </div>
      <p className={styles.small}>{t('block.codeHint', { follow: t('follow') })}</p>
    </section>
  );
}
