import { openBedrockTransport } from './bedrock-transport';
import {
  CAPCOM_ENDPOINTING,
  CAPCOM_INFERENCE,
  CAPCOM_MODEL_ID,
  CAPCOM_OUTPUT_SAMPLE_RATE,
  CAPCOM_REGION,
  CAPCOM_SESSION_LIMIT_MS,
  CAPCOM_SYSTEM_PROMPT,
  CAPCOM_VOICE_ID,
  type CapcomEndpointing,
} from './config';
import { createGuestCredentialProvider } from './credentials';
import {
  audioContentStart,
  audioInput,
  base64ToPcm,
  bytesToBase64,
  contentEnd,
  promptEnd,
  promptStart,
  sessionEnd,
  sessionStart,
  systemPrompt,
  toolResult,
} from './protocol';
import { tripStatusTool } from './tools';
import type {
  CapcomEvent,
  CapcomListener,
  CapcomState,
  CapcomStopReason,
  CapcomTool,
  CapcomTransport,
  CredentialsProvider,
  TransportFactory,
} from './types';

const CLOSE_TIMEOUT_MS = 4000;

export interface CapcomSessionOptions {
  credentials?: CredentialsProvider
  transport?: TransportFactory
  voiceId?: string
  systemPrompt?: string
  tools?: CapcomTool[]
  endpointing?: CapcomEndpointing
}

interface ContentBlock {
  type: string
  role: string
  stage: 'speculative' | 'final'
  text: string
}

interface PendingToolCall {
  toolUseId: string
  name: string
  content: string
}

type Fields = Record<string, unknown>

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) return { code: error.name, message: error.message };
  if (typeof Event !== 'undefined' && error instanceof Event) {
    return { code: 'WebSocketError', message: `WebSocket ${error.type} event` };
  }
  if (error && typeof error === 'object' && '$metadata' in error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return { code: 'ConnectionFailed', message: `Connection to the stream failed (status ${status ?? 'unknown'})` };
  }
  return { code: 'UnknownError', message: String(error) };
}

function parseStage(additionalModelFields: unknown): 'speculative' | 'final' {
  if (typeof additionalModelFields !== 'string') return 'final';
  try {
    const parsed = JSON.parse(additionalModelFields) as { generationStage?: string };
    return parsed.generationStage === 'SPECULATIVE' ? 'speculative' : 'final';
  } catch {
    return 'final';
  }
}

export class CapcomSession {
  private current: CapcomState = 'closed';
  private readonly listeners = new Set<CapcomListener>();
  private readonly credentials: CredentialsProvider;
  private readonly openTransport: TransportFactory;
  private readonly voiceId: string;
  private readonly systemPromptText: string;
  private readonly endpointing: CapcomEndpointing;
  private readonly tools = new Map<string, CapcomTool>();

  private transport: CapcomTransport | null = null;
  private reader: Promise<void> | null = null;
  private promptName = '';
  private audioContentName = '';
  private muted = false;
  private closing = false;
  private startedAt = 0;
  private readonly blocks = new Map<string, ContentBlock>();
  private readonly toolCalls = new Map<string, PendingToolCall>();

  constructor(options: CapcomSessionOptions = {}) {
    this.credentials = options.credentials ?? createGuestCredentialProvider();
    this.openTransport = options.transport ?? openBedrockTransport;
    this.voiceId = options.voiceId ?? CAPCOM_VOICE_ID;
    this.systemPromptText = options.systemPrompt ?? CAPCOM_SYSTEM_PROMPT;
    this.endpointing = options.endpointing ?? CAPCOM_ENDPOINTING;
    for (const tool of options.tools ?? [tripStatusTool]) this.tools.set(tool.name, tool);
  }

  get state(): CapcomState {
    return this.current;
  }

  get remainingMs(): number {
    return this.startedAt ? Math.max(0, CAPCOM_SESSION_LIMIT_MS - (Date.now() - this.startedAt)) : CAPCOM_SESSION_LIMIT_MS;
  }

  subscribe(listener: CapcomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  async start(): Promise<void> {
    if (this.current !== 'closed' && this.current !== 'error') {
      throw new Error(`CAPCOM session cannot start from state ${this.current}`);
    }
    this.closing = false;
    this.blocks.clear();
    this.toolCalls.clear();
    this.promptName = newId();
    this.audioContentName = newId();
    this.setState('connecting');

    const tools = [...this.tools.values()];
    const initial = [
      sessionStart(CAPCOM_INFERENCE, this.endpointing),
      promptStart({
        promptName: this.promptName,
        voiceId: this.voiceId,
        outputSampleRate: CAPCOM_OUTPUT_SAMPLE_RATE,
        tools,
      }),
      ...systemPrompt(this.promptName, newId(), this.systemPromptText),
      audioContentStart(this.promptName, this.audioContentName),
    ];

    try {
      this.transport = await this.openTransport({
        credentials: this.credentials,
        modelId: CAPCOM_MODEL_ID,
        region: CAPCOM_REGION,
        initial,
      });
    } catch (error) {
      this.fail(error);
      throw error;
    }
    this.startedAt = Date.now();
    this.setState('listening');
    this.reader = this.readLoop(this.transport);
  }

  sendAudio(pcm: Int16Array) {
    if (!this.transport || this.closing) return;
    if (this.current !== 'listening' && this.current !== 'speaking') return;
    const bytes = this.muted
      ? new Uint8Array(pcm.byteLength)
      : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    this.transport.send(audioInput(this.promptName, this.audioContentName, bytesToBase64(bytes)));
  }

  async close(): Promise<void> {
    const transport = this.transport;
    if (!transport || this.closing) return;
    this.closing = true;
    if (this.current !== 'error') {
      transport.send(contentEnd(this.promptName, this.audioContentName));
      transport.send(promptEnd(this.promptName));
      transport.send(sessionEnd);
      transport.end();
      await Promise.race([
        this.reader,
        new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
      ]);
    }
    this.finish('client');
  }

  private emit(event: CapcomEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private setState(next: CapcomState) {
    if (next === this.current) return;
    const previous = this.current;
    this.current = next;
    this.emit({ type: 'state', state: next, previous });
  }

  private fail(error: unknown) {
    if (this.current === 'error') return;
    const { code, message } = describeError(error);
    this.transport?.destroy();
    this.setState('error');
    this.emit({ type: 'error', code, message });
  }

  private finish(reason: 'client' | 'server') {
    this.transport?.destroy();
    this.transport = null;
    this.setState('closed');
    this.emit({ type: 'closed', reason });
  }

  private async readLoop(transport: CapcomTransport): Promise<void> {
    try {
      for await (const message of transport.incoming) {
        this.handle(message.event);
      }
    } catch (error) {
      if (!this.closing) this.fail(error);
      return;
    }
    if (!this.closing && this.transport === transport) this.finish('server');
  }

  private handle(event: Record<string, Fields>) {
    if (event.contentStart) this.onContentStart(event.contentStart);
    else if (event.textOutput) this.onTextOutput(event.textOutput);
    else if (event.audioOutput) this.onAudioOutput(event.audioOutput);
    else if (event.toolUse) this.onToolUse(event.toolUse);
    else if (event.contentEnd) this.onContentEnd(event.contentEnd);
    else if (event.completionEnd && this.current === 'speaking') this.setState('listening');
  }

  private onContentStart(fields: Fields) {
    const id = String(fields.contentId ?? '');
    this.blocks.set(id, {
      type: String(fields.type ?? ''),
      role: String(fields.role ?? ''),
      stage: parseStage(fields.additionalModelFields),
      text: '',
    });
  }

  private onTextOutput(fields: Fields) {
    const content = typeof fields.content === 'string' ? fields.content : '';
    if (/^\s*\{\s*"interrupted"\s*:\s*true\s*\}\s*$/.test(content)) {
      this.onInterrupted();
      return;
    }
    const block = this.blocks.get(String(fields.contentId ?? ''));
    if (block) block.text += content;
  }

  private onAudioOutput(fields: Fields) {
    if (typeof fields.content !== 'string') return;
    if (this.current === 'listening') this.setState('speaking');
    this.emit({ type: 'audio', pcm: base64ToPcm(fields.content), sampleRate: CAPCOM_OUTPUT_SAMPLE_RATE });
  }

  private onToolUse(fields: Fields) {
    this.toolCalls.set(String(fields.contentId ?? ''), {
      toolUseId: String(fields.toolUseId ?? ''),
      name: String(fields.toolName ?? ''),
      content: typeof fields.content === 'string' ? fields.content : '{}',
    });
  }

  private onContentEnd(fields: Fields) {
    const id = String(fields.contentId ?? '');
    const stopReason = String(fields.stopReason ?? '');
    const block = this.blocks.get(id);
    this.blocks.delete(id);

    if (stopReason === 'INTERRUPTED') this.onInterrupted();

    if (block?.type === 'TEXT' && block.text.trim() && (block.role === 'USER' || block.role === 'ASSISTANT')) {
      this.emit({
        type: 'transcript',
        role: block.role === 'USER' ? 'user' : 'assistant',
        stage: block.stage,
        text: block.text,
      });
    } else if (block?.type === 'AUDIO') {
      this.emit({ type: 'audio-end', stopReason: stopReason as CapcomStopReason });
      if (stopReason === 'END_TURN' && this.current === 'speaking') this.setState('listening');
    } else if (block?.type === 'TOOL') {
      const call = this.toolCalls.get(id);
      this.toolCalls.delete(id);
      if (call) void this.runTool(call);
    }
  }

  private onInterrupted() {
    this.emit({ type: 'interrupted' });
    if (this.current === 'speaking') this.setState('listening');
  }

  private async runTool(call: PendingToolCall) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.content);
    } catch {
      input = {};
    }
    this.emit({ type: 'tool-call', toolUseId: call.toolUseId, name: call.name, input });

    let output: unknown;
    let isError = false;
    try {
      const tool = this.tools.get(call.name);
      if (!tool) throw new Error(`Unknown tool ${call.name}`);
      output = await tool.run(input);
    } catch (error) {
      isError = true;
      output = { error: describeError(error).message };
    }
    this.emit({ type: 'tool-result', toolUseId: call.toolUseId, name: call.name, output, isError });

    const transport = this.transport;
    if (!transport || this.closing) return;
    for (const event of toolResult(this.promptName, newId(), call.toolUseId, output)) transport.send(event);
  }
}
