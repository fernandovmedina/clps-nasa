import { env } from 'cloudflare:workers'
import { evictDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { call, connect, getJson, type ErrorBody } from './helpers'

const upgrade = { headers: { Upgrade: 'websocket' } }

describe('room websocket', () => {
  it('answers hello only to the sender', async () => {
    const a = await connect('r1')
    const b = await connect('r1')
    a.send({ type: 'hello' })
    const state = await a.next()
    expect(state).toMatchObject({
      type: 'state',
      site_id: 'malapert-a',
      playing: false,
      speed: 1,
      markers: [],
    })
    expect(Number.isNaN(Date.parse(state.t as string))).toBe(false)
    expect(await b.settle()).toEqual([])
  })

  it('relays state changes to the other clients and not to the sender', async () => {
    const a = await connect('relay')
    const b = await connect('relay')
    const message = { type: 'set_site', site_id: 'apollo-11' }
    a.send(JSON.stringify(message))
    expect(await b.next()).toEqual(message)
    expect(await a.settle()).toEqual([])

    const time = { type: 'set_time', t: '2027-01-31T00:00:00Z', playing: true, speed: 60 }
    b.send(JSON.stringify(time))
    expect(await a.next()).toEqual(time)
    expect(await b.settle()).toEqual([])
  })

  it('forwards the validated message rather than the raw text', async () => {
    const a = await connect('raw')
    const b = await connect('raw')
    a.send('{"site_id":"apollo-17",  "type":"set_site"}')
    const received = await b.next()
    expect(received).toEqual({ type: 'set_site', site_id: 'apollo-17' })
    expect(Object.keys(received).sort()).toEqual(['site_id', 'type'])
  })

  it('drops fields the validation discarded', async () => {
    const a = await connect('junk')
    const b = await connect('junk')
    a.send({ type: 'set_site', site_id: 'apollo-11', junk: 'x'.repeat(1000) })
    const site = await b.nextRaw()
    expect(site.length).toBeLessThan(100)
    const siteMessage = JSON.parse(site) as Record<string, unknown>
    expect(Object.keys(siteMessage).sort()).toEqual(['site_id', 'type'])
    expect(siteMessage).toEqual({ type: 'set_site', site_id: 'apollo-11' })

    a.send({ type: 'set_time', t: '2027-01-31T00:00:00Z', extra: { deep: true } })
    const time = (await b.next()) as Record<string, unknown>
    expect(Object.keys(time).sort()).toEqual(['t', 'type'])

    a.send({ type: 'marker_add', id: 'm1', site_id: 'apollo-11', x_m: 1, y_m: 2, kind: 'rock', junk: 'x'.repeat(1000) })
    const marker = (await b.next()) as Record<string, unknown>
    expect(Object.keys(marker).sort()).toEqual(['id', 'kind', 'site_id', 'type', 'x_m', 'y_m'])
  })

  it('keeps the note of a marker only when it was sent', async () => {
    const a = await connect('notes')
    const b = await connect('notes')
    a.send({ type: 'marker_add', id: 'm1', site_id: 'apollo-11', x_m: 1, y_m: 2, kind: 'rock', note: 'roca' })
    const withNote = (await b.next()) as Record<string, unknown>
    expect(withNote.note).toBe('roca')
    a.send({ type: 'marker_add', id: 'm2', site_id: 'apollo-11', x_m: 3, y_m: 4, kind: 'slope' })
    const withoutNote = (await b.next()) as Record<string, unknown>
    expect('note' in withoutNote).toBe(false)
    expect(Object.keys(withoutNote).sort()).toEqual(['id', 'kind', 'site_id', 'type', 'x_m', 'y_m'])
  })

  it('gives a late joiner the latest state', async () => {
    const a = await connect('late')
    a.send({ type: 'set_site', site_id: 'change-4' })
    a.send({ type: 'set_time', t: '2027-03-01T12:00:00Z', playing: true, speed: 10 })
    await a.settle()
    const c = await connect('late')
    c.send({ type: 'hello' })
    expect(await c.next()).toMatchObject({
      type: 'state',
      site_id: 'change-4',
      t: '2027-03-01T12:00:00Z',
      playing: true,
      speed: 10,
    })
  })

  it('reflects marker additions and removals in later hellos', async () => {
    const a = await connect('markers')
    const b = await connect('markers')
    const marker = { id: 'm1', site_id: 'malapert-a', x_m: 120.5, y_m: -40.2, kind: 'rock', note: 'roca' }
    const second = { id: 'm2', site_id: 'malapert-a', x_m: 1, y_m: 2, kind: 'slope' }
    a.send({ type: 'marker_add', ...marker })
    a.send({ type: 'marker_add', ...second })
    expect(await b.next()).toEqual({ type: 'marker_add', ...marker })
    expect(await b.next()).toEqual({ type: 'marker_add', ...second })

    const c = await connect('markers')
    c.send({ type: 'hello' })
    expect((await c.next()).markers).toEqual([marker, second])

    a.send({ type: 'marker_remove', id: 'm1' })
    expect(await b.next()).toEqual({ type: 'marker_remove', id: 'm1' })
    expect(await c.next()).toEqual({ type: 'marker_remove', id: 'm1' })
    c.send({ type: 'hello' })
    expect((await c.next()).markers).toEqual([second])
  })

  it('does not relay a removal that changes nothing', async () => {
    const a = await connect('noop')
    const b = await connect('noop')
    a.send({ type: 'marker_remove', id: 'ghost' })
    expect(await a.settle()).toEqual([])
    expect(await b.settle()).toEqual([])
  })

  it('ignores broken or invalid messages', async () => {
    const a = await connect('broken')
    const b = await connect('broken')
    for (const text of [
      '{"type":',
      'not json',
      '[]',
      'null',
      '{"type":"set_site"}',
      '{"type":"set_time","t":"yesterday"}',
      '{"type":"marker_add","id":"x"}',
      '{"type":"unknown"}',
    ]) {
      a.send(text)
    }
    a.socket.send(new Uint8Array([1, 2, 3]))
    expect(await a.settle()).toEqual([])
    expect(await b.settle()).toEqual([])
    a.send({ type: 'hello' })
    expect(await a.next()).toMatchObject({ site_id: 'malapert-a', markers: [] })
  })

  it('ignores messages above 16 KB', async () => {
    const a = await connect('big')
    const b = await connect('big')
    a.send({ type: 'marker_add', id: 'm', site_id: 's', x_m: 1, y_m: 1, kind: 'rock', note: 'x'.repeat(17_000) })
    a.send(JSON.stringify({ type: 'set_site', site_id: 'x'.repeat(20_000) }))
    expect(await b.settle()).toEqual([])
    a.send({ type: 'hello' })
    expect((await a.next()).markers).toEqual([])
  })

  it('keeps rooms isolated', async () => {
    const a = await connect('iso-a')
    const other = await connect('iso-b')
    a.send({ type: 'set_site', site_id: 'apollo-11' })
    a.send({ type: 'marker_add', id: 'm1', site_id: 'apollo-11', x_m: 0, y_m: 0, kind: 'other' })
    await a.settle()
    expect(await other.settle()).toEqual([])
    other.send({ type: 'hello' })
    expect(await other.next()).toMatchObject({ site_id: 'malapert-a', markers: [] })
  })

  it('treats /?room= like /ws?room=', async () => {
    const viaWs = await connect('paths', '/ws')
    const viaRoot = await connect('paths', '/')
    viaRoot.send({ type: 'set_site', site_id: 'apollo-17' })
    expect(await viaWs.next()).toEqual({ type: 'set_site', site_id: 'apollo-17' })
    viaRoot.send({ type: 'hello' })
    expect(await viaRoot.next()).toMatchObject({ site_id: 'apollo-17' })
  })

  it('relays cam_update live but never persists it into room state', async () => {
    const a = await connect('camsync')
    const b = await connect('camsync')
    const cam = { type: 'cam_update', site_id: 'malapert-a', px: 1, py: 1.6, pz: -2, qx: 0, qy: 0, qz: 0, qw: 1 }
    a.send(cam)
    expect(await b.next()).toEqual(cam)
    expect(await a.settle()).toEqual([])

    const c = await connect('camsync')
    c.send({ type: 'hello' })
    const state = await c.next()
    expect(state).not.toHaveProperty('px')
    expect(state).toMatchObject({ site_id: 'malapert-a' })
  })

  it('rejects an invalid cam_update without relaying it', async () => {
    const a = await connect('cambad')
    const b = await connect('cambad')
    a.send({ type: 'cam_update', site_id: 'malapert-a', px: 1, py: 1.6, pz: -2, qx: 0, qy: 0, qz: 0, qw: 2 })
    expect(await b.settle()).toEqual([])
  })

  it('answers ping with pong, with and without waking the object', async () => {
    const a = await connect('pings')
    a.send('{"type":"ping"}')
    expect(await a.nextRaw()).toBe('{"type":"pong"}')
    a.send('{ "type": "ping" }')
    expect(await a.nextRaw()).toBe('{"type":"pong"}')
  })

  it('rejects an invalid room name before reaching the object', async () => {
    for (const path of ['/ws?room=bad%20name', '/ws?room=', '/ws', `/ws?room=${'a'.repeat(65)}`, '/?room=a/b']) {
      const res = await call(path, upgrade)
      expect(res.status, path).toBe(400)
      expect(res.webSocket, path).toBeNull()
      const body = (await res.json()) as ErrorBody
      expect(body.error.code).toBe('INVALID_PARAMETER')
    }
  })

  it('asks for a websocket upgrade on /ws and rejects other methods', async () => {
    const plain = await getJson<ErrorBody>('/ws?room=r1')
    expect(plain.res.status).toBe(426)
    expect(plain.body.error.code).toBe('UPGRADE_REQUIRED')
    const post = await call('/ws?room=r1', { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET')
  })

  it('refuses the 33rd connection with 503', async () => {
    for (let i = 0; i < 32; i++) await connect('full')
    const res = await call('/ws?room=full', upgrade)
    expect(res.status).toBe(503)
    expect(res.webSocket).toBeNull()
    expect(((await res.json()) as ErrorBody).error.code).toBe('ROOM_FULL')
    const other = await call('/ws?room=not-full', upgrade)
    expect(other.status).toBe(101)
    other.webSocket!.accept()
    other.webSocket!.close(1000, 'done')
  })

  it('keeps its state and its sockets across eviction', async () => {
    const a = await connect('evict')
    const b = await connect('evict')
    a.send({ type: 'set_site', site_id: 'mons-mouton' })
    a.send({ type: 'marker_add', id: 'm1', site_id: 'mons-mouton', x_m: 5, y_m: 6, kind: 'shadow' })
    expect(await a.settle()).toEqual([])
    expect(await b.settle()).toHaveLength(2)

    await evictDurableObject(env.ROOMS.getByName('evict'))

    const c = await connect('evict')
    c.send({ type: 'hello' })
    const state = await c.next()
    expect(state).toMatchObject({ site_id: 'mons-mouton' })
    expect(state.markers).toHaveLength(1)

    a.send({ type: 'set_time', t: '2027-02-01T00:00:00Z' })
    expect(await b.next()).toEqual({ type: 'set_time', t: '2027-02-01T00:00:00Z' })
    expect(await c.next()).toEqual({ type: 'set_time', t: '2027-02-01T00:00:00Z' })
  })
})
