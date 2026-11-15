import type { CapcomTransport, InputEvent, ServerEvent, TransportFactory } from './types';

const CONNECTION_TIMEOUT_MS = 10_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class InputQueue {
  private items: InputEvent[] = [];
  private waiter: (() => void) | null = null;
  private done = false;

  push(event: InputEvent) {
    if (this.done) return;
    this.items.push(event);
    this.wake();
  }

  close() {
    this.done = true;
    this.wake();
  }

  private wake() {
    const resolve = this.waiter;
    this.waiter = null;
    resolve?.();
  }

  async *stream(): AsyncGenerator<{ chunk: { bytes: Uint8Array } }> {
    while (true) {
      const next = this.items.shift();
      if (next) {
        yield { chunk: { bytes: encoder.encode(JSON.stringify(next)) } };
        continue;
      }
      if (this.done) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

const STREAM_EXCEPTIONS = [
  'internalServerException',
  'modelStreamErrorException',
  'validationException',
  'throttlingException',
  'modelTimeoutException',
  'serviceUnavailableException',
] as const;

type OutputItem = { chunk?: { bytes?: Uint8Array } } & Partial<
  Record<(typeof STREAM_EXCEPTIONS)[number], { message?: string }>
>

async function* decodeOutput(body: AsyncIterable<OutputItem>): AsyncGenerator<ServerEvent> {
  for await (const item of body) {
    if (item.chunk?.bytes) {
      yield JSON.parse(decoder.decode(item.chunk.bytes)) as ServerEvent;
      continue;
    }
    for (const name of STREAM_EXCEPTIONS) {
      const exception = item[name];
      if (exception) {
        const error = new Error(exception.message ?? name);
        error.name = name;
        throw error;
      }
    }
  }
}

/**
 * Stream bidireccional de Bedrock desde el navegador. En el build de navegador de
 * @aws-sdk/client-bedrock-runtime el manejador por defecto es WebSocketFetchHandler;
 * por eso solo se pasan opciones: una instancia propia lo reemplazaría y se perdería el WebSocket.
 */
export const openBedrockTransport: TransportFactory = async ({ credentials, modelId, region, initial }) => {
  const { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } = await import(
    '@aws-sdk/client-bedrock-runtime'
  );
  const client = new BedrockRuntimeClient({
    region,
    credentials,
    maxAttempts: 1,
    requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS },
  });
  const queue = new InputQueue();
  for (const event of initial) queue.push(event);

  let response;
  try {
    response = await client.send(
      new InvokeModelWithBidirectionalStreamCommand({ modelId, body: queue.stream() }),
    );
  } catch (error) {
    queue.close();
    client.destroy();
    throw error;
  }

  const transport: CapcomTransport = {
    send: (event) => queue.push(event),
    incoming: decodeOutput((response.body ?? emptyBody()) as AsyncIterable<OutputItem>),
    end: () => queue.close(),
    destroy: () => {
      queue.close();
      client.destroy();
    },
  };
  return transport;
};

async function* emptyBody(): AsyncGenerator<OutputItem> {}
