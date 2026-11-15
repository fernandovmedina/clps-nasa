'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LunarApp } from '@/lib/engine/app';
import dialog from './Dialog.module.css';
import layer from './MissionLayer.module.css';
import styles from './WelcomeGuide.module.css';

export type GuideRole = 'vr' | 'monitor';

interface Props {
  /** Narrates the greeting in CAPCOM's recorded voice (falls back to the browser's TTS); null until the engine mounts. */
  app: LunarApp | null;
  onChoose: (role: GuideRole) => void;
}

const FOCUSABLE = 'button:not(:disabled)';

/**
 * First thing shown when the page opens: the Burrito espacial greets the visitor and asks whether they are
 * flying the mission in VR or watching it from Mission Control. The answer decides which dialog opens next
 * (the launch planner for VR, or the follow-mission code for Monitor).
 */
export default function WelcomeGuide({ app, onChoose }: Props) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>(FOCUSABLE)?.focus();
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const choose = (role: GuideRole) => {
    if (chosen) return;
    setChosen(true);
    // The click is the user gesture browsers require before any audio can play.
    app?.narrator.say('welcome');
    onChoose(role);
  };

  return (
    <>
      <div className={dialog.veil} data-level="welcome" aria-hidden="true" />
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialog.card}
        data-level="welcome"
        onKeyDown={trapTab}
      >
        <div className={styles.guide}>
          <span className={styles.avatar} aria-hidden="true">🫏</span>
          <div className={dialog.head}>
            <p className={dialog.eyebrow}>Burrito espacial</p>
            <h2 id={titleId} className={dialog.title}>Bienvenido a TOUCHDOWN</h2>
            <p className={dialog.lede}>Soy tu guía en esta misión. ¿Cuál es tu rol ahora?</p>
          </div>
        </div>

        <div className={styles.roles}>
          <button type="button" className={layer.btn} data-variant="primary" disabled={chosen} onClick={() => choose('vr')}>
            Voy en VR
          </button>
          <button type="button" className={layer.btn} disabled={chosen} onClick={() => choose('monitor')}>
            Sigo la misión (Monitor)
          </button>
        </div>
      </div>
    </>
  );
}
