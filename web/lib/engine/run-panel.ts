import type { LunarApp } from './app';
import { Panel, UI } from './panel';

const W = 640, H = 200;
const WIDTH_M = 0.5;
const DISTANCE_M = 1.2;
const DEPRESSION_DEG = 32;

/** In-headset pause / stop controls: small, centred and below the line of sight. */
export function createRunPanel(app: LunarApp) {
  const panel = new Panel(W, H, WIDTH_M, (p, g) => {
    p.frame(g, 0, 0, W, H, 24);
    if (app.run.stopped) {
      g.font = `600 30px ${UI.font}`; g.fillStyle = UI.text; g.textAlign = 'center';
      g.fillText('Misión detenida', W / 2, 66);
      g.textAlign = 'left';
      p.button(g, 'restart', 40, 96, W - 80, 76, 'Reiniciar desde el despegue', () => app.restart());
      return;
    }
    const paused = app.run.paused;
    p.button(g, 'pause', 24, 52, 280, 96, paused ? 'Reanudar' : 'Pausar', () => app.setPaused(!paused), paused ? 'primary' : 'ghost');
    p.button(g, 'stop', 336, 52, 280, 96, 'Detener', () => app.stop(), 'ghost');
  });
  const a = (DEPRESSION_DEG * Math.PI) / 180;
  panel.place(0, app.eyeHeight - DISTANCE_M * Math.sin(a), -DISTANCE_M * Math.cos(a));
  return panel;
}
