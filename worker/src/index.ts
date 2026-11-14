import { handleApi } from './api'
import { handleWebSocket, isWebSocketUpgrade } from './ws'

export { RoomHub } from './room-hub'

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleApi(request, env)
    if (pathname === '/ws') return handleWebSocket(request, env)
    if (pathname === '/' && request.method === 'GET' && isWebSocketUpgrade(request)) {
      return handleWebSocket(request, env)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Cloudflare.Env>
