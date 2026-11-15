'use client';

import { useEffect, useRef, useState } from 'react';
import type { LunarApp } from '@/lib/engine/app';
import { PHASE_LABELS, PHASE_ORDER, collectActions } from '@/lib/engine/hud';
import Controls from './Controls';
import { CheckIcon, SoundIcon } from './icons';
import { announce, describeMission } from './mission';
import RoomControls from './RoomControls';
import SidePanel from './SidePanel';
import StatusPanel from './StatusPanel';
import { useHudSnapshot, type HudSnapshot } from './useHudSnapshot';
import styles from './MissionLayer.module.css';

interface Props {
  app: LunarApp | null;
  vr: 'checking' | 'yes' | 'no';
  onEnterVR: () => void;
  room: { code: string; isHost: boolean; onJoin: (code: string) => boolean };
}

const NO_VR = 'VR no disponible aquí · ábrelo en el navegador del Quest (HTTPS)';

const IDLE: HudSnapshot = {
  phase: 'launch',
  mode: 'running',
  muted: false,
  hud: null,
  mission: describeMission({ data: null, selected: null }, ''),
};

/** DOM control layer over the 3D scene: phases, mission, the phase's own data and the run controls. */
export default function MissionLayer({ app, vr, onEnterVR, room }: Props) {
  const { snap, refresh } = useHudSnapshot(app);
  const view = snap ?? IDLE;
  const { phase, mode, muted, hud, mission } = view;
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

  return (
    <div className={styles.layer} data-mode={mode} data-phase={phase}>
      <header className={styles.header}>
        <h1 className={styles.brand}>TOUCHDOWN<span>La misión, paso a paso</span></h1>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconBtn} aria-label="Sonido" aria-pressed={soundOn} disabled={stopped} onClick={toggleSound}>
            <SoundIcon muted={!soundOn} />
          </button>
          <a className={styles.btn} href="/mission-control/">Mission Control</a>
          <button
            type="button"
            className={styles.btn}
            data-vr={canVR ? 'yes' : 'no'}
            aria-disabled={!canVR}
            aria-describedby={canVR ? undefined : 'vr-unavailable'}
            title={canVR ? undefined : NO_VR}
            onClick={canVR ? onEnterVR : undefined}
          >
            Entrar en VR
          </button>
          {!canVR && <span id="vr-unavailable" className={styles.sr}>{NO_VR}</span>}
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
        <section className={styles.mission} aria-label="Misión">
          <h2>Misión</h2>
          <p className={styles.site}>{mission.site}</p>
          <p className={styles.date}>{mission.landing}</p>
          <div className={styles.missionLinks}>
            <a href="/mission-control/">Cambiar fecha o sitio</a>
            <RoomControls code={room.code} isHost={room.isHost} onJoin={room.onJoin} />
          </div>
        </section>
      </div>

      {hud && !stopped && (
        <section className={styles.side} aria-label="Datos de la fase">
          <SidePanel side={hud.side} frozen={paused} onAct={act} />
        </section>
      )}

      <div className={styles.bottom}>
        <StatusPanel phase={phase} mode={mode} hud={hud} frozen={paused} onAct={act} />
        {!stopped && (
          <Controls mode={mode} hud={hud} pauseRef={pauseButton} onTogglePause={togglePause} onStop={stop} onAct={act} />
        )}
      </div>

      {stopped && (
        <section className={styles.stopped} aria-labelledby="stopped-title">
          <h2 id="stopped-title">Misión detenida</h2>
          <p>La simulación se detuvo en la fase de {PHASE_LABELS[phase].toLowerCase()} y el sonido está apagado. La fecha y el sitio elegidos se conservan.</p>
          <button ref={restartButton} type="button" className={styles.btn} data-variant="primary" onClick={restart}>Reiniciar desde el despegue</button>
          <a className={styles.btn} href="/mission-control/">Volver a Mission Control</a>
        </section>
      )}

      <div className={styles.sr} role="status" aria-live="polite" aria-atomic="true">{announced.text}</div>
    </div>
  );
}
