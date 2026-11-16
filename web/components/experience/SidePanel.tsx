import type { HudRankRow, HudSide } from '@/lib/engine/hud';
import { tn } from '@/lib/i18n';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
import type { RankRowExtras } from '@/lib/mission/sites';
import { StatusIcon } from './icons';
import styles from './MissionLayer.module.css';
import { demoLabel } from './ui-text';

interface Props {
  side: HudSide;
  frozen: boolean;
  onAct: (id: string) => void;
}

export default function SidePanel({ side, frozen, onAct }: Props) {
  const t = useT(missionDict);
  if (side.kind === 'readouts') {
    return (
      <>
        <dl className={styles.readouts}>
          {side.items.map((item) => (
            <div key={item.label} className={styles.readout} data-size={item.size ?? 'lg'}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
              {item.meter && (
                <div className={styles.meter} aria-hidden="true"><div style={{ width: `${Math.round(item.meter.value * 100)}%` }} /></div>
              )}
            </div>
          ))}
        </dl>
        {side.note && <p className={styles.note}>{side.note}</p>}
      </>
    );
  }

  if (side.kind === 'ranking') {
    return (
      <div className={styles.ranking}>
        <div className={styles.rankHead}><h2>{side.title}</h2><span>{t('side.score')}</span></div>
        {side.rows.length === 0 ? (
          <p className={styles.note} data-align="start">{t('side.evaluating')}</p>
        ) : (
          <ol aria-label={t('side.ranking')}>
            {side.rows.map((row) => {
              const r: HudRankRow & RankRowExtras = row;
              return (
                <li key={r.id}>
                  <button type="button" aria-pressed={r.selected} disabled={frozen} data-demo={r.demo ? '' : undefined} onClick={() => onAct(r.id)}>
                    <span className={styles.rankNo}>{r.rank}</span>
                    <span className={styles.rankText}>
                      <span className={styles.rankName}>{r.name}</span>
                      {!r.demo && r.note && <span className={styles.rankNote}>{r.note}</span>}
                    </span>
                    {r.delta ? (
                      <span className={styles.delta} aria-label={tn(missionDict, r.delta > 0 ? 'delta.up' : 'delta.down', Math.abs(r.delta))}>
                        {r.delta > 0 ? '↑' : '↓'}{Math.abs(r.delta)}
                      </span>
                    ) : null}
                    {r.demo ? (
                      <span className={styles.rankDemo}>{demoLabel()}</span>
                    ) : (
                      <>
                        <span className={styles.rankScore}>{r.score}</span>
                        <StatusIcon status={r.status} />
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className={styles.sky}>
      {side.blocks.map((b) => (
        <section key={b.kind} aria-label={b.label}>
          <h3><span className={styles.marker} data-kind={b.kind} aria-hidden="true" />{b.label}</h3>
          <p className={styles.skyValue}><span>{b.value}</span><span>{b.detail}</span></p>
          <div className={styles.meter} data-kind={b.kind} aria-hidden="true"><div style={{ width: `${Math.round(b.share * 100)}%` }} /></div>
          <p className={styles.small}>{b.shareLabel}</p>
        </section>
      ))}
      {side.marks && (
        <div className={styles.marks} role="group" aria-label={side.marks.label}>
          <span>{side.marks.label}</span>
          <div>
            {side.marks.options.map((o) => (
              <button key={o.id} type="button" className={styles.chip} disabled={frozen || o.disabled} onClick={() => onAct(o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
      {side.extras && (
        <dl className={styles.extras}>
          {side.extras.map((f) => (<div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>))}
        </dl>
      )}
    </div>
  );
}
