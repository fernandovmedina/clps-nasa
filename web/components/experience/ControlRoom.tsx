'use client';

import type { ReactNode } from 'react';
import type { CapcomController } from '@/lib/capcom/controller';
import { PHASE_LABELS, PHASE_ORDER, STATUS_LABELS, STATUS_TONES, fmtInt, type HudSide, type PhaseHud } from '@/lib/engine/hud';
import { TRANSIT_DAYS } from '@/lib/mission/launch-plan';
import { CapcomButton, CapcomCaption } from './Capcom';
import FollowPill from './FollowPill';
import { CheckIcon, SoundIcon } from './icons';
import type { HudSnapshot } from './useHudSnapshot';
import layer from './MissionLayer.module.css';
import styles from './ControlRoom.module.css';

const MAX_EVENTS = 8;
const DEMO_LABEL = 'Demo · falla simulada del motor';

/** What the log watches: it adds an entry for each of these that changes. */
interface Seen { phase: HudSnapshot['phase']; mode: HudSnapshot['mode']; roomOpen: boolean; started: boolean; plan: string; site: string }
export interface LogEntry { id: number; at: string; text: string }
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
  const texts: string[] = [];
  if (seen.roomOpen && !prev?.roomOpen) texts.push(`Conectado a la sala ${code}`);
  if (seen.roomOpen && (!prev?.roomOpen || prev.plan !== seen.plan)) texts.push(`Plan recibido · ${seen.plan}`);
  let startLogged = log.startLogged;
  if (!startLogged && seen.roomOpen && (seen.started || seen.phase !== 'launch')) {
    texts.push('Despegue iniciado');
    startLogged = true;
  }
  if (prev && prev.phase !== seen.phase) texts.push(`Fase ${PHASE_ORDER.indexOf(seen.phase) + 1} de ${PHASE_ORDER.length}: ${PHASE_LABELS[seen.phase]}`);
  if (seen.site && prev?.site !== seen.site) texts.push(`Sitio elegido: ${seen.site}`);
  if (prev && prev.mode !== seen.mode) {
    texts.push(seen.mode === 'paused' ? 'Misión en pausa' : seen.mode === 'stopped' ? 'Misión detenida' : prev.mode === 'stopped' ? 'Misión reiniciada' : 'Misión reanudada');
  }
  let id = log.next;
  const added = texts.map((text) => ({ id: id++, at: stamp, text }));
  return { last: seen, startLogged, next: id, entries: [...added.reverse(), ...log.entries].slice(0, MAX_EVENTS) };
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

/** Mission Control as a control screen: opaque, over the 3D canvas that keeps running underneath as the source of the data. */
export default function ControlRoom({ view, code, log, capcom, soundOn, soundDisabled, onToggleSound, onLeave, controls, onRestart }: Props) {
  const { phase, mode, hud, mission, roomOpen, site, ranking, moonKm } = view;
  const stopped = mode === 'stopped';
  const paused = mode === 'paused';
  const waiting = hud?.waiting === true && phase === 'launch' && !stopped;
  const current = PHASE_ORDER.indexOf(phase);
  const readings = readingsOf(stopped ? null : hud);
  const plan = (text: string) => text.replace(/^(Despegue|Llegada) /, '');

  return (
    <div className={styles.room} data-mode={mode}>
      <header className={styles.top}>
        <h1>TOUCHDOWN<span>Mission Control</span></h1>
        <p className={styles.source}>Datos: NASA LOLA · JPL Horizons</p>
        <FollowPill code={code} open={roomOpen} />
        <div className={styles.actions}>
          {capcom && <CapcomButton controller={capcom} />}
          <button type="button" className={layer.iconBtn} aria-label="Sonido" aria-pressed={soundOn} disabled={soundDisabled} onClick={onToggleSound}>
            <SoundIcon muted={!soundOn} />
          </button>
          <button type="button" className={layer.btn} onClick={onLeave}>Salir</button>
        </div>
      </header>

      <ol className={styles.phases} aria-label="Fases de la misión">
        {PHASE_ORDER.map((id, i) => {
          const state = stopped ? 'pending' : i < current ? 'done' : i === current ? 'current' : 'pending';
          return (
            <li key={id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden="true">{state === 'done' ? <CheckIcon /> : i + 1}</span>
              <span>{PHASE_LABELS[id]}</span>
              {state === 'done' && <span className={layer.sr}>(completada)</span>}
            </li>
          );
        })}
      </ol>

      <div className={styles.grid}>
        {waiting ? (
          <section className={styles.card} role="status" aria-label="Estado de la misión">
            <h2>Estado de la misión</h2>
            <p className={styles.figure} data-testid="figure">{hud?.figure.value}</p>
            {hud?.detail && <p className={styles.detail}>{hud.detail}</p>}
            <p className={styles.small}>Modo seguimiento: los controles de la misión los tiene la tripulación.</p>
          </section>
        ) : (
          <section className={styles.card} aria-label="Estado de la misión">
            <h2>Estado de la misión</h2>
            {stopped ? (
              <>
                <p className={styles.figure} data-testid="figure">Detenida</p>
                <p className={styles.detail}>La simulación se detuvo en la fase de {PHASE_LABELS[phase].toLowerCase()}.</p>
              </>
            ) : (
              <>
                {paused && <span className={styles.badge} data-tone="warn">En pausa</span>}
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

        <section className={styles.card} aria-label="Misión que sigues">
          <h2>Lanzamiento</h2>
          {roomOpen ? (
            <dl className={styles.pairs}>
              <div><dt>Despegue</dt><dd>{plan(mission.launch)}</dd></div>
              <div><dt>Llegada</dt><dd>{plan(mission.landing)}</dd></div>
              <div><dt>Tránsito</dt><dd>{TRANSIT_DAYS} días (supuesto)</dd></div>
              <div><dt>Distancia Tierra–Luna a la llegada</dt><dd>{moonKm === null ? '—' : `${fmtInt(moonKm)} km`}</dd></div>
            </dl>
          ) : (
            <p className={styles.detail}>Conectando con la misión…</p>
          )}
        </section>

        <section className={styles.card} aria-label="Telemetría en vivo">
          <h2>Telemetría en vivo</h2>
          {readings.length > 0 ? (
            <dl className={styles.chips}>
              {readings.map((r) => (
                <div key={r.label} className={styles.chip}><dt>{r.label}</dt><dd>{r.value}</dd></div>
              ))}
            </dl>
          ) : (
            <p className={styles.detail}>Sin lecturas en esta fase.</p>
          )}
        </section>

        <section className={styles.card} aria-label="Sitio">
          <h2>Sitio</h2>
          {site ? (
            <>
              <p className={styles.siteName}>{site.name}</p>
              {site.demo ? (
                <p className={styles.figureRow}><span className={styles.caption}>{DEMO_LABEL}</span></p>
              ) : (
                <>
                  {site.note && <p className={styles.caption}>{site.note}</p>}
                  <p className={styles.figureRow}>
                    <span className={styles.score}>{site.score}</span>
                    <span className={styles.caption}>de 100</span>
                    <span className={styles.badge} data-tone={STATUS_TONES[site.status]}>{STATUS_LABELS[site.status]}</span>
                  </p>
                </>
              )}
              <dl className={styles.pairs}>
                <div><dt>Sol · elevación</dt><dd>{site.sunElevation}°</dd></div>
                <div><dt>Tierra · elevación</dt><dd>{site.earthElevation}°</dd></div>
                <div><dt>Tierra visible</dt><dd>{site.earthVisible ? 'Sí' : 'No'}</dd></div>
                <div><dt>Puesta del Sol en</dt><dd>{site.sunHours}</dd></div>
                <div><dt>Ocaso de la Tierra en</dt><dd>{site.earthHours}</dd></div>
              </dl>
            </>
          ) : (
            <p className={styles.siteName}>{mission.site}</p>
          )}
        </section>

        <section className={styles.card} aria-label="Ranking de sitios">
          <h2>Ranking</h2>
          {ranking.length > 0 ? (
            <ol className={styles.ranking}>
              {ranking.map((r) => (
                <li key={r.id}>
                  <span className={styles.rank}>{r.rank}</span>
                  <span className={styles.rankName}>{r.name}{!r.demo && r.note ? ` · ${r.note}` : ''}</span>
                  {r.demo ? (
                    <span className={styles.caption}>{DEMO_LABEL}</span>
                  ) : (
                    <>
                      <span className={styles.rankScore}>{r.score}</span>
                      <span className={styles.badge} data-tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.detail}>Aún no hay ranking: se calcula en la órbita.</p>
          )}
        </section>

        <section className={styles.card} aria-label="Registro de eventos">
          <h2>Registro de eventos</h2>
          <ol className={styles.log} role="log" aria-label="Registro de eventos de la misión">
            {log.entries.map((e) => (
              <li key={e.id}><time>{e.at}</time><span>{e.text}</span></li>
            ))}
          </ol>
        </section>

        {(stopped || !waiting) && (
          <section className={`${styles.card} ${styles.local}`} aria-label="Control local">
            <h2>Control local</h2>
            {stopped ? (
              <button type="button" className={layer.btn} data-variant="cta" onClick={onRestart}>Reiniciar desde el despegue</button>
            ) : controls}
          </section>
        )}
      </div>

      {capcom && <div className={styles.captions}><CapcomCaption controller={capcom} /></div>}
    </div>
  );
}
