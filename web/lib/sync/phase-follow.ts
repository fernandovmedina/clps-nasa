import type { ClientMessage, RoomState } from '@touchdown/core';
import { PHASE_ORDER } from '../engine/hud';
import type { PhaseName } from '../engine/app';
import type { RoomEvent } from './room-client';

// Provisional: the room's `speed` (unused by the web) carries the crew's phase, 1..5 in PHASE_ORDER.
export function phaseBeacon(name: PhaseName): number {
  return PHASE_ORDER.indexOf(name) + 1;
}

/** Null unless the value is an integer from 1 to the number of phases. */
export function beaconPhase(speed: unknown): PhaseName | null {
  if (typeof speed !== 'number' || !Number.isInteger(speed)) return null;
  return PHASE_ORDER[speed - 1] ?? null;
}

export interface FollowInput {
  isHost: boolean;
  current: PhaseName;
  target: PhaseName;
  hasData: boolean;
  hasSite: boolean;
}

export type FollowAction = 'goto' | 'restart' | null;

/** What a monitor should do to catch up with the crew's phase. The crew itself never follows. */
export function nextFollow({ isHost, current, target, hasData, hasSite }: FollowInput): FollowAction {
  if (isHost) return null;
  const from = PHASE_ORDER.indexOf(current);
  const to = PHASE_ORDER.indexOf(target);
  if (to > from) {
    if (!hasData) return null;
    return target === 'orbit' || hasSite ? 'goto' : null;
  }
  return target === 'launch' && current !== 'launch' ? 'restart' : null;
}

/** What the follower needs from the app: narrow on purpose, so it can be tested alone. */
export interface FollowHost {
  isHost(): boolean;
  phase(): PhaseName | null;
  /** A phase change is in flight. */
  busy(): boolean;
  hasData(): boolean;
  /** True when the room's site is one this client can show (already selected, or in its ranking). */
  hasSite(siteId: string): boolean;
  selectSite(siteId: string): void;
  goTo(name: PhaseName): void;
  restart(): void;
}

export interface FollowRoom {
  readonly snapshot: RoomState | null;
  setWatcher(fn: ((msg: RoomEvent) => void) | null): void;
  send(msg: ClientMessage): void;
}

/**
 * The crew announces each phase it enters; a monitor follows. Whatever is missing to follow (data, the
 * site) is retried by tryFollow(), which the app calls again whenever something changes.
 */
export class PhaseFollow {
  private target: PhaseName | null = null;
  /** The crew went back to the launch after being further on: only then is a restart warranted, never a stale snapshot. */
  private restartDue = false;

  constructor(private host: FollowHost, private room: FollowRoom) {
    room.setWatcher((msg) => this.onEvent(msg));
  }

  /** Crew: says which phase it entered, with the landing it uses (the room already has that time). */
  announce(name: PhaseName, landing: Date) {
    if (!this.host.isHost()) return;
    this.room.send({ type: 'set_time', t: landing.toISOString(), speed: phaseBeacon(name) });
  }

  tryFollow() {
    const current = this.host.phase();
    if (!this.target || !current || this.host.busy()) return;
    const siteId = this.room.snapshot?.site_id;
    const needsSite = this.target !== 'orbit';
    const action = nextFollow({
      isHost: this.host.isHost(),
      current,
      target: this.target,
      hasData: this.host.hasData(),
      hasSite: !needsSite || (siteId !== undefined && this.host.hasSite(siteId)),
    });
    if (action === 'restart') {
      if (!this.restartDue) return;
      this.restartDue = false;
      this.host.restart();
    } else if (action === 'goto') {
      if (needsSite && siteId !== undefined) this.host.selectSite(siteId);
      this.host.goTo(this.target);
    }
  }

  dispose() {
    this.room.setWatcher(null);
  }

  private onEvent(msg: RoomEvent) {
    if (msg.type !== 'state' && msg.type !== 'set_time' && msg.type !== 'set_site') return;
    if (msg.type !== 'set_site') {
      const next = beaconPhase(msg.speed);
      if (next) {
        this.restartDue = msg.type === 'set_time' && next === 'launch' && this.target !== null && this.target !== 'launch';
        this.target = next;
      }
    }
    this.tryFollow();
  }
}
