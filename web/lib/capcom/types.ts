export type CapcomState = 'closed' | 'connecting' | 'listening' | 'speaking' | 'error'

export type CapcomStopReason = 'PARTIAL_TURN' | 'END_TURN' | 'INTERRUPTED'

export type CapcomCloseReason = 'client' | 'server' | 'error'

export type CapcomEvent =
  | { type: 'state'; state: CapcomState; previous: CapcomState }
  | { type: 'transcript'; role: 'user' | 'assistant'; stage: 'speculative' | 'final'; text: string }
  | { type: 'tool-call'; toolUseId: string; name: string; input: unknown }
  | { type: 'tool-result'; toolUseId: string; name: string; output: unknown; isError: boolean }
  | { type: 'audio'; pcm: Int16Array; sampleRate: number }
  | { type: 'audio-end'; stopReason: CapcomStopReason }
  | { type: 'interrupted' }
  | { type: 'error'; code: string; message: string }
  | { type: 'closed'; reason: CapcomCloseReason }

export type CapcomListener = (event: CapcomEvent) => void

export interface CapcomTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (input: unknown) => Promise<unknown> | unknown
}

export interface GuestCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  expiration?: Date
}

export type CredentialsProvider = () => Promise<GuestCredentials>

export interface InputEvent {
  event: Record<string, unknown>
}

export interface ServerEvent {
  event: Record<string, Record<string, unknown>>
}

export interface CapcomTransport {
  send: (event: InputEvent) => void
  incoming: AsyncIterable<ServerEvent>
  end: () => void
  destroy: () => void
}

export interface TransportOptions {
  credentials: CredentialsProvider
  modelId: string
  region: string
  initial: InputEvent[]
}

export type TransportFactory = (options: TransportOptions) => Promise<CapcomTransport>
