'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LunarApp } from '@/lib/engine/app';
import { STATUS_TONES } from '@/lib/engine/hud';
import { plannerDict } from '@/lib/i18n/dicts/ui-planner';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
import {
  checkLaunch,
  currentLanding,
  landingFromLaunch,
  launchFromLanding,
  launchInputs,
  launchRange,
  parseLaunchInputs,
  TRANSIT_DAYS,
  topSites,
} from '@/lib/mission/launch-plan';
import { controlHref } from '@/lib/mission/control-link';
import type { MissionData } from '@/lib/mission/sites';
import { earthMoonDistanceKm } from '@/lib/phases/launch-telemetry';
import dialog from './Dialog.module.css';
import layer from './MissionLayer.module.css';
import styles from './LaunchPlanner.module.css';
import { fmtCount, fmtPlanDate, statusLabel } from './ui-text';

interface Props {
  app: LunarApp;
  code: string;
  onClose: () => void;
  /** Another dialog is on top: it owns Escape. */
  suspendEscape?: boolean;
}

/** The mission data arrives while the launch loads it; the planner only needs to know when it is there. */
function useLoadedData(app: LunarApp): MissionData | null {
  const [data, setData] = useState<MissionData | null>(app.data);
  useEffect(() => {
    if (data) return;
    const timer = window.setInterval(() => { if (app.data) setData(app.data); }, 150);
    return () => window.clearInterval(timer);
  }, [app, data]);
  return data;
}

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled), a[href]';

export default function LaunchPlanner({ app, code, onClose, suspendEscape = false }: Props) {
  const t = useT(plannerDict);
  const tm = useT(missionDict);
  const data = useLoadedData(app);
  const titleId = useId();
  const errorId = useId();
  const root = useRef<HTMLElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [edit, setEdit] = useState<{ date: string; time: string } | null>(null);

  const plan = currentLanding(data, window.location.search);
  const planned = launchInputs(launchFromLanding(plan));
  const fields = edit ?? planned;

  const launch = edit ? parseLaunchInputs(edit.date, edit.time) : launchFromLanding(plan);
  const check = data ? checkLaunch(launch, data.ephemerisRange) : null;
  const landing = launch ? landingFromLaunch(launch) : null;
  const landingMs = check?.ok ? check.landing.getTime() : null;

  const results = data && landingMs !== null
    ? { sites: topSites(data.sites, new Date(landingMs)), km: earthMoonDistanceKm(data.global, new Date(landingMs)) }
    : null;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dateField.current?.focus();
    return () => {
      window.clearTimeout(copyTimer.current);
      const target = previous && previous !== document.body && previous.isConnected
        ? previous
        : document.querySelector<HTMLElement>('[data-primary]');
      target?.focus();
    };
  }, []);

  useEffect(() => {
    if (suspendEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, suspendEscape]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // clipboard denied: the code stays readable on screen
    }
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const confirm = () => {
    if (!check?.ok) return;
    if (!app.setLanding(check.landing)) return;
    app.room.send({ type: 'set_time', t: check.landing.toISOString() });
    onClose();
  };

  const invalid = check !== null && !check.ok;
  let message: string | null = null;
  if (data && check && !check.ok) {
    if (check.reason === 'invalid' || !launch) message = t('invalid');
    else {
      const range = data.ephemerisRange;
      const launches = launchRange(range);
      message = t('outOfRange', {
        landing: fmtPlanDate(landingFromLaunch(launch)), from: fmtPlanDate(range.start), to: fmtPlanDate(range.end),
        launchFrom: fmtPlanDate(launches.start), launchTo: fmtPlanDate(launches.end),
      });
    }
  }

  return (
    <>
      <div className={dialog.veil} data-level="planner" aria-hidden="true" />
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialog.card}
        data-level="planner"
        onKeyDown={trapTab}
      >
        <div className={dialog.head}>
          <p className={dialog.eyebrow}>{t('eyebrow')}</p>
          <h2 id={titleId} className={dialog.title}>{t('title')}</h2>
          <p className={dialog.lede}>{t('lede')}</p>
        </div>

        <div className={styles.fields}>
          <label className={dialog.field}>
            <span>{t('date')}</span>
            <input
              ref={dateField}
              className={dialog.input}
              type="date"
              value={fields.date}
              aria-invalid={invalid || undefined}
              aria-describedby={message ? errorId : undefined}
              onChange={(e) => setEdit({ ...fields, date: e.target.value })}
            />
          </label>
          <label className={dialog.field}>
            <span>{t('time')}</span>
            <input
              className={dialog.input}
              type="time"
              value={fields.time}
              aria-invalid={invalid || undefined}
              aria-describedby={message ? errorId : undefined}
              onChange={(e) => setEdit({ ...fields, time: e.target.value })}
            />
          </label>
        </div>

        {message && <p id={errorId} role="alert" className={dialog.error}>{message}</p>}

        {!data ? (
          <p role="status" className={styles.pending}>{t('pending')}</p>
        ) : (
          <>
            <dl className={styles.figures}>
              <div className={styles.figure}>
                <dt>{t('arrival')}</dt>
                <dd className={styles.value} data-testid="planner-arrival">{landing ? fmtPlanDate(landing) : '—'}</dd>
                <dd className={styles.hint}>{t('transit', { days: TRANSIT_DAYS })}</dd>
              </div>
              <div className={styles.figure}>
                <dt>{t('distance')}</dt>
                <dd className={styles.value} data-testid="planner-distance">{results?.km != null ? `${fmtCount(results.km)} km` : '—'}</dd>
                <dd className={styles.hint}>JPL Horizons</dd>
              </div>
            </dl>

            <div className={styles.sites}>
              <h3>{t('best')}</h3>
              {results ? (
                <ol aria-label={t('best')}>
                  {results.sites.map((m) => (
                    <li key={m.site.id}>
                      <span className={styles.rank}>{m.rank}</span>
                      <span className={styles.name}>{m.site.name}</span>
                      <span className={styles.score}>{Math.round(m.score)}</span>
                      <span className={styles.badge} data-tone={STATUS_TONES[m.status]}>{statusLabel(m.status)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.note}>{t('pickRange')}</p>
              )}
              <p className={styles.note}>{t('note')}</p>
            </div>
          </>
        )}

        <div className={styles.codeBox}>
          <h3>{t('code')}</h3>
          <p className={styles.code} data-testid="planner-code">{code}</p>
          <p>{t('share', { follow: tm('follow') })}</p>
          <button type="button" className={layer.btn} onClick={copy}>{copied ? t('copied') : t('copy')}</button>
        </div>

        <div className={styles.footer}>
          <a href={controlHref({ site: null, landing: plan })} target="_blank" rel="noopener">{t('analysis')}</a>
          <button type="button" className={layer.btn} data-variant="cta" disabled={!check?.ok} onClick={confirm}>{t('confirm')}</button>
        </div>
      </section>
    </>
  );
}
