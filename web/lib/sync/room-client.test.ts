import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomClient, type RoomStatus } from './room-client';

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push((JSON.parse(data) as { type: string }).type); }
  close() { this.closed = true; this.readyState = 3; }
  drop() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(data: unknown) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
}

const STATE_MSG = { type: 'state', site_id: 'malapert-a', t: '2027-01-10T00:00:00Z', playing: false, speed: 1, markers: [] };

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function latest(): FakeSocket {
  return FakeSocket.instances.at(-1)!;
}

const clients: RoomClient[] = [];

function create(onStatus?: (s: RoomStatus) => void) {
  const client = new RoomClient('ABCD', onStatus);
  clients.push(client);
  return client;
}

function connected(onStatus?: (s: RoomStatus) => void) {
  const client = create(onStatus);
  const socket = latest();
  socket.open();
  return { client, socket };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setVisibility('visible');
});
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('RoomClient.setRoom', () => {
  it.each([
    ['an empty code', ''],
    ['a code with a space', 'AB CD'],
    ['a code with a dot', 'AB.CD'],
    ['a code that is too long', 'A'.repeat(65)],
    ['the current room', 'ABCD'],
  ])('returns false and changes nothing for %s', (_name, code) => {
    const onRoomChange = vi.fn();
    const client = new RoomClient('ABCD', undefined, onRoomChange);
    const [socket] = FakeSocket.instances;

    expect(client.setRoom(code)).toBe(false);
    expect(client.room).toBe('ABCD');
    expect(onRoomChange).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toEqual([socket]);
    expect(socket!.closed).toBe(false);
    client.close();
  });

  it('returns true when it really moves to another room, reconnecting right away', () => {
    const onRoomChange = vi.fn();
    const client = new RoomClient('ABCD', undefined, onRoomChange);
    const [first] = FakeSocket.instances;

    expect(client.setRoom('WXYZ')).toBe(true);
    expect(client.room).toBe('WXYZ');
    expect(onRoomChange).toHaveBeenCalledExactlyOnceWith('WXYZ');
    expect(first!.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1]!.url).toContain('room=WXYZ');
    client.close();
  });

  it('returns false when asked for the room it just moved to', () => {
    const client = new RoomClient('ABCD');
    expect(client.setRoom('WXYZ')).toBe(true);
    expect(client.setRoom('WXYZ')).toBe(false);
    client.close();
  });
});

describe('RoomClient heartbeat', () => {
  it('keeps a socket open while it keeps answering pings', () => {
    const { client, socket } = connected();

    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(10_000);
      socket.receive({ type: 'pong' });
    }

    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.status).toBe('open');
    expect(socket.sent).toEqual(['hello', 'ping', 'ping', 'ping', 'ping', 'ping', 'ping']);
    client.close();
  });

  it('replaces a silent socket at once, without the 2s backoff, and greets on the new one', () => {
    const statuses: RoomStatus[] = [];
    const { client, socket: dead } = connected((s) => statuses.push(s));

    vi.advanceTimersByTime(20_000);
    expect(dead.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(dead.closed).toBe(true);
    expect(dead.onclose).toBeNull();
    expect(dead.onmessage).toBeNull();
    expect(dead.sent).toEqual(['hello', 'ping', 'ping']);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(statuses).toEqual(['connecting', 'open', 'closed', 'connecting']);

    const fresh = latest();
    expect(fresh.url).toContain('room=ABCD');
    fresh.open();
    expect(fresh.sent).toEqual(['hello']);
    expect(client.status).toBe('open');

    vi.advanceTimersByTime(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });

  it.each([
    ['a state snapshot', STATE_MSG],
    ['a relayed peer message', { type: 'set_time', t: '2027-01-31T00:00:00Z' }],
    ['a frame that is not JSON', 'garbage'],
  ])('counts %s as a sign of life', (_name, message) => {
    const { client, socket } = connected();

    vi.advanceTimersByTime(20_000);
    socket.receive(message);

    vi.advanceTimersByTime(20_000);
    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(socket.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });

  it('still reconnects after 2s when the socket closes by itself', () => {
    const { client, socket } = connected();

    socket.drop();
    expect(client.status).toBe('closed');
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });
});

describe('RoomClient wake-up reconnect', () => {
  it('reconnects at once on visibilitychange to visible when the socket is dead', () => {
    const { client, socket: dead } = connected();
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + 60_000);
    setVisibility('visible');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(dead.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().open();
    expect(latest().sent).toEqual(['hello']);
    client.close();
  });

  it('does nothing on visibilitychange when the socket is healthy', () => {
    const { client, socket } = connected();
    vi.advanceTimersByTime(10_000);
    socket.receive({ type: 'pong' });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    client.close();
  });

  it('ignores visibilitychange to hidden even with a dead socket', () => {
    const { client, socket } = connected();
    vi.setSystemTime(Date.now() + 60_000);
    setVisibility('hidden');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    client.close();
  });

  it('reconnects on online when the socket is dead', () => {
    const { client, socket: dead } = connected();
    vi.setSystemTime(Date.now() + 60_000);

    window.dispatchEvent(new Event('online'));

    expect(dead.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });

  it('reconnects on online when the socket never reached OPEN', () => {
    const client = create();
    const stuck = latest();

    window.dispatchEvent(new Event('online'));

    expect(stuck.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });

  it('cancels the pending 2s retry so it does not open a second socket', () => {
    const { client, socket } = connected();
    socket.drop();
    expect(FakeSocket.instances).toHaveLength(1);

    window.dispatchEvent(new Event('online'));
    expect(FakeSocket.instances).toHaveLength(2);

    vi.advanceTimersByTime(5_000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
  });
});

describe('RoomClient.close', () => {
  it('removes its window and document listeners and never reconnects', () => {
    const addWindow = vi.spyOn(window, 'addEventListener');
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const { client, socket } = connected();
    const onOnline = addWindow.mock.calls.find(([type]) => type === 'online')?.[1];
    const onVisibility = addDocument.mock.calls.find(([type]) => type === 'visibilitychange')?.[1];
    expect(onOnline).toBeTypeOf('function');
    expect(onVisibility).toBeTypeOf('function');

    client.close();

    expect(removeWindow).toHaveBeenCalledWith('online', onOnline);
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', onVisibility);
    expect(socket.closed).toBe(true);

    vi.setSystemTime(Date.now() + 60_000);
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('works where there is no window or document', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://localhost:8787/ws');
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    const client = create();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(() => client.close()).not.toThrow();
  });
});

describe('RoomClient snapshot', () => {
  const T0 = '2027-01-10T00:00:00Z';
  const T1 = '2027-02-02T12:00:00Z';
  const MARKER = { type: 'marker_add', id: 'm1', site_id: 'malapert-a', x_m: 12, y_m: -3, kind: 'rock' } as const;

  function joined() {
    const { client, socket } = connected();
    socket.receive({ ...STATE_MSG, t: T0 });
    return { client, socket };
  }

  function replay(client: RoomClient) {
    const seen = vi.fn();
    client.setListener(seen);
    return seen.mock.calls[0]?.[0];
  }

  it('replays the time we sent, not the one the room was created with', () => {
    const { client } = joined();

    client.send({ type: 'set_time', t: T1, playing: true });

    expect(replay(client)).toMatchObject({ type: 'state', t: T1, playing: true, site_id: 'malapert-a', speed: 1 });
  });

  it.each([
    ['site', { type: 'set_site', site_id: 'mons-mouton' }, { site_id: 'mons-mouton' }],
    ['time', { type: 'set_time', t: T1, playing: true, speed: 4 }, { t: T1, playing: true, speed: 4 }],
    ['marker', MARKER, { markers: [expect.objectContaining({ id: 'm1', kind: 'rock' })] }],
  ])('replays a relayed %s change', (_name, message, expected) => {
    const { client, socket } = joined();

    socket.receive(message);

    expect(replay(client)).toMatchObject(expected);
  });

  it('replays markers added and removed, ours and relayed', () => {
    const { client, socket } = joined();

    client.send(MARKER);
    socket.receive({ ...MARKER, id: 'm2' });
    expect(replay(client).markers.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2']);

    client.send({ type: 'marker_remove', id: 'm1' });
    socket.receive({ type: 'marker_remove', id: 'm2' });
    expect(replay(client).markers).toEqual([]);
  });

  it.each([
    ['cam_update', { type: 'cam_update', site_id: 'malapert-a', px: 1, py: 2, pz: 3, qx: 0, qy: 0, qz: 0, qw: 1 }],
    ['ping', { type: 'ping' }],
    ['hello', { type: 'hello' }],
  ])('leaves the snapshot alone for %s', (_name, message) => {
    const { client, socket } = joined();
    const before = replay(client);

    socket.receive(message);
    client.send(message as Parameters<RoomClient['send']>[0]);

    expect(replay(client)).toEqual(before);
  });

  it('does not push anything extra to the current listener when the snapshot moves', () => {
    const { client, socket } = joined();
    const listener = vi.fn();
    client.setListener(listener);
    listener.mockClear();

    client.send({ type: 'set_time', t: T1 });
    expect(listener).not.toHaveBeenCalled();

    const relayed = { type: 'set_site', site_id: 'mons-mouton' };
    socket.receive(relayed);
    expect(listener).toHaveBeenCalledExactlyOnceWith(relayed);
  });

  it('has no snapshot to move before the room has answered hello', () => {
    const { client, socket } = connected();

    client.send({ type: 'set_time', t: T1 });
    socket.receive({ type: 'set_site', site_id: 'mons-mouton' });

    expect(replay(client)).toBeUndefined();
  });

  it('keeps our own change in the snapshot even while the socket is down', () => {
    const { client, socket } = joined();
    socket.drop();

    client.send({ type: 'set_time', t: T1 });

    expect(socket.sent).not.toContain('set_time');
    expect(replay(client)).toMatchObject({ t: T1 });
  });

  it('forgets the snapshot of the old room when it moves to another one', () => {
    const { client } = joined();
    client.setRoom('WXYZ');

    expect(replay(client)).toBeUndefined();
  });
});

describe('RoomClient.setWatcher', () => {
  function watched() {
    const { client, socket } = connected();
    socket.receive({ ...STATE_MSG, speed: 3 });
    const phase = vi.fn();
    const watcher = vi.fn();
    client.setListener(phase);
    client.setWatcher(watcher);
    return { client, socket, phase, watcher };
  }

  it('replays the snapshot when it registers, like the phase listener does', () => {
    const { client, watcher } = watched();
    expect(watcher).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'state', speed: 3 }));
    expect(client.snapshot).toMatchObject({ speed: 3 });
  });

  it('sees every event the phase listener sees, even with no phase listening, but not pongs', () => {
    const { client, socket, phase, watcher } = watched();
    phase.mockClear(); watcher.mockClear();
    const set = { type: 'set_time', t: '2027-01-31T00:00:00Z', speed: 4 };

    socket.receive(set);
    socket.receive({ type: 'pong' });
    expect(phase).toHaveBeenCalledExactlyOnceWith(set);
    expect(watcher).toHaveBeenCalledExactlyOnceWith(set);

    client.setListener(null);
    socket.receive({ type: 'set_site', site_id: 'mons-mouton' });
    expect(watcher).toHaveBeenLastCalledWith({ type: 'set_site', site_id: 'mons-mouton' });
  });

  it('sees the snapshot already up to date when the event arrives', () => {
    const { client, socket } = watched();
    let seen: unknown;
    client.setWatcher(() => { seen = client.snapshot; });
    socket.receive({ type: 'set_time', t: '2027-01-31T00:00:00Z', speed: 5 });
    expect(seen).toMatchObject({ t: '2027-01-31T00:00:00Z', speed: 5 });
  });

  it('survives setRoom and can be removed', () => {
    const { client, watcher } = watched();
    client.setRoom('WXYZ');
    const next = latest();
    next.open();
    watcher.mockClear();

    next.receive({ ...STATE_MSG, speed: 2 });
    expect(watcher).toHaveBeenCalledTimes(1);

    client.setWatcher(null);
    next.receive({ type: 'set_site', site_id: 'x' });
    expect(watcher).toHaveBeenCalledTimes(1);
  });
});
