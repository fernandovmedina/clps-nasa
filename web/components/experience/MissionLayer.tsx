'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LunarApp } from '@/lib/engine/app';
import type { CapcomController } from '@/lib/capcom/controller';
import { PHASE_LABELS, PHASE_ORDER, collectActions } from '@/lib/engine/hud';
import { CapcomButton, CapcomCaption } from './Capcom';
import ControlRoom, { EMPTY_LOG, nextLog, seenOf } from './ControlRoom';
import Controls from './Controls';
import FollowMissionDialog from './FollowMissionDialog';
import FollowPill from './FollowPill';
import { CheckIcon, SoundIcon } from './icons';
import LaunchPlanner from './LaunchPlanner';
import { announce, describeMission } from './mission';
import MissionBlock from './MissionBlock';
import SidePanel from './SidePanel';
import StatusPanel from './StatusPanel';
import { useHudSnapshot, type HudSnapshot } from './useHudSnapshot';
import styles from './MissionLayer.module.css';

interface Props {
  app: LunarApp | null;
  vr: 'checking' | 'yes' | 'no';
  onEnterVR: () => void;
  room: { code: string; isHost: boolean; onJoin: (code: string) => boolean; onLeave: () => void };
  /** Voice assistant; absent when switched off with ?capcom=0. */
  capcom?: CapcomController | null;
  /** The launch planner is open. Held by the parent: this layer unmounts while the headset is on. */
  planning?: boolean;
  onPlanning?: (open: boolean) => void;
  /** Opens the "Seguir una misión" dialog as soon as this layer mounts (the Burrito espacial's Monitor answer, with no code yet). */
  openFollowOnMount?: boolean;
}

const NO_VR = 'VR no disponible aquí · ábrelo en el navegador del Quest (HTTPS)';

const IDLE: HudSnapshot = {
  phase: 'launch',
  mode: 'running',
  muted: false,
  hud: null,
  mission: describeMission({ data: null, selected: null }, ''),
  roomOpen: false,
  site: null,
  ranking: [],
  moonKm: null,
};

/** DOM control layer over the 3D scene: phases, mission, the phase's own data and the run controls. */
export default function MissionLayer({ app, vr, onEnterVR, room, capcom, planning = false, onPlanning, openFollowOnMount = false }: Props) {
  const { snap, refresh } = useHudSnapshot(app);
  const view = snap ?? IDLE;
  const { phase, mode, muted, hud, mission, roomOpen } = view;
  const stopped = mode === 'stopped';
  const paused = mode === 'paused';
  const current = PHASE_ORDER.indexOf(phase);

  const [announced, setAnnounced] = useState({ phase, mode, text: '' });
  if (announced.phase !== phase || announced.mode !== mode) {
    setAnnounced({ phase, mode, text: announce(announced, view) });
  }

  const pauseButton = useRef<HTMLButtonElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const wasStopped = useRef(false);
  useEffect(() => {
    if (stopped) restartButton.current?.focus();
    else if (wasStopped.current) pauseButton.current?.focus();
    wasStopped.current = stopped;
  }, [stopped]);

  const waiting = hud?.waiting === true;
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (wasWaiting.current && !waiting) pauseButton.current?.focus();
    wasWaiting.current = waiting;
  }, [waiting]);

  const act = (id: string) => {
    const current = app?.phase?.controlHud?.();
    if (current) collectActions(current).get(id)?.();
    refresh();
  };
  const togglePause = () => { app?.setPaused(!paused); refresh(); };
  const stop = () => { app?.stop(); refresh(); };
  const restart = () => { app?.restart(); refresh(); };
  const toggleSound = () => {
    if (!app) return;
    app.audio.setMuted(!app.audio.muted);
    refresh();
  };

  const soundOn = !muted && !stopped;
  const canVR = vr === 'yes';

  const follow = !room.isHost;
  const [following, setFollowing] = useState(openFollowOnMount);
  const prelaunch = phase === 'launch' && hud?.waiting === true && !stopped;
  const planner = planning && !follow && app !== null;
  const closePlanner = useCallback(() => { onPlanning?.(false); refresh(); }, [onPlanning, refresh]);
  const closeFollowing = useCallback(() => setFollowing(false), []);
  const waitingMonitor = follow && prelaunch;
  const controlsHud = planner && hud?.primary ? { ...hud, primary: { ...hud.primary, disabled: true } } : hud;

  const [log, setLog] = useState(EMPTY_LOG);
  if (follow) {
    const next = nextLog(log, seenOf(view), room.code);
    if (next !== log) setLog(next);
  }

  if (follow) {
    return (
      <div className={styles.layer} data-mode={mode} data-phase={phase}>
        <ControlRoom
          view={view}
          code={room.code}
          log={log}
          capcom={capcom}
          soundOn={soundOn}
          soundDisabled={stopped}
          onToggleSound={toggleSound}
          onLeave={room.onLeave}
          onRestart={restart}
          controls={<Controls mode={mode} hud={hud} pauseRef={pauseButton} onTogglePause={togglePause} onStop={stop} onAct={act} />}
        />
        <div className={styles.sr} role="status" aria-live="polite" aria-atomic="true">{announced.text}</div>
      </div>
    );
  }

  return (
    <div className={styles.layer} data-mode={mode} data-phase={phase}>
      <header className={styles.header} data-follow={follow ? '' : undefined}>
        <h1 className={styles.sr}>TOUCHDOWN</h1>
        {follow && <FollowPill code={room.code} open={roomOpen} />}
        <div className={styles.headerActions}>
          {capcom && <CapcomButton controller={capcom} />}
          <button type="button" className={styles.iconBtn} aria-label="Sonido" aria-pressed={soundOn} disabled={stopped} onClick={toggleSound}>
            <SoundIcon muted={!soundOn} />
          </button>
          {follow ? (
            <button type="button" className={styles.btn} onClick={room.onLeave}>Salir</button>
          ) : (
            <>
              <button type="button" className={styles.btn} aria-haspopup="dialog" onClick={() => setFollowing(true)}>Mission Control</button>
              <button
                type="button"
                className={styles.btn}
                data-vr={canVR ? 'yes' : 'no'}
                disabled={planner}
                aria-disabled={!canVR}
                aria-describedby={canVR ? undefined : 'vr-unavailable'}
                title={canVR ? undefined : NO_VR}
                onClick={canVR ? onEnterVR : undefined}
              >
                Entrar en VR
              </button>
              {!canVR && <span id="vr-unavailable" className={styles.sr}>{NO_VR}</span>}
            </>
          )}
        </div>
      </header>

      <div className={styles.rail}>
        <ol className={styles.phases} aria-label="Fases de la misión">
          {PHASE_ORDER.map((id, i) => {
            const state = stopped ? 'pending' : i < current ? 'done' : i === current ? 'current' : 'pending';
            return (
              <li key={id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={styles.dot} aria-hidden="true">{state === 'done' ? <CheckIcon /> : i + 1}</span>
                <span className={styles.phaseName}>{PHASE_LABELS[id]}</span>
                {state === 'done' && <span className={styles.sr}>(completada)</span>}
              </li>
            );
          })}
        </ol>
        <MissionBlock mission={mission} code={room.code} follow={follow} roomOpen={roomOpen} prelaunch={prelaunch} onChangeLaunch={() => onPlanning?.(true)} />
      </div>

      {hud && !stopped && (
        <section className={styles.side} aria-label="Datos de la fase">
          <SidePanel side={hud.side} frozen={paused} onAct={act} />
        </section>
      )}

      <div className={styles.bottom}>
        {waitingMonitor && hud ? (
          <section className={styles.status} role="status" aria-label="Estado de la misión">
            <p className={styles.figureRow}><span className={styles.figure} data-testid="figure">{hud.figure.value}</span></p>
            {hud.detail && <p className={styles.detail}>{hud.detail}</p>}
            <p className={styles.small}>Modo seguimiento: los controles de la misión los tiene la tripulación.</p>
          </section>
        ) : (
          <StatusPanel phase={phase} mode={mode} hud={hud} frozen={paused} onAct={act} />
        )}
        {capcom && <CapcomCaption controller={capcom} />}
        {!stopped && !waitingMonitor && (
          <Controls mode={mode} hud={controlsHud} pauseRef={pauseButton} onTogglePause={togglePause} onStop={stop} onAct={act} />
        )}
      </div>

      {stopped && (
        <section className={styles.stopped} aria-labelledby="stopped-title">
          <h2 id="stopped-title">Misión detenida</h2>
          <p>La simulación se detuvo en la fase de {PHASE_LABELS[phase].toLowerCase()} y el sonido está apagado. La fecha y el sitio elegidos se conservan.</p>
          <button ref={restartButton} type="button" className={styles.btn} data-variant="primary" onClick={restart}>Reiniciar desde el despegue</button>
          <a className={styles.btn} href="/mission-control/">Análisis de sitios y fechas</a>
        </section>
      )}

      <div className={styles.sr} role="status" aria-live="polite" aria-atomic="true">{announced.text}</div>

      {planner && <LaunchPlanner app={app} code={room.code} onClose={closePlanner} suspendEscape={following} />}
      {following && <FollowMissionDialog code={room.code} onJoin={room.onJoin} onClose={closeFollowing} />}
    </div>
  );
}
