import { describe, expect, it } from 'vitest'
import {
  MAX_MARKERS,
  initialRoomState,
  isValidRoomName,
  parseClientMessage,
  reduceRoom,
  type ClientMessage,
  type Marker,
  type RoomState,
} from '../src/index'

const NOW = '2027-01-10T00:00:00Z'

function parse(value: unknown) {
  return parseClientMessage(JSON.stringify(value))
}

function add(id: string, extra: Partial<Marker> = {}): ClientMessage {
  return { type: 'marker_add', id, site_id: 'malapert-a', x_m: 1, y_m: 2, kind: 'rock', ...extra }
}

describe('initialRoomState', () => {
  it('starts paused on Malapert A with no markers', () => {
    expect(initialRoomState(NOW)).toEqual({
      type: 'state',
      site_id: 'malapert-a',
      t: NOW,
      playing: false,
      speed: 1,
      markers: [],
    })
  })
})

describe('isValidRoomName', () => {
  it('accepts letters, digits, underscore and hyphen up to 64 characters', () => {
    expect(isValidRoomName('demo-01_A')).toBe(true)
    expect(isValidRoomName('a'.repeat(64))).toBe(true)
  })

  it('rejects empty, long and other characters', () => {
    expect(isValidRoomName('')).toBe(false)
    expect(isValidRoomName('a'.repeat(65))).toBe(false)
    expect(isValidRoomName('sala uno')).toBe(false)
    expect(isValidRoomName('sala/uno')).toBe(false)
    expect(isValidRoomName('sala\n')).toBe(false)
  })
})

describe('parseClientMessage', () => {
  it('parses every message type', () => {
    expect(parse({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parse({ type: 'ping' })).toEqual({ type: 'ping' })
    expect(parse({ type: 'set_site', site_id: 'apollo-11' })).toEqual({
      type: 'set_site',
      site_id: 'apollo-11',
    })
    expect(parse({ type: 'set_time', t: NOW })).toEqual({ type: 'set_time', t: NOW })
    expect(parse({ type: 'set_time', t: NOW, playing: true, speed: 60 })).toEqual({
      type: 'set_time',
      t: NOW,
      playing: true,
      speed: 60,
    })
    expect(parse(add('m1', { note: 'big rock' }))).toEqual(add('m1', { note: 'big rock' }))
    expect(parse({ type: 'marker_remove', id: 'm1' })).toEqual({ type: 'marker_remove', id: 'm1' })
  })

  it('drops unknown fields', () => {
    expect(parse({ type: 'hello', extra: 1 })).toEqual({ type: 'hello' })
  })

  it('accepts boundary values', () => {
    expect(parse(add('m'.repeat(64), { x_m: 100000, y_m: -100000, note: 'n'.repeat(280) }))).not.toBeNull()
    expect(parse({ type: 'set_time', t: NOW, speed: -1e6 })).not.toBeNull()
    expect(parse({ type: 'set_time', t: '2027-01-10' })).not.toBeNull()
    expect(parse({ type: 'set_time', t: '2028-02-29T00:00:00Z' })).not.toBeNull()
    expect(parse({ type: 'set_time', t: '2000-02-29T23:59:59Z' })).not.toBeNull()
    expect(parse({ type: 'set_time', t: '2027-01-10T01:02:03.456+02:00' })).not.toBeNull()
  })

  it('returns null for broken JSON and non-objects', () => {
    expect(parseClientMessage('{nope')).toBeNull()
    expect(parseClientMessage('')).toBeNull()
    expect(parseClientMessage('null')).toBeNull()
    expect(parseClientMessage('42')).toBeNull()
    expect(parseClientMessage('"hello"')).toBeNull()
    expect(parseClientMessage('[{"type":"hello"}]')).toBeNull()
  })

  it('returns null for unknown or missing type', () => {
    expect(parse({ type: 'explode' })).toBeNull()
    expect(parse({})).toBeNull()
    expect(parse({ type: 1 })).toBeNull()
    expect(parse({ type: 'state' })).toBeNull()
  })

  it('returns null when a marker field is invalid', () => {
    expect(parse(add('m1', { kind: 'boulder' as never }))).toBeNull()
    expect(parse(add('m1', { x_m: 100001 }))).toBeNull()
    expect(parse(add('m1', { y_m: -100001 }))).toBeNull()
    expect(parse(add('m1', { note: 'n'.repeat(281) }))).toBeNull()
    expect(parse(add(''))).toBeNull()
    expect(parse(add('m'.repeat(65)))).toBeNull()
    expect(parse(add('m1', { site_id: '' }))).toBeNull()
    expect(parse({ ...add('m1'), note: 5 })).toBeNull()
    expect(parse({ ...add('m1'), x_m: '1' })).toBeNull()
    expect(parse({ ...add('m1'), id: 7 })).toBeNull()
  })

  it('returns null for a non finite number, which JSON can only carry as null or text', () => {
    expect(parseClientMessage('{"type":"marker_add","id":"a","site_id":"s","x_m":null,"y_m":0,"kind":"rock"}')).toBeNull()
    expect(parseClientMessage('{"type":"marker_add","id":"a","site_id":"s","x_m":1e999,"y_m":0,"kind":"rock"}')).toBeNull()
    expect(parseClientMessage('{"type":"set_time","t":"2027-01-10T00:00:00Z","speed":1e999}')).toBeNull()
  })

  it('returns null when a set_time field is invalid', () => {
    expect(parse({ type: 'set_time', t: 'yesterday' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-02-31T00:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-02-29T00:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2100-02-29T00:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-04-31T00:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-13-01T00:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-01-10T24:00:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-01-10T00:60:00Z' })).toBeNull()
    expect(parse({ type: 'set_time', t: '2027-01-10T00:00:00' })).toBeNull()
    expect(parse({ type: 'set_time', t: 1799539200000 })).toBeNull()
    expect(parse({ type: 'set_time' })).toBeNull()
    expect(parse({ type: 'set_time', t: NOW, playing: 'yes' })).toBeNull()
    expect(parse({ type: 'set_time', t: NOW, speed: '2' })).toBeNull()
    expect(parse({ type: 'set_time', t: NOW, speed: 1_000_001 })).toBeNull()
  })

  it('returns null when set_site or marker_remove lack a valid id', () => {
    expect(parse({ type: 'set_site' })).toBeNull()
    expect(parse({ type: 'set_site', site_id: '' })).toBeNull()
    expect(parse({ type: 'set_site', site_id: 'x'.repeat(65) })).toBeNull()
    expect(parse({ type: 'marker_remove' })).toBeNull()
    expect(parse({ type: 'marker_remove', id: '' })).toBeNull()
  })
})

describe('reduceRoom', () => {
  const base = initialRoomState(NOW)

  function frozen(state: RoomState): RoomState {
    return Object.freeze({
      ...state,
      markers: Object.freeze(state.markers.map((m) => Object.freeze({ ...m }))) as Marker[],
    })
  }

  it('returns the same state for hello and ping', () => {
    expect(reduceRoom(base, { type: 'hello' })).toBe(base)
    expect(reduceRoom(base, { type: 'ping' })).toBe(base)
  })

  it('changes the site', () => {
    const next = reduceRoom(base, { type: 'set_site', site_id: 'apollo-11' })
    expect(next).toEqual({ ...base, site_id: 'apollo-11' })
  })

  it('changes the time and only the optional fields that come', () => {
    const t = '2027-02-01T12:00:00Z'
    expect(reduceRoom(base, { type: 'set_time', t })).toEqual({ ...base, t })
    expect(reduceRoom(base, { type: 'set_time', t, playing: true })).toEqual({ ...base, t, playing: true })
    expect(reduceRoom(base, { type: 'set_time', t, speed: 120 })).toEqual({ ...base, t, speed: 120 })
    const playing = reduceRoom(base, { type: 'set_time', t, playing: true, speed: 60 })
    expect(reduceRoom(playing, { type: 'set_time', t: NOW })).toEqual({ ...playing, t: NOW })
  })

  it('adds a marker', () => {
    const next = reduceRoom(base, add('m1', { note: 'hi' }))
    expect(next.markers).toEqual([
      { id: 'm1', site_id: 'malapert-a', x_m: 1, y_m: 2, kind: 'rock', note: 'hi' },
    ])
    expect(next.type).toBe('state')
  })

  it('does not store the message type inside the marker', () => {
    const next = reduceRoom(base, add('m1'))
    expect(Object.keys(next.markers[0]!)).not.toContain('type')
  })

  it('replaces a marker with the same id in place', () => {
    let s = reduceRoom(base, add('a'))
    s = reduceRoom(s, add('b'))
    s = reduceRoom(s, add('a', { x_m: 99, kind: 'slope' }))
    expect(s.markers.map((m) => m.id)).toEqual(['a', 'b'])
    expect(s.markers[0]).toMatchObject({ id: 'a', x_m: 99, kind: 'slope' })
  })

  it('drops a stale note when a replacement has none', () => {
    let s = reduceRoom(base, add('a', { note: 'old' }))
    s = reduceRoom(s, add('a'))
    expect(s.markers[0]).not.toHaveProperty('note')
  })

  it('removes a marker', () => {
    let s = reduceRoom(base, add('a'))
    s = reduceRoom(s, add('b'))
    s = reduceRoom(s, { type: 'marker_remove', id: 'a' })
    expect(s.markers.map((m) => m.id)).toEqual(['b'])
  })

  it('ignores the removal of an unknown marker', () => {
    const s = reduceRoom(base, add('a'))
    expect(reduceRoom(s, { type: 'marker_remove', id: 'zzz' })).toEqual(s)
  })

  it('stops at the marker limit but still replaces existing ids', () => {
    expect(MAX_MARKERS).toBe(200)
    let s = base
    for (let i = 0; i < MAX_MARKERS; i++) s = reduceRoom(s, add(`m${i}`))
    expect(s.markers).toHaveLength(200)
    const over = reduceRoom(s, add('extra'))
    expect(over).toEqual(s)
    expect(over.markers).toHaveLength(200)
    const replaced = reduceRoom(s, add('m5', { x_m: 500 }))
    expect(replaced.markers).toHaveLength(200)
    expect(replaced.markers[5]!.x_m).toBe(500)
    const freed = reduceRoom(replaced, { type: 'marker_remove', id: 'm0' })
    expect(reduceRoom(freed, add('extra')).markers).toHaveLength(200)
  })

  it('returns marker arrays that do not alias the previous state', () => {
    const s = reduceRoom(base, add('a'))
    const site = reduceRoom(s, { type: 'set_site', site_id: 'x' })
    const time = reduceRoom(s, { type: 'set_time', t: NOW })
    site.markers.push({ id: 'z', site_id: 'x', x_m: 0, y_m: 0, kind: 'other' })
    time.markers.pop()
    expect(s.markers.map((m) => m.id)).toEqual(['a'])
    expect(site.markers).not.toBe(s.markers)
    expect(time.markers).not.toBe(s.markers)
  })

  it('stores only the known marker fields', () => {
    const msg = { ...add('a', { note: 'n' }), extra: 1, secret: 'x' } as unknown as ClientMessage
    const s = reduceRoom(base, msg)
    expect(s.markers[0]).toEqual({
      id: 'a',
      site_id: 'malapert-a',
      x_m: 1,
      y_m: 2,
      kind: 'rock',
      note: 'n',
    })
    expect(Object.keys(s.markers[0]!).sort()).toEqual(['id', 'kind', 'note', 'site_id', 'x_m', 'y_m'])
  })

  it('returns the same state for an unknown message type', () => {
    expect(reduceRoom(base, { type: 'explode' } as unknown as ClientMessage)).toBe(base)
  })

  it('never mutates its input', () => {
    const start = frozen(reduceRoom(reduceRoom(base, add('a')), add('b')))
    const before = JSON.stringify(start)
    const messages: ClientMessage[] = [
      { type: 'hello' },
      { type: 'ping' },
      { type: 'set_site', site_id: 'x' },
      { type: 'set_time', t: NOW, playing: true, speed: 5 },
      add('c'),
      add('a', { x_m: 7 }),
      { type: 'marker_remove', id: 'b' },
      { type: 'marker_remove', id: 'nope' },
    ]
    for (const m of messages) reduceRoom(start, m)
    expect(JSON.stringify(start)).toBe(before)
  })
})
