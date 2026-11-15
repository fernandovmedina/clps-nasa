import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from './protocol';
import { CapcomSession } from './session';
import type { CapcomEvent, CapcomTransport, InputEvent, ServerEvent } from './types';

function fakeTransport() {
  const sent: InputEvent[] = [];
  const queue: Array<ServerEvent | Error | null> = [];
  let wake: (() => void) | null = null;
  let ended = false;
  let destroyed = false;

  const push = (item: ServerEvent | Error | null) => {
    queue.push(item);
    wake?.();
  };

  const transport: CapcomTransport = {
    send: (event) => {
      sent.push(event);
    },
    incoming: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          while (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
          const item = queue.shift();
          if (item === null || item === undefined) return;
          if (item instanceof Error) throw item;
          yield item;
        }
      },
    },
    end: () => {
      ended = true;
      push(null);
    },
    destroy: () => {
      destroyed = true;
    },
  };
  return {
    transport,
    sent,
    push,
    server: (event: Record<string, Record<string, unknown>>) => push({ event }),
    get ended() { return ended; },
    get destroyed() { return destroyed; },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function started() {
  const fake = fakeTransport();
  const session = new CapcomSession({
    credentials: async () => ({ accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' }),
    transport: async () => fake.transport,
  });
  const events: CapcomEvent[] = [];
  session.subscribe((event) => events.push(event));
  await session.start();
  return { fake, session, events };
}

const kinds = (sent: InputEvent[]) => sent.map((s) => Object.keys(s.event)[0]);

describe('CapcomSession', () => {
  it('moves from closed through connecting to listening', async () => {
    const { session, events } = await started();
    expect(session.state).toBe('listening');
    expect(events.filter((e) => e.type === 'state').map((e) => (e as { state: string }).state)).toEqual(['connecting', 'listening']);
  });

  it('opens the stream with the documented event order', async () => {
    const fake = fakeTransport();
    let initial: InputEvent[] = [];
    const session = new CapcomSession({
      credentials: async () => ({ accessKeyId: 'a', secretAccessKey: 'b' }),
      transport: async (options) => {
        initial = options.initial;
        return fake.transport;
      },
    });
    await session.start();
    expect(kinds(initial)).toEqual(['sessionStart', 'promptStart', 'contentStart', 'textInput', 'contentEnd', 'contentStart']);
    expect((initial[2].event.contentStart as { role: string }).role).toBe('SYSTEM');
    expect((initial[5].event.contentStart as { type: string }).type).toBe('AUDIO');
  });

  it('reports a failed connection as the error state and rethrows', async () => {
    const session = new CapcomSession({
      credentials: async () => ({ accessKeyId: 'a', secretAccessKey: 'b' }),
      transport: async () => {
        throw new Error('boom');
      },
    });
    const events: CapcomEvent[] = [];
    session.subscribe((event) => events.push(event));
    await expect(session.start()).rejects.toThrow('boom');
    expect(session.state).toBe('error');
    expect(events).toContainEqual({ type: 'error', code: 'Error', message: 'boom' });
  });

  it('switches to speaking on audio and back to listening on END_TURN', async () => {
    const { fake, session, events } = await started();
    fake.server({ contentStart: { contentId: 'a1', type: 'AUDIO', role: 'ASSISTANT' } });
    fake.server({ audioOutput: { contentId: 'a1', content: bytesToBase64(new Uint8Array([1, 0, 2, 0])) } });
    await flush();
    expect(session.state).toBe('speaking');
    fake.server({ contentEnd: { contentId: 'a1', type: 'AUDIO', stopReason: 'END_TURN' } });
    await flush();
    expect(session.state).toBe('listening');
    const audio = events.find((e) => e.type === 'audio') as Extract<CapcomEvent, { type: 'audio' }>;
    expect(Array.from(audio.pcm)).toEqual([1, 2]);
    expect(audio.sampleRate).toBe(24000);
    expect(events).toContainEqual({ type: 'audio-end', stopReason: 'END_TURN' });
  });

  it('assembles transcripts per content block with their generation stage', async () => {
    const { fake, events } = await started();
    fake.server({ contentStart: { contentId: 'u1', type: 'TEXT', role: 'USER', additionalModelFields: '{"generationStage":"FINAL"}' } });
    fake.server({ textOutput: { contentId: 'u1', content: 'cómo va ' } });
    fake.server({ textOutput: { contentId: 'u1', content: 'el viaje' } });
    fake.server({ contentEnd: { contentId: 'u1', type: 'TEXT', stopReason: 'PARTIAL_TURN' } });
    fake.server({ contentStart: { contentId: 't1', type: 'TEXT', role: 'ASSISTANT', additionalModelFields: '{"generationStage":"SPECULATIVE"}' } });
    fake.server({ textOutput: { contentId: 't1', content: 'Todo en orden.' } });
    fake.server({ contentEnd: { contentId: 't1', type: 'TEXT', stopReason: 'END_TURN' } });
    await flush();
    const transcripts = events.filter((e) => e.type === 'transcript');
    expect(transcripts).toEqual([
      { type: 'transcript', role: 'user', stage: 'final', text: 'cómo va el viaje' },
      { type: 'transcript', role: 'assistant', stage: 'speculative', text: 'Todo en orden.' },
    ]);
  });

  it('runs the requested tool and always answers with a toolResult', async () => {
    const { fake, events } = await started();
    fake.sent.length = 0;
    fake.server({ contentStart: { contentId: 'k1', type: 'TOOL', role: 'TOOL' } });
    fake.server({ toolUse: { contentId: 'k1', toolUseId: 'use-1', toolName: 'estado_del_viaje', content: '{}' } });
    fake.server({ contentEnd: { contentId: 'k1', type: 'TOOL', stopReason: 'TOOL_USE' } });
    await flush();
    expect(kinds(fake.sent)).toEqual(['contentStart', 'toolResult', 'contentEnd']);
    const result = fake.sent[1].event.toolResult as { content: string };
    expect(JSON.parse(result.content)).toMatchObject({ fase: 'Despegue', altitud_km: 169 });
    expect(events).toContainEqual({ type: 'tool-call', toolUseId: 'use-1', name: 'estado_del_viaje', input: {} });
    expect(events.find((e) => e.type === 'tool-result')).toMatchObject({ isError: false });

    fake.sent.length = 0;
    fake.server({ contentStart: { contentId: 'k2', type: 'TOOL', role: 'TOOL' } });
    fake.server({ toolUse: { contentId: 'k2', toolUseId: 'use-2', toolName: 'desconocida', content: '{}' } });
    fake.server({ contentEnd: { contentId: 'k2', type: 'TOOL', stopReason: 'TOOL_USE' } });
    await flush();
    expect(kinds(fake.sent)).toEqual(['contentStart', 'toolResult', 'contentEnd']);
    expect(events.filter((e) => e.type === 'tool-result').at(-1)).toMatchObject({ isError: true });
  });

  it('signals barge-in and returns to listening', async () => {
    const { fake, session, events } = await started();
    fake.server({ audioOutput: { contentId: 'a1', content: bytesToBase64(new Uint8Array([1, 0])) } });
    await flush();
    expect(session.state).toBe('speaking');
    fake.server({ textOutput: { contentId: 'x', content: '{ "interrupted" : true }' } });
    await flush();
    expect(events).toContainEqual({ type: 'interrupted' });
    expect(session.state).toBe('listening');
  });

  it('sends microphone audio and replaces it with silence while muted', async () => {
    const { fake, session } = await started();
    fake.sent.length = 0;
    session.sendAudio(new Int16Array([5, 6, 7]));
    session.setMuted(true);
    session.sendAudio(new Int16Array([5, 6, 7]));
    const contents = fake.sent.map((s) => (s.event.audioInput as { content: string }).content);
    expect(contents[0]).toBe(bytesToBase64(new Uint8Array(new Int16Array([5, 6, 7]).buffer)));
    expect(contents[1]).toBe(bytesToBase64(new Uint8Array(6)));
  });

  it('closes with contentEnd, promptEnd and sessionEnd, then ends the stream', async () => {
    const { fake, session, events } = await started();
    fake.sent.length = 0;
    await session.close();
    expect(kinds(fake.sent)).toEqual(['contentEnd', 'promptEnd', 'sessionEnd']);
    expect(fake.ended).toBe(true);
    expect(fake.destroyed).toBe(true);
    expect(session.state).toBe('closed');
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'client' });
  });

  it('turns a stream failure into the error state', async () => {
    const { fake, session, events } = await started();
    fake.push(new Error('socket lost'));
    await flush();
    expect(session.state).toBe('error');
    expect(events).toContainEqual({ type: 'error', code: 'Error', message: 'socket lost' });
  });

  it('reports a server-side end of stream as closed', async () => {
    const { fake, session, events } = await started();
    fake.push(null);
    await flush();
    expect(session.state).toBe('closed');
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'server' });
  });
});
