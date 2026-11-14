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
const PING_INTERVAL_MS = 25_000;
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
  readonly room: string;
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private listener: Listener | null = null;
  private onStatus: ((s: RoomStatus) => void) | null = null;
  status: RoomStatus = 'connecting';

  constructor(room: string, onStatus?: (s: RoomStatus) => void) {
    this.room = ROOM_NAME_RE.test(room) ? room : 'touchdown';
    this.onStatus = onStatus ?? null;
    this.connect();
  }

  /** Only one phase listens at a time - whichever is currently entered. */
  setListener(fn: Listener | null) {
    this.listener = fn;
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
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
      this.setStatus('open');
      this.send({ type: 'hello' });
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let data: unknown;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      const type = (data as { type: unknown }).type;
      if (type === 'pong') return; // keepalive only, nothing for the listener to do
      this.listener?.(data as RoomEvent);
    };
    ws.onclose = () => {
      this.setStatus('closed');
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose fires right after; nothing extra to do */ };
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, RECONNECT_DELAY_MS);
  }
}
