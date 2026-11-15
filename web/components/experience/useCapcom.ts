'use client';

import { useSyncExternalStore } from 'react';
import type { CapcomController, CapcomSnapshot } from '@/lib/capcom/controller';

const NONE: CapcomSnapshot = { state: 'disconnected', talking: false, question: '', answer: '', answerFinal: false, message: null, mic: 'unknown' };

export function useCapcom(controller: CapcomController): CapcomSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => NONE);
}
