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
import { CapcomController } from '@/lib/capcom/controller';
import { installCapcomDebug } from '@/lib/capcom/debug';
import { mountCapcomVrPanel } from '@/lib/capcom/vr-panel';
import { readSavedRoom, resolveInitialRoom, saveRoom, type RoomSession } from '@/lib/sync/room-session';
import MissionLayer from './experience/MissionLayer';
import styles from './LunarExperience.module.css';

// Avoids 0/O/1/I - easier to read aloud or type from across the room.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomRoomCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

/**
 * Without a room in the URL, everyone would land in the same default room.
 * Give each new visit its own, and put it in the URL so it's shareable.
 *
 * isHost marks who generated the code themselves (nobody handed it to them) -
 * that's the VR/inspector by convention: their camera gets broadcast in
 * pov.ts. Arriving via a shared link means someone else is hosting, so this
 * client is the monitor instead (see AppOptions.isHost). The URL alone can't
 * tell the two apart after a reload, so room-session.ts also uses what this
 * tab remembered.
 */
function startRoom(params: URLSearchParams): RoomSession {
  const session = resolveInitialRoom(params, readSavedRoom(), randomRoomCode);
  const url = new URL(window.location.href);
  url.searchParams.set('room', session.room);
  window.history.replaceState(null, '', url.toString());
  return session;
}

export default function LunarExperience() {
  const mount = useRef<HTMLDivElement>(null);
  const appRef = useRef<LunarApp | null>(null);
  const capcomRef = useRef<CapcomController | null>(null);
  const [app, setApp] = useState<LunarApp | null>(null);
  const [capcom, setCapcom] = useState<CapcomController | null>(null);
  const [xr, setXr] = useState<'checking' | 'yes' | 'no'>('checking');
  const [inVR, setInVR] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(true);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('phase') as PhaseName | null;
    const vrPreview = params.get('vr') === 'preview';
    setPreview(vrPreview);
    const { room: initialRoom, isHost: initialIsHost } = startRoom(params);
    setRoomCode(initialRoom);
    setIsHost(initialIsHost);
    const app = new LunarApp(el, {
      // ⬇️ Replace loadMissionData with your real fetches (JPL Horizons, LOLA, your API)
      loadData: loadMissionData,
      startPhase: q && PHASE_ORDER.includes(q) ? q : undefined,
      timeScale: Number(params.get('speed')) || 1,
      vrPreview,
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
    const voice = params.get('capcom') === '0' ? null : new CapcomController(app, installCapcomDebug(params, app));
    capcomRef.current = voice;
    setCapcom(voice);
    const unmountVrPanel = voice ? mountCapcomVrPanel(app, voice) : null;

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
      unmountVrPanel?.();
      capcomRef.current?.dispose();
      capcomRef.current = null;
      setCapcom(null);
      app.dispose();
      appRef.current = null;
      setApp(null);
    };
  }, []);

  useEffect(() => {
    if (roomCode) saveRoom({ room: roomCode, isHost });
  }, [roomCode, isHost]);

  const enterVR = async () => {
    // The microphone cannot be requested inside a VR session: ask for it here, while the page is still on screen.
    try { await capcomRef.current?.prepareForVR(); } catch { /* VR works without CAPCOM */ }
    try { await appRef.current?.enterVR(); } catch (e) { setError(`No se pudo iniciar VR: ${String(e)}`); }
  };

  const joinRoom = (code: string): boolean => {
    const current = appRef.current;
    if (!current?.room.setRoom(code)) return false;
    current.isHost = false;
    setIsHost(false);
    return true;
  };

  return (
    <div className={styles.root}>
      <div ref={mount} className={styles.canvas} />
      {!inVR && !preview && <MissionLayer app={app} vr={xr} onEnterVR={enterVR} capcom={capcom} room={{ code: roomCode, isHost, onJoin: joinRoom }} />}
      {error && <div role="alert" className={styles.error}>{error}</div>}
    </div>
  );
}
