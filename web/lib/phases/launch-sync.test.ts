import { describe, expect, it, vi } from 'vitest';
import { initialRoomState, reduceRoom, type ClientMessage, type RoomState } from '@touchdown/core';
import type { RoomEvent } from '../sync/room-client';
import { LaunchSync, type LaunchSyncHost } from './launch-sync';

const LANDING = new Date('2027-01-10T00:00:00Z');

/** The room as the Durable Object runs it: relays to the others, answers hello with the snapshot. */
class FakeRoom {
  state: RoomState = initialRoomState('2026-11-15T14:00:00.000Z');
  clients: Client[] = [];

  join(client: Client) { this.clients.push(client); }

  receive(from: Client, msg: ClientMessage) {
    if (msg.type === 'hello') { from.deliver(this.state); return; }
    this.state = reduceRoom(this.state, msg);
    for (const peer of this.clients) if (peer !== from) peer.deliver(msg);
  }
}

class Client implements LaunchSyncHost {
  isHost: boolean;
  landingDate: Date;
  applied: Date[] = [];
  begun = vi.fn();
  sent: ClientMessage[] = [];
  sync: LaunchSync;

  constructor(private room: FakeRoom, isHost: boolean, landing = LANDING) {
    this.isHost = isHost;
    this.landingDate = landing;
    this.sync = new LaunchSync(this, this.begun);
    room.join(this);
  }

  landing() { return this.landingDate; }
  applyLanding(date: Date) { this.applied.push(date); this.landingDate = date; }
  send(msg: ClientMessage) { this.sent.push(msg); this.room.receive(this, msg); }
  applyMarkerEvent() {}
  deliver(msg: RoomEvent) { this.sync.handle(msg); }
  hello() { this.send({ type: 'hello' }); }
}

describe('LaunchSync: the crew', () => {
  it('tells the room it is playing, with its landing, when it begins', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    expect(crew.sync.start('crew')).toBe(true);
    expect(crew.sent).toEqual([{ type: 'set_time', t: '2027-01-10T00:00:00.000Z', playing: true }]);
    expect(room.state.playing).toBe(true);
    expect(room.state.t).toBe('2027-01-10T00:00:00.000Z');
    expect(crew.begun).toHaveBeenCalledTimes(1);
  });

  it('sends the landing it has at that moment, not the one it opened with', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    crew.landingDate = new Date('2027-02-01T06:00:00Z');
    crew.sync.start('crew');
    expect(crew.sent[0]).toMatchObject({ t: '2027-02-01T06:00:00.000Z', playing: true });
  });

  it('begins only once, however many times the buttons fire', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    crew.sync.start('crew');
    expect(crew.sync.start('crew')).toBe(false);
    expect(crew.sent).toHaveLength(1);
    expect(crew.begun).toHaveBeenCalledTimes(1);
  });

  it('announces its plan, not playing, when the snapshot answers its hello', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    crew.hello();
    expect(crew.sent[1]).toEqual({ type: 'set_time', t: '2027-01-10T00:00:00.000Z', playing: false });
    expect(room.state).toMatchObject({ t: '2027-01-10T00:00:00.000Z', playing: false });
  });

  it('resets a playing flag left by an earlier launch of the same room', () => {
    const room = new FakeRoom();
    room.state = { ...room.state, playing: true };
    new Client(room, true).hello();
    expect(room.state.playing).toBe(false);
  });

  it('ignores what other clients say about time and never begins from the room', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    crew.deliver({ type: 'set_time', t: '2027-03-01T00:00:00Z', playing: true });
    expect(crew.applied).toEqual([]);
    expect(crew.begun).not.toHaveBeenCalled();
    expect(crew.sync.started).toBe(false);
  });
});

describe('LaunchSync: the monitor', () => {
  it('starts the same countdown when the crew begins, with the crew landing', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true, new Date('2027-02-01T06:00:00Z'));
    const monitor = new Client(room, false);
    crew.sync.start('crew');
    expect(monitor.begun).toHaveBeenCalledTimes(1);
    expect(monitor.sync.started).toBe(true);
    expect(monitor.applied.map((d) => d.toISOString())).toEqual(['2027-02-01T06:00:00.000Z']);
    expect(monitor.sent).toEqual([]);
  });

  it('does not restart anything on a second message', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    const monitor = new Client(room, false);
    crew.sync.start('crew');
    monitor.deliver({ type: 'set_time', t: '2027-01-10T00:00:00.000Z', playing: true });
    monitor.deliver(room.state);
    expect(monitor.begun).toHaveBeenCalledTimes(1);
    expect(monitor.applied).toHaveLength(1);
    expect(monitor.sent).toEqual([]);
  });

  it('starts at once when it connects late and the room is already playing', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    crew.sync.start('crew');
    const late = new Client(room, false);
    late.hello();
    expect(late.begun).toHaveBeenCalledTimes(1);
    expect(late.applied.at(-1)?.toISOString()).toBe('2027-01-10T00:00:00.000Z');
    expect(late.sent).toEqual([{ type: 'hello' }]);
  });

  it('adopts the plan while waiting, without starting', () => {
    const room = new FakeRoom();
    const crew = new Client(room, true);
    const monitor = new Client(room, false);
    crew.send({ type: 'set_time', t: '2027-01-24T12:00:00.000Z' });
    expect(monitor.applied.map((d) => d.toISOString())).toEqual(['2027-01-24T12:00:00.000Z']);
    expect(monitor.begun).not.toHaveBeenCalled();
    crew.send({ type: 'set_time', t: '2027-01-25T12:00:00.000Z', playing: false });
    expect(monitor.begun).not.toHaveBeenCalled();
  });

  it('does not begin or adopt anything once its own countdown runs', () => {
    const room = new FakeRoom();
    const monitor = new Client(room, false);
    monitor.sync.start('room');
    monitor.deliver({ type: 'set_time', t: '2027-03-01T00:00:00Z', playing: true });
    expect(monitor.applied).toEqual([]);
    expect(monitor.begun).toHaveBeenCalledTimes(1);
  });

  it('does not echo to the room when it begins by itself', () => {
    const room = new FakeRoom();
    const monitor = new Client(room, false);
    monitor.sync.start('crew');
    expect(monitor.sent).toEqual([]);
    expect(monitor.begun).toHaveBeenCalledTimes(1);
  });

  it('ignores a date it cannot read but still starts', () => {
    const room = new FakeRoom();
    const monitor = new Client(room, false);
    monitor.deliver({ type: 'set_time', t: 'nope', playing: true });
    expect(monitor.applied).toEqual([]);
    expect(monitor.begun).toHaveBeenCalledTimes(1);
  });

  it('takes the host role into account at message time: joining a room turns the crew into a monitor', () => {
    const room = new FakeRoom();
    const client = new Client(room, true);
    client.isHost = false;
    client.deliver({ type: 'set_time', t: '2027-01-10T00:00:00Z', playing: true });
    expect(client.begun).toHaveBeenCalledTimes(1);
  });

  it('keeps the markers current whatever it does with the message', () => {
    const room = new FakeRoom();
    const monitor = new Client(room, false);
    const seen = vi.spyOn(monitor, 'applyMarkerEvent');
    monitor.sync.start('room');
    monitor.deliver({ type: 'marker_remove', id: 'm1' });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
