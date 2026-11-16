import type { LunarApp } from './app';
import { t } from '@/lib/i18n';
import { enginePanelsDict as d } from '@/lib/i18n/dicts/engine-panels';
import { Panel, UI, roundRect } from './panel';

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
      g.fillText(t(d, 'stopped'), W / 2, 66);
      g.textAlign = 'left';
      p.button(g, 'restart', 40, 96, W - 80, 76, t(d, 'restart'), () => app.restart());
      return;
    }
    const paused = app.run.paused;
    if (!paused && app.awaitingStart) {
      roundRect(g, 24, 52, 280, 96, 48); g.fillStyle = UI.raised; g.fill();
      g.strokeStyle = UI.line; g.lineWidth = 2; g.stroke();
      g.font = `600 36px ${UI.font}`; g.fillStyle = UI.dim; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t(d, 'pause'), 164, 101); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    } else {
      p.button(g, 'pause', 24, 52, 280, 96, t(d, paused ? 'resume' : 'pause'), () => app.setPaused(!paused), paused ? 'cta' : 'ghost');
    }
    p.button(g, 'stop', 336, 52, 280, 96, t(d, 'stop'), () => app.stop(), 'ghost');
  });
  const a = (DEPRESSION_DEG * Math.PI) / 180;
  panel.place(0, app.eyeHeight - DISTANCE_M * Math.sin(a), -DISTANCE_M * Math.cos(a));
  return panel;
}
