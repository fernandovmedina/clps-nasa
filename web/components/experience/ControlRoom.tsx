'use client';

import type { ReactNode } from 'react';
import type { CapcomController } from '@/lib/capcom/controller';
import type { PhaseName } from '@/lib/engine/app';
import { PHASE_ORDER, STATUS_TONES, fmtInt, type HudSide, type PhaseHud } from '@/lib/engine/hud';
import { t as translate, type DictKey, type Vars } from '@/lib/i18n';
import { controlRoomDict } from '@/lib/i18n/dicts/ui-control-room';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
import { TRANSIT_DAYS } from '@/lib/mission/launch-plan';
import { CapcomButton, CapcomCaption } from './Capcom';
import FollowPill from './FollowPill';
import { CheckIcon, SoundIcon } from './icons';
import { demoLabel, phaseLabel, statusLabel } from './ui-text';
import type { HudSnapshot } from './useHudSnapshot';
import layer from './MissionLayer.module.css';
import styles from './ControlRoom.module.css';

const MAX_EVENTS = 8;

/** What the log watches: it adds an entry for each of these that changes. */
interface Seen { phase: HudSnapshot['phase']; mode: HudSnapshot['mode']; roomOpen: boolean; started: boolean; plan: string; site: string }
/** `text` is what the entry said when it was written; `key` and `vars` let the screen say it again in the language of the moment. */
export type LogKey = Extract<DictKey<typeof controlRoomDict>, `log.${string}`>;
export interface LogEntry { id: number; at: string; text: string; key: LogKey; vars?: Vars }
export interface LogState { last: Seen | null; startLogged: boolean; next: number; entries: LogEntry[] }

export const EMPTY_LOG: LogState = { last: null, startLogged: false, next: 1, entries: [] };

export function seenOf(view: HudSnapshot): Seen {
  return {
    phase: view.phase, mode: view.mode, roomOpen: view.roomOpen,
    started: view.hud ? view.hud.waiting !== true : false,
    plan: `${view.mission.launch} · ${view.mission.landing}`,
    site: view.site?.name ?? '',
  };
}

function sameSeen(a: Seen | null, b: Seen): boolean {
  return !!a && a.phase === b.phase && a.mode === b.mode && a.roomOpen === b.roomOpen && a.started === b.started && a.plan === b.plan && a.site === b.site;
}

/** The event log after the mission moved to `seen`: pure apart from the clock, which `at` can fix for tests. */
export function nextLog(log: LogState, seen: Seen, code: string, at: Date = new Date()): LogState {
  if (sameSeen(log.last, seen)) return log;
  const prev = log.last;
  const stamp = `${at.toISOString().slice(11, 19)} UTC`;
  const texts: { key: LogKey; vars?: Vars }[] = [];
  if (seen.roomOpen && !prev?.roomOpen) texts.push({ key: 'log.connected', vars: { code } });
  if (seen.roomOpen && (!prev?.roomOpen || prev.plan !== seen.plan)) texts.push({ key: 'log.plan', vars: { plan: seen.plan } });
  let startLogged = log.startLogged;
  if (!startLogged && seen.roomOpen && (seen.started || seen.phase !== 'launch')) {
    texts.push({ key: 'log.started' });
    startLogged = true;
  }
  if (prev && prev.phase !== seen.phase) texts.push({ key: 'log.phase', vars: { n: PHASE_ORDER.indexOf(seen.phase) + 1, total: PHASE_ORDER.length, phase: seen.phase } });
  if (seen.site && prev?.site !== seen.site) texts.push({ key: 'log.site', vars: { site: seen.site } });
  if (prev && prev.mode !== seen.mode) {
    texts.push({ key: seen.mode === 'paused' ? 'log.paused' : seen.mode === 'stopped' ? 'log.stopped' : prev.mode === 'stopped' ? 'log.restarted' : 'log.resumed' });
  }
  let id = log.next;
  const added = texts.map((e) => ({ id: id++, at: stamp, ...e, text: entryText(e.key, e.vars) }));
  return { last: seen, startLogged, next: id, entries: [...added.reverse(), ...log.entries].slice(0, MAX_EVENTS) };
}

/** An event log line in the current language; `phase` travels as the phase id and is named here. */
export function entryText(key: LogKey, vars?: Vars): string {
  const phase = vars?.phase;
  return translate(controlRoomDict, key, phase === undefined ? vars : { ...vars, phase: phaseLabel(phase as PhaseName) });
}

/** The «Despegue»/«Llegada» prefix the mission text carries, taken off in whichever language it was written. */
function planDate(text: string): string {
  for (const key of ['plan.launch', 'plan.landing'] as const) {
    const prefix = translate(missionDict, key, { date: '' });
    if (text.startsWith(prefix)) return text.slice(prefix.length);
  }
  return text;
}

type Reading = { label: string; value: string };

/** Every reading of the phase's side panel (and the facts under its figure) as plain label/value pairs. */
export function readingsOf(hud: PhaseHud | null): Reading[] {
  if (!hud) return [];
  const side: HudSide = hud.side;
  const out: Reading[] = [];
  if (side.kind === 'readouts') for (const i of side.items) out.push({ label: i.label, value: i.value });
  else if (side.kind === 'sky') {
    for (const b of side.blocks) out.push({ label: b.label, value: `${b.value} ${b.detail}`.trim() });
    for (const f of side.extras ?? []) out.push({ label: f.label, value: f.value });
  }
  for (const f of hud.facts ?? []) out.push({ label: f.label, value: f.value });
  return out;
}

interface Props {
  view: HudSnapshot;
  code: string;
  log: LogState;
  capcom?: CapcomController | null;
  soundOn: boolean;
  soundDisabled: boolean;
  onToggleSound: () => void;
  onLeave: () => void;
  /** The local run controls, already wired: shown in a quiet card once the launch has started. */
  controls: ReactNode;
  /** Stopped missions offer to start over from here. */
  onRestart: () => void;
}

/** The follower's screen ("Seguimiento") as a control screen: opaque, over the 3D canvas that keeps running underneath as the source of the data. */
export default function ControlRoom({ view, code, log, capcom, soundOn, soundDisabled, onToggleSound, onLeave, controls, onRestart }: Props) {
  const t = useT(controlRoomDict);
  const tm = useT(missionDict);
  const { phase, mode, hud, mission, roomOpen, site, ranking, moonKm } = view;
  const stopped = mode === 'stopped';
  const paused = mode === 'paused';
  const waiting = hud?.waiting === true && phase === 'launch' && !stopped;
  const current = PHASE_ORDER.indexOf(phase);
  const readings = readingsOf(stopped ? null : hud);

  return (
    <div className={styles.room} data-mode={mode}>
      <header className={styles.top}>
        <h1>TOUCHDOWN<span>{t('tracking')}</span></h1>
        <p className={styles.source}>{t('source')}</p>
        <FollowPill code={code} open={roomOpen} />
        <div className={styles.actions}>
          {capcom && <CapcomButton controller={capcom} />}
          <button type="button" className={layer.iconBtn} aria-label={tm('sound')} aria-pressed={soundOn} disabled={soundDisabled} onClick={onToggleSound}>
            <SoundIcon muted={!soundOn} />
          </button>
          <button type="button" className={layer.btn} onClick={onLeave}>{tm('leave')}</button>
        </div>
      </header>

      <ol className={styles.phases} aria-label={tm('phases')}>
        {PHASE_ORDER.map((id, i) => {
          const state = stopped ? 'pending' : i < current ? 'done' : i === current ? 'current' : 'pending';
          return (
            <li key={id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden="true">{state === 'done' ? <CheckIcon /> : i + 1}</span>
              <span>{phaseLabel(id)}</span>
              {state === 'done' && <span className={layer.sr}>{tm('done')}</span>}
            </li>
          );
        })}
      </ol>

      <div className={styles.grid}>
        {waiting ? (
          <section className={styles.card} role="status" aria-label={t('status')}>
            <h2>{t('status')}</h2>
            <p className={styles.figure} data-testid="figure">{hud?.figure.value}</p>
            {hud?.detail && <p className={styles.detail}>{hud.detail}</p>}
            <p className={styles.small}>{t('followMode')}</p>
          </section>
        ) : (
          <section className={styles.card} aria-label={t('status')}>
            <h2>{t('status')}</h2>
            {stopped ? (
              <>
                <p className={styles.figure} data-testid="figure">{t('stopped')}</p>
                <p className={styles.detail}>{t('stoppedDetail', { phase: phaseLabel(phase).toLowerCase() })}</p>
              </>
            ) : (
              <>
                {paused && <span className={styles.badge} data-tone="warn">{t('paused')}</span>}
                <p className={styles.figureRow}>
                  <span className={styles.figure} data-testid="figure">{hud?.figure.value ?? '—'}</span>
                  {hud?.figure.caption && <span className={styles.caption}>{hud.figure.caption}</span>}
                  {hud?.figure.badge && !paused && <span className={styles.badge} data-tone={hud.figure.badge.tone}>{hud.figure.badge.label}</span>}
                </p>
                {hud?.progress && !paused && (
                  <div className={styles.progress}>
                    <div className={styles.bar} role="progressbar" aria-label={hud.progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.progress.value * 100)}>
                      <div style={{ width: `${Math.round(hud.progress.value * 100)}%` }} />
                    </div>
                    {hud.progress.text && <span>{hud.progress.text}</span>}
                  </div>
                )}
                {hud?.detail && !paused && <p className={styles.detail}>{hud.detail}</p>}
              </>
            )}
          </section>
        )}

        <section className={styles.card} aria-label={t('followed')}>
          <h2>{t('launchTitle')}</h2>
          {roomOpen ? (
            <dl className={styles.pairs}>
              <div><dt>{t('launch')}</dt><dd>{planDate(mission.launch)}</dd></div>
              <div><dt>{t('landing')}</dt><dd>{planDate(mission.landing)}</dd></div>
              <div><dt>{t('transit')}</dt><dd>{t('transitValue', { days: TRANSIT_DAYS })}</dd></div>
              <div><dt>{t('distance')}</dt><dd>{moonKm === null ? '—' : `${fmtInt(moonKm)} km`}</dd></div>
            </dl>
          ) : (
            <p className={styles.detail}>{t('connecting')}</p>
          )}
        </section>

        <section className={styles.card} aria-label={t('telemetry')}>
          <h2>{t('telemetry')}</h2>
          {readings.length > 0 ? (
            <dl className={styles.chips}>
              {readings.map((r) => (
                <div key={r.label} className={styles.chip}><dt>{r.label}</dt><dd>{r.value}</dd></div>
              ))}
            </dl>
          ) : (
            <p className={styles.detail}>{t('noReadings')}</p>
          )}
        </section>

        <section className={styles.card} aria-label={t('site')}>
          <h2>{t('site')}</h2>
          {site ? (
            <>
              <p className={styles.siteName}>{site.name}</p>
              {site.demo ? (
                <p className={styles.figureRow}><span className={styles.caption}>{demoLabel()}</span></p>
              ) : (
                <>
                  {site.note && <p className={styles.caption}>{site.note}</p>}
                  <p className={styles.figureRow}>
                    <span className={styles.score}>{site.score}</span>
                    <span className={styles.caption}>{t('outOf')}</span>
                    <span className={styles.badge} data-tone={STATUS_TONES[site.status]}>{statusLabel(site.status)}</span>
                  </p>
                </>
              )}
              <dl className={styles.pairs}>
                <div><dt>{t('sunElevation')}</dt><dd>{site.sunElevation}°</dd></div>
                <div><dt>{t('earthElevation')}</dt><dd>{site.earthElevation}°</dd></div>
                <div><dt>{t('earthVisible')}</dt><dd>{site.earthVisible ? t('yes') : t('no')}</dd></div>
                <div><dt>{t('sunset')}</dt><dd>{site.sunHours}</dd></div>
                <div><dt>{t('earthset')}</dt><dd>{site.earthHours}</dd></div>
              </dl>
            </>
          ) : (
            <p className={styles.siteName}>{mission.site}</p>
          )}
        </section>

        <section className={styles.card} aria-label={t('rankingAria')}>
          <h2>{t('rankingTitle')}</h2>
          {ranking.length > 0 ? (
            <ol className={styles.ranking}>
              {ranking.map((r) => (
                <li key={r.id}>
                  <span className={styles.rank}>{r.rank}</span>
                  <span className={styles.rankName}>{r.name}{!r.demo && r.note ? ` · ${r.note}` : ''}</span>
                  {r.demo ? (
                    <span className={styles.caption}>{demoLabel()}</span>
                  ) : (
                    <>
                      <span className={styles.rankScore}>{r.score}</span>
                      <span className={styles.badge} data-tone={STATUS_TONES[r.status]}>{statusLabel(r.status)}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.detail}>{t('rankingEmpty')}</p>
          )}
        </section>

        <section className={styles.card} aria-label={t('log')}>
          <h2>{t('log')}</h2>
          <ol className={styles.log} role="log" aria-label={t('logAria')}>
            {log.entries.map((e) => (
              <li key={e.id}><time>{e.at}</time><span>{entryText(e.key, e.vars)}</span></li>
            ))}
          </ol>
        </section>

        {(stopped || !waiting) && (
          <section className={`${styles.card} ${styles.local}`} aria-label={t('local')}>
            <h2>{t('local')}</h2>
            {stopped ? (
              <button type="button" className={layer.btn} data-variant="cta" onClick={onRestart}>{t('restart')}</button>
            ) : controls}
          </section>
        )}
      </div>

      {capcom && <div className={styles.captions}><CapcomCaption controller={capcom} /></div>}
    </div>
  );
}
