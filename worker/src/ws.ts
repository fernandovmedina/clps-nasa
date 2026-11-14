import { isValidRoomName } from '@touchdown/core'
import { HttpError, badRequest, errorResponse } from './http'

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

export function handleWebSocket(request: Request, env: Cloudflare.Env): Promise<Response> | Response {
  if (request.method !== 'GET') {
    return errorResponse(new HttpError(405, 'METHOD_NOT_ALLOWED', `${request.method} is not allowed`, { allow: 'GET' }))
  }
  if (!isWebSocketUpgrade(request)) {
    return errorResponse(new HttpError(426, 'UPGRADE_REQUIRED', 'expected a WebSocket upgrade'))
  }
  const room = new URL(request.url).searchParams.get('room')
  if (room === null || !isValidRoomName(room)) {
    return errorResponse(badRequest('room must match ^[A-Za-z0-9_-]{1,64}$'))
  }
  return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request)
}
