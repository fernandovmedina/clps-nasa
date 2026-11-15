import type { LunarApp } from '../engine/app';
import type { CapcomController, CapcomDeps } from './controller';

interface Debug {
  events: Array<Record<string, unknown>>;
  controller?: CapcomController;
  app?: LunarApp;
}

declare global {
  interface Window {
    __capcomDebug?: Debug;
  }
}

/**
 * `?capcom=debug` records every session event on `window.__capcomDebug` (no audio, no credentials),
 * so a browser test can read what CAPCOM heard, called and said. Without the parameter it does nothing.
 */
export function installCapcomDebug(params: URLSearchParams, app: LunarApp): Pick<CapcomDeps, 'debug'> {
  if (params.get('capcom') !== 'debug' || typeof window === 'undefined') return {};
  const debug: Debug = { events: [], app };
  window.__capcomDebug = debug;
  return {
    debug: (event) => {
      if (event.type === 'audio') {
        debug.events.push({ t: Math.round(performance.now()), type: 'audio', samples: event.pcm.length });
        return;
      }
      debug.events.push({ t: Math.round(performance.now()), ...event } as Record<string, unknown>);
    },
  };
}
