import { isIsoDate } from './time'
import type { ClientMessage, Marker, MarkerKind, RoomState } from './types'

export const MAX_MARKERS = 200

const MARKER_KINDS: readonly string[] = ['rock', 'slope', 'shadow', 'other']
const ROOM_NAME = /^[A-Za-z0-9_-]{1,64}$/
export function isValidRoomName(name: string): boolean {
  return ROOM_NAME.test(name)
}

export function initialRoomState(nowIso: string): RoomState {
  return {
    type: 'state',
    site_id: 'malapert-a',
    t: nowIso,
    playing: false,
    speed: 1,
    markers: [],
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= 64
}

function isCoordinate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100_000
}

function isQuatComponent(v: unknown): v is number {
  // 1.01 instead of 1.0 for float round-trip slack, not a meaningful tolerance.
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1.01
}

function isKind(v: unknown): v is MarkerKind {
  return typeof v === 'string' && MARKER_KINDS.includes(v)
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null

  switch (value.type) {
    case 'hello':
      return { type: 'hello' }
    case 'ping':
      return { type: 'ping' }
    case 'set_site':
      return isId(value.site_id) ? { type: 'set_site', site_id: value.site_id } : null
    case 'set_time': {
      const { t, playing, speed } = value
      if (!isIsoDate(t)) return null
      if (playing !== undefined && typeof playing !== 'boolean') return null
      if (speed !== undefined && !(typeof speed === 'number' && Number.isFinite(speed) && Math.abs(speed) <= 1e6)) {
        return null
      }
      return {
        type: 'set_time',
        t,
        ...(playing !== undefined && { playing }),
        ...(speed !== undefined && { speed }),
      }
    }
    case 'marker_add': {
      const { id, site_id, x_m, y_m, kind, note } = value
      if (!isId(id) || !isId(site_id) || !isCoordinate(x_m) || !isCoordinate(y_m) || !isKind(kind)) {
        return null
      }
      if (note !== undefined && !(typeof note === 'string' && note.length <= 280)) return null
      return {
        type: 'marker_add',
        id,
        site_id,
        x_m,
        y_m,
        kind,
        ...(note !== undefined && { note }),
      }
    }
    case 'marker_remove':
      return isId(value.id) ? { type: 'marker_remove', id: value.id } : null
    case 'cam_update': {
      const { site_id, px, py, pz, qx, qy, qz, qw } = value
      if (!isId(site_id) || !isCoordinate(px) || !isCoordinate(py) || !isCoordinate(pz)) return null
      if (!isQuatComponent(qx) || !isQuatComponent(qy) || !isQuatComponent(qz) || !isQuatComponent(qw)) return null
      return { type: 'cam_update', site_id, px, py, pz, qx, qy, qz, qw }
    }
    default:
      return null
  }
}

export function reduceRoom(state: RoomState, msg: ClientMessage): RoomState {
  switch (msg.type) {
    case 'hello':
    case 'ping':
      return state
    case 'set_site':
      return { ...state, site_id: msg.site_id, markers: [...state.markers] }
    case 'set_time':
      return {
        ...state,
        t: msg.t,
        markers: [...state.markers],
        ...(msg.playing !== undefined && { playing: msg.playing }),
        ...(msg.speed !== undefined && { speed: msg.speed }),
      }
    case 'marker_add': {
      const marker: Marker = {
        id: msg.id,
        site_id: msg.site_id,
        x_m: msg.x_m,
        y_m: msg.y_m,
        kind: msg.kind,
        ...(msg.note !== undefined && { note: msg.note }),
      }
      const at = state.markers.findIndex((m) => m.id === marker.id)
      if (at >= 0) {
        const markers = state.markers.slice()
        markers[at] = marker
        return { ...state, markers }
      }
      if (state.markers.length >= MAX_MARKERS) return state
      return { ...state, markers: [...state.markers, marker] }
    }
    case 'marker_remove': {
      if (!state.markers.some((m) => m.id === msg.id)) return state
      return { ...state, markers: state.markers.filter((m) => m.id !== msg.id) }
    }
    default:
      return state
  }
}
