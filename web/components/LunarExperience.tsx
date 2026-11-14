'use client';

import { useEffect, useRef, useState } from 'react';
import { LunarApp, type PhaseName } from '@/lib/engine/app';
import { LaunchPhase } from '@/lib/phases/launch';
import { OrbitPhase } from '@/lib/phases/orbit';
import { PovPhase } from '@/lib/phases/pov';
import { LandingPhase } from '@/lib/phases/landing';
import { TransmitPhase } from '@/lib/phases/transmit';
import { loadMissionData } from '@/lib/mission/sites';
import styles from './LunarExperience.module.css';

const PHASES: { id: PhaseName; label: string }[] = [
  { id: 'launch', label: 'Despegue' },
  { id: 'orbit', label: 'Órbita y ranking' },
  { id: 'pov', label: 'Vista del sitio' },
  { id: 'landing', label: 'Alunizaje' },
  { id: 'transmit', label: 'Transmisión' },
];

// Avoids 0/O/1/I - easier to read aloud or type from across the room.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomRoomCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

/** Without a room in the URL, everyone would land in the same default room. Give each new visit its own, and put it in the URL so it's shareable. */
function resolveInitialRoom(params: URLSearchParams): string {
  const fromUrl = params.get('room');
  if (fromUrl) return fromUrl;
  const generated = randomRoomCode();
  const url = new URL(window.location.href);
  url.searchParams.set('room', generated);
  window.history.replaceState(null, '', url.toString());
  return generated;
}

export default function LunarExperience() {
  const mount = useRef<HTMLDivElement>(null);
  const appRef = useRef<LunarApp | null>(null);
  const [phase, setPhase] = useState<PhaseName>('launch');
  const [xr, setXr] = useState<'checking' | 'yes' | 'no'>('checking');
  const [inVR, setInVR] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('phase') as PhaseName | null;
    const initialRoom = resolveInitialRoom(params);
    setRoomCode(initialRoom);
    const app = new LunarApp(el, {
      // ⬇️ Replace loadMissionData with your real fetches (JPL Horizons, LOLA, your API)
      loadData: loadMissionData,
      onPhase: setPhase,
      startPhase: q && PHASES.some((p) => p.id === q) ? q : undefined,
      timeScale: Number(params.get('speed')) || 1,
      // Same room on two tabs/headsets = synced site + landing date (see orbit.ts).
      room: initialRoom,
      onRoomChange: (r) => {
        setRoomCode(r);
        const url = new URL(window.location.href);
        url.searchParams.set('room', r);
        window.history.replaceState(null, '', url.toString());
      },
    });
    app.register('launch', (a) => new LaunchPhase(a));
    app.register('orbit', (a) => new OrbitPhase(a));
    app.register('pov', (a) => new PovPhase(a));
    app.register('landing', (a) => new LandingPhase(a));
    app.register('transmit', (a) => new TransmitPhase(a));
    app.start().catch((e) => setError(String(e)));
    appRef.current = app;
    setMuted(app.audio.muted);

    const onStart = () => setInVR(true);
    const onEnd = () => setInVR(false);
    app.renderer.xr.addEventListener('sessionstart', onStart);
    app.renderer.xr.addEventListener('sessionend', onEnd);

    if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => setXr(ok ? 'yes' : 'no')).catch(() => setXr('no'));
    else setXr('no');

    return () => {
      app.renderer.xr.removeEventListener('sessionstart', onStart);
      app.renderer.xr.removeEventListener('sessionend', onEnd);
      app.dispose();
      appRef.current = null;
    };
  }, []);

  const enterVR = async () => {
    try { await appRef.current?.enterVR(); } catch (e) { setError(`No se pudo iniciar VR: ${String(e)}`); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard permission denied - the code itself is still visible to read aloud */ }
  };

  const joinRoom = () => {
    const code = joinValue.trim().toUpperCase();
    if (!code) return;
    appRef.current?.room.setRoom(code);
    setJoinOpen(false);
    setJoinValue('');
  };

  const toggleSound = () => {
    const audio = appRef.current?.audio;
    if (!audio) return;
    audio.setMuted(!audio.muted);
    setMuted(audio.muted);
  };

  return (
    <div className={styles.root}>
      <div ref={mount} className={styles.canvas} />
      {!inVR && (
        <>
          <div className={styles.topbar}>
            <ol className={styles.steps} aria-label="Fases de la misión">
              {PHASES.map((p, i) => (
                <li key={p.id} className={p.id === phase ? styles.active : PHASES.findIndex((x) => x.id === phase) > i ? styles.done : ''}>
                  <span>{i + 1}</span>{p.label}
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.roomBar}>
            {!joinOpen ? (
              <>
                <span className={styles.roomLabel}>Sala</span>
                <code className={styles.roomCode}>{roomCode || '…'}</code>
                <button className={styles.roomBtn} onClick={copyLink} title="Copiar enlace para invitar">
                  {copied ? '✓ copiado' : '🔗 copiar'}
                </button>
                <button className={styles.roomBtn} onClick={() => setJoinOpen(true)} title="Unirse a otra sala">Cambiar</button>
              </>
            ) : (
              <>
                <input
                  className={styles.roomInput}
                  value={joinValue}
                  onChange={(e) => setJoinValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); if (e.key === 'Escape') setJoinOpen(false); }}
                  placeholder="código de sala"
                  maxLength={16}
                  autoFocus
                />
                <button className={styles.roomBtn} onClick={joinRoom}>Unirse</button>
                <button className={styles.roomBtn} onClick={() => setJoinOpen(false)}>✕</button>
              </>
            )}
          </div>
          <div className={styles.bottombar}>
            <button type="button" className={styles.sound} aria-pressed={!muted} onClick={toggleSound}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
              </svg>
              <span className={styles.soundLabel}>{muted ? 'Sonido silenciado' : 'Sonido activado'}</span>
            </button>
            <span className={styles.hint}>Arrastra para mirar · clic en paneles y puntos para seleccionar</span>
            <a className={styles.control} href="/mission-control/">Elegir fecha de la misión</a>
            {xr === 'yes' && <button className={styles.vr} onClick={enterVR}>Entrar en VR</button>}
            {xr === 'no' && <span className={styles.novr}>VR no disponible aquí · ábrelo en el navegador del Quest (HTTPS)</span>}
          </div>
        </>
      )}
      {error && <div role="alert" className={styles.error}>{error}</div>}
    </div>
  );
}
