import type { ClientMessage } from '@touchdown/core';
import type { RoomEvent } from '../sync/room-client';

/** What the launch needs from the app to take part in a room: narrow on purpose, so it can be tested alone. */
export interface LaunchSyncHost {
  /** Read on every message: joining a room at runtime turns a crew client into a monitor. */
  readonly isHost: boolean;
  landing(): Date;
  /** Adopts the landing the room carries; the app ignores a date outside its ephemeris. */
  applyLanding(date: Date): void;
  send(msg: ClientMessage): void;
  applyMarkerEvent(msg: RoomEvent): void;
}

/**
 * The launch start, shared through the room: the crew's "Comenzar despegue" tells
 * the room, and a monitor in the same room starts the same countdown when it hears it.
 */
export class LaunchSync {
  private begun = false;

  constructor(private host: LaunchSyncHost, private onBegin: () => void) {}

  get started() { return this.begun; }

  /** False, changing nothing, once the countdown is already running. */
  start(by: 'crew' | 'room'): boolean {
    if (this.begun) return false;
    this.begun = true;
    if (by === 'crew' && this.host.isHost) {
      this.host.send({ type: 'set_time', t: this.host.landing().toISOString(), playing: true });
    }
    this.onBegin();
    return true;
  }

  handle(msg: RoomEvent): void {
    this.host.applyMarkerEvent(msg);
    if (this.begun) return;
    if (msg.type !== 'state' && msg.type !== 'set_time') return;

    if (this.host.isHost) {
      // The snapshot answers our own hello: tell the room the crew's plan, and that nobody has launched yet.
      if (msg.type === 'state') this.host.send({ type: 'set_time', t: this.host.landing().toISOString(), playing: false });
      return;
    }

    const ms = Date.parse(msg.t);
    if (Number.isFinite(ms)) this.host.applyLanding(new Date(ms));
    if (msg.playing === true) this.start('room');
  }
}
