import type { LunarApp } from '../engine/app';
import type { CapcomDeps } from './controller';

interface Debug {
  events: Array<Record<string, unknown>>;
  /** Every spoken chunk (24 kHz PCM16) in arrival order, so a test can save what CAPCOM said. */
  audio: Int16Array[];
  app?: LunarApp;
}

declare global {
  interface Window {
    __capcomDebug?: Debug;
  }
}

/**
 * `?capcom=debug` records every session event and the spoken audio on `window.__capcomDebug` (never credentials),
 * so a browser test can read what CAPCOM heard, called and said. Without the parameter it does nothing.
 */
export function installCapcomDebug(params: URLSearchParams, app: LunarApp): Pick<CapcomDeps, 'debug'> {
  if (params.get('capcom') !== 'debug' || typeof window === 'undefined') return {};
  const debug: Debug = { events: [], audio: [], app };
  window.__capcomDebug = debug;
  return {
    debug: (event) => {
      if (event.type === 'audio') {
        debug.audio.push(event.pcm);
        debug.events.push({ t: Math.round(performance.now()), type: 'audio', samples: event.pcm.length });
        return;
      }
      debug.events.push({ t: Math.round(performance.now()), ...event } as Record<string, unknown>);
    },
  };
}
