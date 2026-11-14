'use client';

import { useEffect, useRef, useState } from 'react';
import { LunarApp, type PhaseName } from '@/lib/engine/app';
import { LaunchPhase } from '@/lib/phases/launch';
import { OrbitPhase } from '@/lib/phases/orbit';
import { PovPhase } from '@/lib/phases/pov';
import { LandingPhase } from '@/lib/phases/landing';
import { TransmitPhase } from '@/lib/phases/transmit';
import { loadMissionData } from '@/lib/mission/sites';
import styles from './LunarExperience.module.css';

const PHASES: { id: PhaseName; label: string }[] = [
  { id: 'launch', label: 'Despegue' },
  { id: 'orbit', label: 'Órbita y ranking' },
  { id: 'pov', label: 'Vista del sitio' },
  { id: 'landing', label: 'Alunizaje' },
  { id: 'transmit', label: 'Transmisión' },
];

export default function LunarExperience() {
  const mount = useRef<HTMLDivElement>(null);
  const appRef = useRef<LunarApp | null>(null);
  const [phase, setPhase] = useState<PhaseName>('launch');
  const [xr, setXr] = useState<'checking' | 'yes' | 'no'>('checking');
  const [inVR, setInVR] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('phase') as PhaseName | null;
    const app = new LunarApp(el, {
      // ⬇️ Replace loadMissionData with your real fetches (JPL Horizons, LOLA, your API)
      loadData: loadMissionData,
      onPhase: setPhase,
      startPhase: q && PHASES.some((p) => p.id === q) ? q : undefined,
      timeScale: Number(params.get('speed')) || 1,
    });
    app.register('launch', (a) => new LaunchPhase(a));
    app.register('orbit', (a) => new OrbitPhase(a));
    app.register('pov', (a) => new PovPhase(a));
    app.register('landing', (a) => new LandingPhase(a));
    app.register('transmit', (a) => new TransmitPhase(a));
    app.start().catch((e) => setError(String(e)));
    appRef.current = app;

    const onStart = () => setInVR(true);
    const onEnd = () => setInVR(false);
    app.renderer.xr.addEventListener('sessionstart', onStart);
    app.renderer.xr.addEventListener('sessionend', onEnd);

    if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => setXr(ok ? 'yes' : 'no')).catch(() => setXr('no'));
    else setXr('no');

    return () => {
      app.renderer.xr.removeEventListener('sessionstart', onStart);
      app.renderer.xr.removeEventListener('sessionend', onEnd);
      app.dispose();
      appRef.current = null;
    };
  }, []);

  const enterVR = async () => {
    try { await appRef.current?.enterVR(); } catch (e) { setError(`No se pudo iniciar VR: ${String(e)}`); }
  };

  return (
    <div className={styles.root}>
      <div ref={mount} className={styles.canvas} />
      {!inVR && (
        <>
          <div className={styles.topbar}>
            <ol className={styles.steps} aria-label="Fases de la misión">
              {PHASES.map((p, i) => (
                <li key={p.id} className={p.id === phase ? styles.active : PHASES.findIndex((x) => x.id === phase) > i ? styles.done : ''}>
                  <span>{i + 1}</span>{p.label}
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.bottombar}>
            <span className={styles.hint}>Arrastra para mirar · clic en paneles y puntos para seleccionar</span>
            {xr === 'yes' && <button className={styles.vr} onClick={enterVR}>Entrar en VR</button>}
            {xr === 'no' && <span className={styles.novr}>VR no disponible aquí · ábrelo en el navegador del Quest (HTTPS)</span>}
          </div>
        </>
      )}
      {error && <div role="alert" className={styles.error}>{error}</div>}
    </div>
  );
}
