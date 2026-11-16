'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DonkeyMood } from '@/lib/capcom/donkey';
import { DonkeyStage } from '@/lib/capcom/donkey-stage';
import type { LunarApp } from '@/lib/engine/app';
import { welcomeDict } from '@/lib/i18n/dicts/welcome';
import { useT } from '@/lib/i18n/react';
import dialog from './Dialog.module.css';
import layer from './MissionLayer.module.css';
import styles from './WelcomeGuide.module.css';

export type GuideRole = 'vr' | 'monitor';

interface Props {
  /** Narrates the greeting in CAPCOM's recorded voice (falls back to the browser's TTS); null until the engine mounts. */
  app: LunarApp | null;
  onChoose: (role: GuideRole) => void;
}

/** start: trying to speak; tap: the browser wants a gesture first; speaking: subtitle up; modal: the question. */
type Step = 'start' | 'tap' | 'speaking' | 'modal';

const FOCUSABLE = 'button:not(:disabled), a[href]';
const READY_WAIT_MS = 1500;
const NO_ENGINE_MS = 4000;
/** However it goes wrong (a clip that never resolves, a stuck TTS), the question appears this long after the voice was asked for. */
const SPEECH_CAP_MS = 15_000;
const SILENT_SUBTITLE_MS = 6500;
const MOOD: Record<Step, DonkeyMood> = { start: 'idle', tap: 'idle', speaking: 'speaking', modal: 'listening' };

interface Controls { skip: () => void; retry: () => void }

/**
 * First thing shown when the page opens: the Burrito espacial hops in, greets the visitor by voice (subtitled) and then
 * says what TOUCHDOWN is and offers the way in. The main action depends on the device: «Entrar en VR» when the browser
 * has WebXR immersive-vr, «Explorar la misión» (the same route, on screen) when it does not. Both answer 'vr'; the
 * secondary action, following someone's mission with their code, answers 'monitor'. Browsers keep audio locked until
 * the first gesture, so a blocked greeting waits for a tap; whatever happens, the buttons end up on screen.
 */
export default function WelcomeGuide({ app, onChoose }: Props) {
  const titleId = useId();
  const t = useT(welcomeDict);
  const card = useRef<HTMLDivElement>(null);
  const tapButton = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<Step>('start');
  const stepRef = useRef<Step>('start');
  const controls = useRef<Controls | null>(null);
  const chosen = useRef(false);
  const [done, setDone] = useState(false);
  const [hasVr, setHasVr] = useState(false);

  useEffect(() => {
    let alive = true;
    const xr = typeof navigator === 'undefined' ? undefined : navigator.xr;
    if (xr) xr.isSessionSupported('immersive-vr').then((ok) => { if (alive) setHasVr(ok); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const go = useCallback((next: Step) => {
    if (stepRef.current === 'modal') return;
    stepRef.current = next;
    setStep(next);
  }, []);

  const skip = useCallback(() => { if (controls.current) controls.current.skip(); else go('modal'); }, [go]);
  const retry = useCallback(() => controls.current?.retry(), []);

  useEffect(() => {
    if (stepRef.current === 'modal') return;
    let alive = true;
    let pending = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (ms: number, fn: () => void) => {
      const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms);
      timers.add(t);
      return t;
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    // The engine boots synchronously and can freeze the page for seconds, so by the time a limit is checked, whatever it
    // was waiting for (the engine's own state update, the clips' manifest) may be queued right behind it: give it a turn.
    const afterLimit = (ms: number, fn: () => void) => after(ms, () => after(0, fn));
    const openDialog = () => { clearTimers(); go('modal'); };

    if (!app) {
      controls.current = { skip: openDialog, retry: () => {} };
      afterLimit(NO_ENGINE_MS, openDialog);
      return () => { alive = false; clearTimers(); controls.current = null; };
    }

    let cap: ReturnType<typeof setTimeout> | undefined;
    const armCap = () => {
      if (cap) { clearTimeout(cap); timers.delete(cap); }
      cap = after(SPEECH_CAP_MS, () => { app.narrator.stop(); openDialog(); });
    };

    const say = (retrying: boolean) => {
      pending = true;
      armCap();
      void app.narrator.sayAndWait('welcome', () => { if (alive) { armCap(); go('speaking'); } }).then((outcome) => {
        pending = false;
        if (!alive) return;
        if (cap) { clearTimeout(cap); timers.delete(cap); }
        if (outcome === 'blocked' && !retrying) go('tap');
        else if (outcome === 'silent') { go('speaking'); after(SILENT_SUBTITLE_MS, openDialog); }
        else openDialog();
      });
    };

    controls.current = {
      skip: () => { app.narrator.stop(); openDialog(); },
      // Runs inside the click that asks for it: the browser only unlocks audio for a call made during the gesture.
      retry: () => { if (stepRef.current === 'tap') { go('start'); say(true); } },
    };

    const ready = new Promise<void>((resolve) => afterLimit(READY_WAIT_MS, resolve));
    void Promise.race([app.narrator.ready, ready]).then(() => {
      if (!alive) return;
      // The engine loop only passes the saved mute setting on to the narrator once it runs, which is after this.
      app.narrator.setMuted(app.audio.muted);
      say(false);
    });

    return () => {
      alive = false;
      clearTimers();
      controls.current = null;
      if (pending) app.narrator.stop();
    };
  }, [app, go]);

  useEffect(() => {
    if (step === 'modal') card.current?.querySelector<HTMLButtonElement>(FOCUSABLE)?.focus();
    else if (step === 'tap') tapButton.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === 'modal') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, skip]);

  const onVeil = () => {
    if (stepRef.current === 'tap') retry();
    else if (stepRef.current === 'speaking') skip();
  };

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !card.current) return;
    const items = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const choose = (role: GuideRole) => {
    if (chosen.current) return;
    chosen.current = true;
    setDone(true);
    app?.narrator.stop();
    onChoose(role);
  };

  return (
    <div className={styles.root} data-step={step}>
      <div className={dialog.veil} data-level="welcome" data-testid="welcome-veil" aria-hidden="true" onClick={onVeil} />
      <div className={styles.column}>
        <DonkeyView mood={MOOD[step]} />
        <div className={styles.live} aria-live="polite">
          {step === 'speaking' && <p className={styles.bubble}>{t('subtitle')}</p>}
        </div>
        {step === 'tap' && (
          <button ref={tapButton} type="button" className={`${layer.btn} ${styles.tap}`} data-variant="cta" onClick={retry}>
            {t('tap')}
          </button>
        )}
        {step === 'modal' && (
          <div
            ref={card}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`${dialog.card} ${styles.enter}`}
            data-level="welcome"
            onKeyDown={trapTab}
          >
            <div className={dialog.head}>
              <p className={dialog.eyebrow}>{t('eyebrow')}</p>
              <h2 id={titleId} className={dialog.title}>{t('title')}</h2>
              <p className={dialog.lede}>{t('lede')}</p>
            </div>
            <div className={styles.roles}>
              <button type="button" className={layer.btn} data-variant="cta" disabled={done} onClick={() => choose('vr')}>
                {hasVr ? t('enterVr') : t('explore')}
              </button>
              {!hasVr && <p className={styles.hint}>{t('vrHint')}</p>}
              <button type="button" className={layer.btn} disabled={done} onClick={() => choose('monitor')}>
                {t('follow')}
              </button>
            </div>
            <a className={styles.more} href="/mission-control/">{t('analysis')}</a>
          </div>
        )}
      </div>
      {step !== 'modal' && (
        <button type="button" className={`${layer.btn} ${styles.skip}`} onClick={skip}>{t('skip')}</button>
      )}
    </div>
  );
}

/**
 * The donkey's canvas is made here rather than in the markup: a canvas that has lost its WebGL context (what disposing
 * the stage does) cannot get a new one, so every mount needs a fresh element.
 */
function DonkeyView({ mood }: { mood: DonkeyMood }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<DonkeyStage | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const first = useRef(mood);

  useEffect(() => {
    const slot = host.current;
    if (!slot) return;
    const el = document.createElement('canvas');
    el.className = styles.canvas ?? '';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-testid', 'welcome-donkey');
    el.setAttribute('data-mood', first.current);
    slot.appendChild(el);
    const s = new DonkeyStage(el);
    slot.setAttribute('data-ok', String(s.ok));
    s.setMood(first.current);
    canvas.current = el;
    stage.current = s;
    return () => {
      stage.current = null;
      canvas.current = null;
      s.dispose();
      el.remove();
    };
  }, []);

  useEffect(() => {
    stage.current?.setMood(mood);
    canvas.current?.setAttribute('data-mood', mood);
  }, [mood]);

  return <div ref={host} className={styles.donkey} />;
}
