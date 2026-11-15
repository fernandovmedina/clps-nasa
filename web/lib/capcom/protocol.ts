import type { CapcomEndpointing } from './config';
import type { CapcomTool, InputEvent } from './types';

const AUDIO_INPUT = {
  mediaType: 'audio/lpcm',
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
  audioType: 'SPEECH',
  encoding: 'base64',
} as const;

export interface PromptSettings {
  promptName: string
  voiceId: string
  outputSampleRate: number
  tools: CapcomTool[]
}

export function sessionStart(
  inference: { maxTokens: number; topP: number; temperature: number },
  endpointing: CapcomEndpointing,
): InputEvent {
  return {
    event: {
      sessionStart: {
        inferenceConfiguration: inference,
        turnDetectionConfiguration: { endpointingSensitivity: endpointing },
      },
    },
  };
}

export function promptStart(settings: PromptSettings): InputEvent {
  const promptStartEvent: Record<string, unknown> = {
    promptName: settings.promptName,
    textOutputConfiguration: { mediaType: 'text/plain' },
    audioOutputConfiguration: {
      mediaType: 'audio/lpcm',
      sampleRateHertz: settings.outputSampleRate,
      sampleSizeBits: 16,
      channelCount: 1,
      voiceId: settings.voiceId,
      encoding: 'base64',
      audioType: 'SPEECH',
    },
  };
  if (settings.tools.length > 0) {
    promptStartEvent.toolUseOutputConfiguration = { mediaType: 'application/json' };
    promptStartEvent.toolConfiguration = {
      tools: settings.tools.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: { json: JSON.stringify(tool.inputSchema) },
        },
      })),
      toolChoice: { auto: {} },
    };
  }
  return { event: { promptStart: promptStartEvent } };
}

export function systemPrompt(promptName: string, contentName: string, text: string): InputEvent[] {
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName,
          type: 'TEXT',
          interactive: false,
          role: 'SYSTEM',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    { event: { textInput: { promptName, contentName, content: text } } },
    { event: { contentEnd: { promptName, contentName } } },
  ];
}

export function audioContentStart(promptName: string, contentName: string): InputEvent {
  return {
    event: {
      contentStart: {
        promptName,
        contentName,
        type: 'AUDIO',
        interactive: true,
        role: 'USER',
        audioInputConfiguration: AUDIO_INPUT,
      },
    },
  };
}

export function audioInput(promptName: string, contentName: string, base64: string): InputEvent {
  return { event: { audioInput: { promptName, contentName, content: base64 } } };
}

export function contentEnd(promptName: string, contentName: string): InputEvent {
  return { event: { contentEnd: { promptName, contentName } } };
}

export function toolResult(
  promptName: string,
  contentName: string,
  toolUseId: string,
  result: unknown,
): InputEvent[] {
  return [
    {
      event: {
        contentStart: {
          promptName,
          contentName,
          interactive: false,
          type: 'TOOL',
          role: 'TOOL',
          toolResultInputConfiguration: {
            toolUseId,
            type: 'TEXT',
            textInputConfiguration: { mediaType: 'text/plain' },
          },
        },
      },
    },
    {
      event: {
        toolResult: {
          promptName,
          contentName,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        },
      },
    },
    { event: { contentEnd: { promptName, contentName } } },
  ];
}

export function promptEnd(promptName: string): InputEvent {
  return { event: { promptEnd: { promptName } } };
}

export const sessionEnd: InputEvent = { event: { sessionEnd: {} } };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function base64ToPcm(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}
