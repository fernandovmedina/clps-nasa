import { describe, expect, it } from 'vitest';
import { CAPCOM_SYSTEM_PROMPT } from './config';
import { base64ToPcm, bytesToBase64, promptStart, sessionStart, toolResult } from './protocol';
import { tripStatusTool } from './tools';

describe('protocol', () => {
  it('declares the endpointing sensitivity and inference settings in sessionStart', () => {
    const { event } = sessionStart({ maxTokens: 512, topP: 0.8, temperature: 0.5 }, 'HIGH');
    expect(event.sessionStart).toEqual({
      inferenceConfiguration: { maxTokens: 512, topP: 0.8, temperature: 0.5 },
      turnDetectionConfiguration: { endpointingSensitivity: 'HIGH' },
    });
  });

  it('configures the spoken output and sends the tool schema as a JSON string', () => {
    const { event } = promptStart({ promptName: 'p1', voiceId: 'carlos', outputSampleRate: 24000, tools: [tripStatusTool] });
    const start = event.promptStart as {
      promptName: string;
      audioOutputConfiguration: unknown;
      toolConfiguration: { tools: Array<{ toolSpec: { name: string; inputSchema: { json: string } } }> };
    };
    expect(start.promptName).toBe('p1');
    expect(start.audioOutputConfiguration).toMatchObject({
      mediaType: 'audio/lpcm',
      sampleRateHertz: 24000,
      sampleSizeBits: 16,
      channelCount: 1,
      voiceId: 'carlos',
    });
    const spec = start.toolConfiguration.tools[0].toolSpec;
    expect(spec.name).toBe('estado_del_viaje');
    expect(JSON.parse(spec.inputSchema.json)).toEqual({ type: 'object', properties: {}, required: [] });
  });

  it('omits the tool configuration when there are no tools', () => {
    const { event } = promptStart({ promptName: 'p1', voiceId: 'lupe', outputSampleRate: 24000, tools: [] });
    expect(event.promptStart).not.toHaveProperty('toolConfiguration');
  });

  it('wraps a tool result in contentStart, toolResult and contentEnd with one contentName', () => {
    const events = toolResult('p1', 'c1', 'use-1', { ok: true });
    expect(events).toHaveLength(3);
    const start = events[0].event.contentStart as { toolResultInputConfiguration: { toolUseId: string } };
    expect(start.toolResultInputConfiguration.toolUseId).toBe('use-1');
    expect(events[1].event.toolResult).toEqual({ promptName: 'p1', contentName: 'c1', content: '{"ok":true}' });
    expect(events[2].event.contentEnd).toEqual({ promptName: 'p1', contentName: 'c1' });
  });

  it('round-trips PCM through base64', () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const decoded = base64ToPcm(bytesToBase64(new Uint8Array(pcm.buffer)));
    expect(Array.from(decoded)).toEqual(Array.from(pcm));
  });

  it('keeps the persona rules that make the model use the tool', () => {
    expect(CAPCOM_SYSTEM_PROMPT).toContain('estado_del_viaje');
    expect(CAPCOM_SYSTEM_PROMPT).toMatch(/SIEMPRE/);
  });
});
