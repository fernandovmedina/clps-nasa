import { DurableObject } from 'cloudflare:workers'
import { initialRoomState, parseClientMessage, reduceRoom, type RoomState } from '@touchdown/core'
import { HttpError, errorResponse } from './http'

const MAX_CONNECTIONS = 32
const MAX_MESSAGE_BYTES = 16 * 1024
const STATE_KEY = 'state'
const PING = '{"type":"ping"}'
const PONG = '{"type":"pong"}'
const SOCKET_OPEN = 1

const encoder = new TextEncoder()

export class RoomHub extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  async fetch(): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) {
      return errorResponse(new HttpError(503, 'ROOM_FULL', `the room already has ${MAX_CONNECTIONS} connections`))
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || encoder.encode(message).byteLength > MAX_MESSAGE_BYTES) return
    const parsed = parseClientMessage(message)
    if (parsed === null) return

    if (parsed.type === 'ping') {
      ws.send(PONG)
      return
    }
    if (parsed.type === 'cam_update') {
      // High-frequency (~10 Hz) and ephemeral - relay to peers, never touch
      // storage or go through reduceRoom. A late joiner's `hello` never sees it.
      const relayed = JSON.stringify(parsed)
      for (const peer of this.ctx.getWebSockets()) {
        if (peer !== ws && peer.readyState === SOCKET_OPEN) peer.send(relayed)
      }
      return
    }
    const current = this.loadState()
    if (parsed.type === 'hello') {
      ws.send(JSON.stringify(current))
      return
    }

    const next = reduceRoom(current, parsed)
    if (next === current) return
    this.ctx.storage.kv.put(STATE_KEY, next)
    const relayed = JSON.stringify(parsed)
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws && peer.readyState === SOCKET_OPEN) peer.send(relayed)
    }
  }

  private loadState(): RoomState {
    const stored = this.ctx.storage.kv.get<RoomState>(STATE_KEY)
    if (stored !== undefined) return stored
    const initial = initialRoomState(new Date().toISOString())
    this.ctx.storage.kv.put(STATE_KEY, initial)
    return initial
  }
}
