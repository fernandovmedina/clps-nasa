import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomClient } from './room-client';

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  send() {}
  close() { this.closed = true; }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
