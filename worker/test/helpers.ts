import { env, exports } from 'cloudflare:workers'
import { afterEach } from 'vitest'

const ORIGIN = 'http://touchdown.test'

export function call(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init))
}

export async function getJson<T = unknown>(path: string): Promise<{ res: Response; body: T }> {
  const res = await call(path)
  return { res, body: (await res.json()) as T }
}

export async function loadAsset<T>(path: string): Promise<T> {
  const res = await env.ASSETS.fetch(`${ORIGIN}${path}`)
  if (!res.ok) throw new Error(`asset ${path} -> ${res.status}`)
  return (await res.json()) as T
}

export interface ErrorBody {
  error: { code: string; message: string }
}

export class Client {
  private readonly queue: string[] = []
  private readonly waiters: Array<(message: string) => void> = []

  constructor(readonly socket: WebSocket) {
    socket.accept()
    socket.addEventListener('message', (event) => {
      const data = event.data as string
      const waiter = this.waiters.shift()
      if (waiter) waiter(data)
      else this.queue.push(data)
    })
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message))
  }

  nextRaw(): Promise<string> {
    const queued = this.queue.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  async next(): Promise<Record<string, unknown>> {
    return JSON.parse(await this.nextRaw()) as Record<string, unknown>
  }

  async settle(): Promise<Array<Record<string, unknown>>> {
    this.send('{ "type": "ping" }')
    const received: Array<Record<string, unknown>> = []
    for (;;) {
      const message = await this.next()
      if (message.type === 'pong') return received
      received.push(message)
    }
  }

  close(): void {
    this.socket.close(1000, 'done')
  }
}

const open: Client[] = []

afterEach(() => {
  for (const client of open.splice(0)) client.close()
})

export async function connect(room: string, path = '/ws'): Promise<Client> {
  const res = await call(`${path}?room=${room}`, { headers: { Upgrade: 'websocket' } })
  if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade failed: ${res.status}`)
  const client = new Client(res.webSocket)
  open.push(client)
  return client
}
