import { isValidRoomName } from '@touchdown/core';

export interface RoomSession {
  room: string;
  isHost: boolean;
}

const STORAGE_KEY = 'touchdown:room';

function parseSaved(raw: string | null): RoomSession | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { room, isHost } = value as Record<string, unknown>;
  if (typeof room !== 'string' || !isValidRoomName(room) || typeof isHost !== 'boolean') return null;
  return { room, isHost };
}

/**
 * Decides this tab's room and role. The URL alone can't: generating a code
 * writes it to the URL, so after a reload (or a trip through Mission Control,
 * whose links carry no room) the host's own code looks like one someone handed
 * them. What this tab remembered resolves it:
 * - room in the URL, same as the one this tab hosts: still the host;
 * - room in the URL, anything else: someone shared it, so monitor;
 * - no room in the URL: the remembered room and role, else a new code as host.
 * An invalid room in the URL counts as absent, and so does a remembered one.
 */
export function resolveInitialRoom(params: URLSearchParams, savedRaw: string | null, generate: () => string): RoomSession {
  const saved = parseSaved(savedRaw);
  const fromUrl = params.get('room');
  if (fromUrl && isValidRoomName(fromUrl)) {
    return { room: fromUrl, isHost: saved?.room === fromUrl && saved.isHost };
  }
  return saved ?? { room: generate(), isHost: true };
}

export function readSavedRoom(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveRoom(session: RoomSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch { /* no sessionStorage (private mode, blocked): the room still works, it just isn't remembered */ }
}
