'use client';

import { useEffect, useRef, useState } from 'react';
import { LunarApp, type PhaseName } from '@/lib/engine/app';
import { LaunchPhase } from '@/lib/phases/launch';
import { OrbitPhase } from '@/lib/phases/orbit';
import { PovPhase } from '@/lib/phases/pov';
import { LandingPhase } from '@/lib/phases/landing';
import { TransmitPhase } from '@/lib/phases/transmit';
import { PHASE_ORDER } from '@/lib/engine/hud';
import { loadMissionData } from '@/lib/mission/sites';
import MissionLayer from './experience/MissionLayer';
import styles from './LunarExperience.module.css';

// Avoids 0/O/1/I - easier to read aloud or type from across the room.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomRoomCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

// Written once a tab generates its own room code, so a reload of the SAME tab (the URL now
// carries ?room=<code> because resolveInitialRoom put it there) is still recognized as "my own
// room", not misread as "someone handed me a link" - sessionStorage survives reloads but not a
// fresh tab/window, which is exactly the "my session" boundary we want here.
const OWN_ROOM_KEY = 'touchdown:own-room';

/**
 * Without a room in the URL, everyone would land in the same default room.
 * Give each new visit its own, and put it in the URL so it's shareable.
 *
 * isHost marks who generated the code themselves (nobody handed it to them) -
 * that's the VR/inspector by convention: their camera gets broadcast in
 * pov.ts. Arriving via a shared link (room already in the URL, and it isn't
 * the one this tab generated for itself) means someone else is hosting, so
 * this client is the monitor instead (see AppOptions.isHost).
 */
function resolveInitialRoom(params: URLSearchParams): { room: string; isHost: boolean } {
  const fromUrl = params.get('room');
  if (fromUrl) {
    let ownRoom: string | null = null;
    try { ownRoom = window.sessionStorage.getItem(OWN_ROOM_KEY); } catch { /* storage unavailable (private mode, etc.) */ }
    return { room: fromUrl, isHost: fromUrl === ownRoom };
  }
  const generated = randomRoomCode();
  try { window.sessionStorage.setItem(OWN_ROOM_KEY, generated); } catch { /* storage unavailable */ }
  const url = new URL(window.location.href);
  url.searchParams.set('room', generated);
  window.history.replaceState(null, '', url.toString());
  return { room: generated, isHost: true };
}

export default function LunarExperience() {
  const mount = useRef<HTMLDivElement>(null);
  const appRef = useRef<LunarApp | null>(null);
  const [app, setApp] = useState<LunarApp | null>(null);
  const [xr, setXr] = useState<'checking' | 'yes' | 'no'>('checking');
  const [inVR, setInVR] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(true);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('phase') as PhaseName | null;
    const { room: initialRoom, isHost: initialIsHost } = resolveInitialRoom(params);
    setRoomCode(initialRoom);
    setIsHost(initialIsHost);
    const app = new LunarApp(el, {
      // ⬇️ Replace loadMissionData with your real fetches (JPL Horizons, LOLA, your API)
      loadData: loadMissionData,
      startPhase: q && PHASE_ORDER.includes(q) ? q : undefined,
      timeScale: Number(params.get('speed')) || 1,
      // Same room on two tabs/headsets = synced site + landing date (see orbit.ts).
      room: initialRoom,
      isHost: initialIsHost,
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
    // panels are drawn once on canvas: wait for Inter (max 1.5 s) so they never use the fallback font
    Promise.race([document.fonts?.load('600 16px "Inter Variable"'), new Promise((r) => setTimeout(r, 1500))])
      .catch(() => {})
      .then(() => (cancelled ? undefined : app.start()))
      .catch((e) => setError(String(e)));
    appRef.current = app;
    setApp(app);

    const onStart = () => setInVR(true);
    const onEnd = () => setInVR(false);
    app.renderer.xr.addEventListener('sessionstart', onStart);
    app.renderer.xr.addEventListener('sessionend', onEnd);

    if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => setXr(ok ? 'yes' : 'no')).catch(() => setXr('no'));
    else setXr('no');

    return () => {
      cancelled = true;
      app.renderer.xr.removeEventListener('sessionstart', onStart);
      app.renderer.xr.removeEventListener('sessionend', onEnd);
      app.dispose();
      appRef.current = null;
      setApp(null);
    };
  }, []);

  const enterVR = async () => {
    try { await appRef.current?.enterVR(); } catch (e) { setError(`No se pudo iniciar VR: ${String(e)}`); }
  };

  const joinRoom = (code: string) => {
    const current = appRef.current;
    if (current) { current.room.setRoom(code); current.isHost = false; }
    setIsHost(false);
  };

  return (
    <div className={styles.root}>
      <div ref={mount} className={styles.canvas} />
      {!inVR && <MissionLayer app={app} vr={xr} onEnterVR={enterVR} room={{ code: roomCode, isHost, onJoin: joinRoom }} />}
      {error && <div role="alert" className={styles.error}>{error}</div>}
    </div>
  );
}
