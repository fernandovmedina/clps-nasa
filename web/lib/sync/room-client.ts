/**
 * WebSocket client for the shared room state (CLAUDE.md sec. 7, Durable
 * Object `RoomHub` in worker/src/room-hub.ts). Lets Mission Control
 * (desktop) and the VR inspector (Quest) - two tabs of the SAME app, no
 * separate client - see the same selected site and landing date live.
 *
 * Same-origin by default: in production the Worker serves the web app AND
 * /ws from one domain; `pnpm dev`/`dev:lan` serve both from the same
 * localhost:8787. NEXT_PUBLIC_WS_URL overrides this for other setups.
 * If the connection never succeeds (no worker running, e.g. `pnpm dev:web`),
 * the app keeps working with local-only state, same as if the event's
 * internet dropped - sync is a bonus, never a requirement.
 */
import type { ClientMessage, RoomState } from '@touchdown/core';

const ROOM_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PING_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 25_000;
const RECONNECT_DELAY_MS = 2_000;

export type RoomStatus = 'connecting' | 'open' | 'closed';
/** Either the one-time full snapshot (reply to 'hello') or a relayed peer message. */
export type RoomEvent = RoomState | ClientMessage;
type Listener = (msg: RoomEvent) => void;

function defaultWsUrl(room: string): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  const base = configured && configured.length > 0
    ? configured.replace(/\/$/, '')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  return `${base}?room=${encodeURIComponent(room)}`;
}

export class RoomClient {
  room: string;
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private listener: Listener | null = null;
  private onStatus: ((s: RoomStatus) => void) | null = null;
  private onRoomChange: ((room: string) => void) | null = null;
  /**
   * Last full snapshot received in reply to 'hello'. The reply can arrive
   * before any phase is listening (the app starts in 'launch', which never
   * calls setListener), so it's buffered here and replayed to whichever
   * phase listens next - otherwise a monitor joining late would never see
   * markers/site/time that existed before it connected.
   */
  private lastState: RoomState | null = null;
  private lastMessageAt = 0;
  status: RoomStatus = 'connecting';

  constructor(room: string, onStatus?: (s: RoomStatus) => void, onRoomChange?: (room: string) => void) {
    this.room = ROOM_NAME_RE.test(room) ? room : 'touchdown';
    this.onStatus = onStatus ?? null;
    this.onRoomChange = onRoomChange ?? null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('online', this.onWake);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    this.connect();
  }

  /** Only one phase listens at a time - whichever is currently entered. */
  setListener(fn: Listener | null) {
    this.listener = fn;
    if (fn && this.lastState) fn(this.lastState);
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /**
   * Leaves the current room and joins another one, reconnecting right away (no 2s backoff).
   * Returns false, changing nothing, if the code is invalid or already the current room.
   */
  setRoom(newRoom: string): boolean {
    if (!ROOM_NAME_RE.test(newRoom) || newRoom === this.room) return false;
    this.room = newRoom;
    this.lastState = null; // stale snapshot from the old room; the new room will reply to our next 'hello'
    this.onRoomChange?.(newRoom);
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      // Detach handlers first so the old socket's onclose can't schedule a
      // stray reconnect-to-old-room once we've already moved on below.
      this.ws.onopen = null; this.ws.onmessage = null; this.ws.onclose = null; this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connect();
    return true;
  }

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.removeEventListener('online', this.onWake);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  private setStatus(s: RoomStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  private connect() {
    if (this.closed) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(defaultWsUrl(this.room));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.lastMessageAt = Date.now();
      this.setStatus('open');
      this.send({ type: 'hello' });
      this.pingTimer = setInterval(() => this.heartbeat(), PING_INTERVAL_MS);
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      if (typeof ev.data !== 'string') return;
      let data: unknown;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      const type = (data as { type: unknown }).type;
      if (type === 'pong') return; // keepalive only, nothing for the listener to do
      if (type === 'state') this.lastState = data as RoomState;
      this.listener?.(data as RoomEvent);
    };
    ws.onclose = () => {
      this.setStatus('closed');
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose fires right after; nothing extra to do */ };
  }

  /** Ping, or give up on a socket that has been silent for too long (the network died without a close event). */
  private heartbeat() {
    if (Date.now() - this.lastMessageAt > STALE_AFTER_MS) this.reconnectNow();
    else this.send({ type: 'ping' });
  }

  private onWake = () => {
    if (this.closed) return;
    const healthy = this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt <= STALE_AFTER_MS;
    if (!healthy) this.reconnectNow();
  };

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.onWake();
  };

  private reconnectNow() {
    if (this.closed) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      this.ws.onopen = null; this.ws.onmessage = null; this.ws.onclose = null; this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('closed');
    this.connect();
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, RECONNECT_DELAY_MS);
  }
}
