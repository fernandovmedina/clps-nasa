import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHASE_ORDER } from '../engine/hud';
import type { PhaseName } from '../engine/app';
import { beaconPhase, nextFollow, phaseBeacon, PhaseFollow, type FollowHost } from './phase-follow';
import { RoomClient } from './room-client';

describe('phaseBeacon and beaconPhase', () => {
  it('number the phases 1 to 5 in PHASE_ORDER and convert back', () => {
    expect(PHASE_ORDER.map(phaseBeacon)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map(beaconPhase)).toEqual(PHASE_ORDER);
  });

  it.each([0, 6, -1, 1.5, NaN, Infinity, '2', null, undefined, {}])('reads %s as no phase', (value) => {
    expect(beaconPhase(value)).toBeNull();
  });
});

describe('nextFollow', () => {
  const base = { isHost: false, current: 'launch', target: 'orbit', hasData: true, hasSite: true } as const;
  const follow = (over: Partial<Parameters<typeof nextFollow>[0]>) => nextFollow({ ...base, ...over });

  it('never makes the crew follow', () => {
    for (const target of PHASE_ORDER) for (const current of PHASE_ORDER) {
      expect(follow({ isHost: true, current, target })).toBeNull();
    }
  });

  it('goes forward to orbit with data, with or without a site', () => {
    expect(follow({ target: 'orbit', hasSite: false })).toBe('goto');
    expect(follow({ target: 'orbit', hasData: false })).toBeNull();
  });

  it.each(['pov', 'landing', 'transmit'] as const)('goes forward to %s only with data and a site', (target) => {
    expect(follow({ target })).toBe('goto');
    expect(follow({ target, hasSite: false })).toBeNull();
    expect(follow({ target, hasData: false })).toBeNull();
    expect(follow({ target, hasData: false, hasSite: false })).toBeNull();
  });

  it('can skip phases forward', () => {
    expect(follow({ current: 'orbit', target: 'transmit' })).toBe('goto');
    expect(follow({ current: 'pov', target: 'landing' })).toBe('goto');
  });

  it('restarts only when the crew is back at the launch and this client is not', () => {
    for (const current of PHASE_ORDER.slice(1)) {
      expect(follow({ current, target: 'launch', hasData: false, hasSite: false })).toBe('restart');
    }
    expect(follow({ current: 'launch', target: 'launch' })).toBeNull();
  });

  it('does nothing for the same phase or a step back that is not the launch', () => {
    for (const phase of PHASE_ORDER.slice(1)) expect(follow({ current: phase, target: phase })).toBeNull();
    expect(follow({ current: 'landing', target: 'pov' })).toBeNull();
    expect(follow({ current: 'transmit', target: 'orbit' })).toBeNull();
  });
});

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const STATE = { type: 'state', site_id: 'malapert-a', t: '2027-01-10T00:00:00.000Z', playing: true, speed: 1, markers: [] };
const LANDING = new Date('2027-01-10T00:00:00Z');

/** The slice of the app the follower uses, with the app's rules for goTo: a call starts a transition. */
class FakeApp implements FollowHost {
  host = false;
  current: PhaseName | null = 'launch';
  loaded = false;
  inFlight = false;
  ranking: string[] = [];
  selected: string | null = null;
  calls: string[] = [];
  isHost() { return this.host; }
  phase() { return this.current; }
  busy() { return this.inFlight; }
  hasData() { return this.loaded; }
  hasSite(id: string) { return this.selected === id || this.ranking.includes(id); }
  selectSite(id: string) { this.selected = id; this.calls.push(`select ${id}`); }
  goTo(name: PhaseName) { this.inFlight = true; this.calls.push(`goTo ${name}`); }
  restart() { this.current = 'launch'; this.loaded = false; this.calls.push('restart'); }
  arrive(name: PhaseName) { this.current = name; this.inFlight = false; }
}

let app: FakeApp;
let room: RoomClient | undefined;
let socket: FakeSocket;

function join(initial?: unknown): RoomClient {
  const client = new RoomClient('ABCD');
  room = client;
  socket = FakeSocket.instances[0]!;
  socket.open();
  if (initial) socket.receive(initial);
  return client;
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
  FakeSocket.instances = [];
  app = new FakeApp();
});
afterEach(() => {
  room?.close();
  vi.unstubAllGlobals();
});

describe('PhaseFollow: the crew', () => {
  it('announces the phase it entered with the landing it uses, and no playing flag', () => {
    const room = join(STATE);
    app.host = true;
    const follow = new PhaseFollow(app, room);

    follow.announce('landing', LANDING);

    expect(socket.sent.at(-1)).toEqual({ type: 'set_time', t: '2027-01-10T00:00:00.000Z', speed: 4 });
    expect(room.snapshot).toMatchObject({ speed: 4, playing: true });
  });

  it('says nothing from a monitor', () => {
    const room = join(STATE);
    new PhaseFollow(app, room).announce('orbit', LANDING);
    expect(socket.sent.map((m) => m.type)).toEqual(['hello']);
  });

  it('ignores the beacons it hears', () => {
    const room = join(STATE);
    app.host = true;
    app.loaded = true;
    new PhaseFollow(app, room);
    socket.receive({ type: 'set_time', t: STATE.t, speed: 3 });
    expect(app.calls).toEqual([]);
  });
});

describe('PhaseFollow: the monitor', () => {
  it('goes to orbit when the crew gets there and the data is loaded', () => {
    const room = join(STATE);
    app.loaded = true;
    new PhaseFollow(app, room);

    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });

    expect(app.calls).toEqual(['goTo orbit']);
  });

  it('waits for the data, then goes when the app asks again', () => {
    const room = join(STATE);
    const follow = new PhaseFollow(app, room);
    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });
    expect(app.calls).toEqual([]);

    app.loaded = true;
    follow.tryFollow();

    expect(app.calls).toEqual(['goTo orbit']);
  });

  it('does not go to the site view without the site, and does when the site arrives', () => {
    const room = join({ ...STATE, speed: 2 });
    app.loaded = true;
    app.current = 'orbit';
    new PhaseFollow(app, room);

    socket.receive({ type: 'set_time', t: STATE.t, speed: 3 });
    expect(app.calls).toEqual([]);

    socket.receive({ type: 'set_site', site_id: 'mons-mouton' });
    expect(app.calls).toEqual([]);

    app.ranking = ['malapert-a', 'mons-mouton'];
    socket.receive({ type: 'set_site', site_id: 'mons-mouton' });
    expect(app.calls).toEqual(['select mons-mouton', 'goTo pov']);
  });

  it('keeps its own selection when it already matches the room, and never selects for orbit', () => {
    const room = join({ ...STATE, speed: 2 });
    app.loaded = true;
    app.current = 'orbit';
    app.selected = 'malapert-a';
    new PhaseFollow(app, room);
    socket.receive({ type: 'set_time', t: STATE.t, speed: 4 });
    expect(app.calls).toEqual(['select malapert-a', 'goTo landing']);

    const other = new FakeApp();
    other.loaded = true;
    new PhaseFollow(other, room);
    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });
    expect(other.calls).toEqual(['goTo orbit']);
  });

  it('restarts when the crew goes back to the launch', () => {
    const room = join({ ...STATE, speed: 4 });
    app.current = 'landing';
    app.loaded = true;
    app.ranking = ['malapert-a'];
    new PhaseFollow(app, room);
    app.calls = [];

    socket.receive({ type: 'set_time', t: STATE.t, speed: 1 });

    expect(app.calls).toEqual(['restart']);
    expect(app.current).toBe('launch');
  });

  it('does not start a second transition while one is in flight, and goes on once it lands', () => {
    const room = join(STATE);
    app.loaded = true;
    const follow = new PhaseFollow(app, room);

    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });
    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });
    follow.tryFollow();
    expect(app.calls).toEqual(['goTo orbit']);

    app.arrive('orbit');
    follow.tryFollow();
    expect(app.calls).toEqual(['goTo orbit']);
  });

  it('follows the snapshot it replays on registering, as a monitor joining late', () => {
    const room = join({ ...STATE, speed: 2 });
    app.loaded = true;

    new PhaseFollow(app, room);

    expect(app.calls).toEqual(['goTo orbit']);
  });

  it('ignores a speed that is not a phase and keeps the last target', () => {
    const room = join(STATE);
    app.loaded = true;
    const follow = new PhaseFollow(app, room);
    socket.receive({ type: 'set_time', t: STATE.t, speed: 2.5 });
    socket.receive({ type: 'set_time', t: STATE.t, speed: 0 });
    socket.receive({ type: 'set_time', t: STATE.t });
    expect(app.calls).toEqual([]);

    follow.dispose();
    socket.receive({ type: 'set_time', t: STATE.t, speed: 2 });
    expect(app.calls).toEqual([]);
  });

  it('follows through a change of room', () => {
    const room = join(STATE);
    app.loaded = true;
    new PhaseFollow(app, room);
    room.setRoom('WXYZ');
    const next = FakeSocket.instances[1]!;
    next.open();

    next.receive({ ...STATE, speed: 2 });

    expect(app.calls).toEqual(['goTo orbit']);
  });
});
