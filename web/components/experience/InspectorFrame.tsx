'use client';

import { useCallback } from 'react';
import type { LunarApp, PhaseName } from '@/lib/engine/app';
import styles from './InspectorFrame.module.css';

/** The phases standing on the surface, where the inspector's camera means something to a monitor. */
const SURFACE_PHASES: PhaseName[] = ['pov', 'landing', 'transmit'];

/** Mission Control only, outside the headset, while the mission is not stopped. */
export function showsInspector(phase: PhaseName, follow: boolean, stopped: boolean): boolean {
  return follow && !stopped && SURFACE_PHASES.includes(phase);
}

/**
 * "Vista del inspector VR": a transparent window over the 3D canvas. The engine draws the inspector's
 * capture into the rectangle of `.view` after every frame (see LunarApp.pip), so this only places it.
 */
export default function InspectorFrame({ app, live }: { app: LunarApp | null; live: boolean }) {
  const view = useCallback((el: HTMLDivElement | null) => {
    app?.pip.setHost(el);
  }, [app]);

  return (
    <aside className={styles.frame} aria-label="Vista del inspector VR" data-live={live ? '' : undefined}>
      <header>
        <span>Vista del inspector VR</span>
        <span className={styles.state}>{live ? '● En vivo' : '● Sin señal · esperando al inspector'}</span>
      </header>
      <div ref={view} className={styles.view} />
    </aside>
  );
}
