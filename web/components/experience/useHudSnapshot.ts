'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import type { PhaseHud, RunMode } from '@/lib/engine/hud';
import type { RoomStatus } from '@/lib/sync/room-client';
import { describeMission, paintedHud, type MissionInfo } from './mission';

export interface HudSnapshot {
  phase: PhaseName;
  mode: RunMode;
  muted: boolean;
  hud: PhaseHud | null;
  mission: MissionInfo;
  room: RoomStatus;
}

const POLL_MS = 100;

/**
 * Polls the running app and only commits a new snapshot when what is painted
 * differs from the previous one (functions drop out of the JSON key), so React
 * never re-renders just because a frame went by.
 */
export function useHudSnapshot(app: LunarApp | null) {
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const last = useRef('');

  const refresh = useCallback(() => {
    if (!app) return;
    const mode = app.run.mode;
    const next: HudSnapshot = {
      phase: app.phase?.name ?? 'launch',
      mode,
      muted: app.audio.muted,
      hud: paintedHud(mode, app.phase?.controlHud?.() ?? null),
      mission: describeMission(app, window.location.search),
      room: app.room.status,
    };
    const key = JSON.stringify(next);
    if (key === last.current) return;
    last.current = key;
    setSnap(next);
  }, [app]);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [refresh]);

  return { snap, refresh };
}
