import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSavedRoom, resolveInitialRoom, saveRoom } from './room-session';

const saved = (room: string, isHost: boolean) => JSON.stringify({ room, isHost });
const resolve = (query: string, stored: string | null, generate = () => 'NEWC') =>
  resolveInitialRoom(new URLSearchParams(query), stored, generate);

afterEach(() => { vi.unstubAllGlobals(); });

describe('resolveInitialRoom', () => {
  it('keeps the host role when the URL carries the room this tab already hosts (reload or return)', () => {
    expect(resolve('room=ABCD', saved('ABCD', true))).toEqual({ room: 'ABCD', isHost: true });
  });

  it('makes a monitor of someone who is handed a code that is not the one saved', () => {
    expect(resolve('room=ZZZZ', saved('ABCD', true))).toEqual({ room: 'ZZZZ', isHost: false });
    expect(resolve('room=ZZZZ', null)).toEqual({ room: 'ZZZZ', isHost: false });
  });

  it('stays a monitor when the saved role for that room was already monitor', () => {
    expect(resolve('room=ABCD', saved('ABCD', false))).toEqual({ room: 'ABCD', isHost: false });
  });

  it('restores the saved room and role when the URL has no room (coming back from Mission Control)', () => {
    expect(resolve('landing=2027-01-31T00:00:00Z&site=malapert-a', saved('ABCD', true))).toEqual({ room: 'ABCD', isHost: true });
    expect(resolve('', saved('ABCD', false))).toEqual({ room: 'ABCD', isHost: false });
  });

  it('generates a new code as host when there is no room in the URL and nothing saved', () => {
    const generate = vi.fn(() => 'NEWC');
    expect(resolve('', null, generate)).toEqual({ room: 'NEWC', isHost: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not call the generator when the URL or the storage already decide the room', () => {
    const generate = vi.fn(() => 'NEWC');
    resolve('room=ABCD', null, generate);
    resolve('', saved('ABCD', true), generate);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', 'room='],
    ['with a space', 'room=AB%20CD'],
    ['with a dot', 'room=AB.CD'],
    ['with markup', 'room=%3Cb%3E'],
    ['too long', `room=${'A'.repeat(65)}`],
  ])('treats an invalid room in the URL (%s) as absent', (_name, query) => {
    expect(resolve(query, saved('ABCD', true))).toEqual({ room: 'ABCD', isHost: true });
    expect(resolve(query, null)).toEqual({ room: 'NEWC', isHost: true });
  });

  it('accepts the longest valid code and the allowed punctuation', () => {
    expect(resolve(`room=${'a'.repeat(64)}`, null)).toEqual({ room: 'a'.repeat(64), isHost: false });
    expect(resolve('room=ab_C-9', null)).toEqual({ room: 'ab_C-9', isHost: false });
  });

  describe('with a tampered or broken saved value', () => {
    const tampered: Array<[string, string]> = [
      ['broken JSON', '{"room":"ABCD","isHost":tr'],
      ['not JSON', 'ABCD'],
      ['empty string', ''],
      ['JSON null', 'null'],
      ['a JSON string', '"ABCD"'],
      ['a JSON number', '42'],
      ['a JSON array', '[{"room":"ABCD","isHost":true}]'],
      ['an invalid room', saved('AB CD', true)],
      ['an empty room', saved('', true)],
      ['a room that is too long', saved('A'.repeat(65), true)],
      ['a room that is not a string', JSON.stringify({ room: 1234, isHost: true })],
      ['a missing room', JSON.stringify({ isHost: true })],
      ['a role that is not a boolean', JSON.stringify({ room: 'ABCD', isHost: 'true' })],
      ['a missing role', JSON.stringify({ room: 'ABCD' })],
      ['the data under __proto__', '{"__proto__":{"room":"ABCD","isHost":true}}'],
      ['the data under constructor', '{"constructor":{"room":"ABCD","isHost":true}}'],
    ];

    it.each(tampered)('ignores %s', (_name, raw) => {
      expect(resolve('', raw)).toEqual({ room: 'NEWC', isHost: true });
      expect(resolve('room=ZZZZ', raw)).toEqual({ room: 'ZZZZ', isHost: false });
    });

    it('does not pollute Object.prototype', () => {
      resolve('', '{"__proto__":{"room":"ABCD","isHost":true}}');
      expect(({} as Record<string, unknown>).room).toBeUndefined();
      expect(({} as Record<string, unknown>).isHost).toBeUndefined();
    });

    it('ignores extra keys next to valid ones and returns only room and isHost', () => {
      const raw = '{"room":"ABCD","isHost":true,"extra":1,"__proto__":{"room":"HACK"}}';
      const result = resolve('', raw);
      expect(result).toEqual({ room: 'ABCD', isHost: true });
      expect(Object.keys(result)).toEqual(['room', 'isHost']);
    });
  });
});

describe('the sessionStorage wrappers', () => {
  const fakeStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: vi.fn((k: string) => data.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => { data.set(k, v); }),
    };
  };

  it('round-trips the room and the role through sessionStorage', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    expect(readSavedRoom()).toBeNull();
    saveRoom({ room: 'ABCD', isHost: true });
    expect(resolve('', readSavedRoom())).toEqual({ room: 'ABCD', isHost: true });
    saveRoom({ room: 'WXYZ', isHost: false });
    expect(resolve('', readSavedRoom())).toEqual({ room: 'WXYZ', isHost: false });
  });

  it('survives a sessionStorage that throws on access, on read and on write', () => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.stubGlobal('sessionStorage', undefined);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: boom });
    expect(readSavedRoom()).toBeNull();
    expect(() => saveRoom({ room: 'ABCD', isHost: true })).not.toThrow();

    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: boom, setItem: boom } });
    expect(readSavedRoom()).toBeNull();
    expect(() => saveRoom({ room: 'ABCD', isHost: true })).not.toThrow();
  });

  it('survives a missing sessionStorage', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(readSavedRoom()).toBeNull();
    expect(() => saveRoom({ room: 'ABCD', isHost: true })).not.toThrow();
  });
});
