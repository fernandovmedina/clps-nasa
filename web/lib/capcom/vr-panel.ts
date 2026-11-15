import type { LunarApp } from '../engine/app';
import { Panel, UI } from '../engine/panel';
import type { CapcomController, CapcomSnapshot } from './controller';
import { DonkeyGuide, donkeyMood } from './donkey';

const W = 560;
const H = 250;
const WIDTH_M = 0.42;
const DISTANCE_M = 1.2;
const DEPRESSION_DEG = 28;
const AZIMUTH_DEG = 24;
const BODY_LINES = 4;
/** The donkey stands just outside the panel's right edge, feet level with its bottom, turned a bit toward the text. */
const DONKEY_GAP_M = 0.07;
const DONKEY_TURN_RAD = -0.3;

export const NEEDS_MIC_TEXT = 'Activa CAPCOM antes de entrar en VR';

export interface PanelText {
  status: string;
  tone: 'ok' | 'warn' | 'bad' | 'dim';
  body: string;
  hint: string;
}

/** What the in-headset panel says for a given CAPCOM state. */
export function describePanel(snap: CapcomSnapshot): PanelText {
  if (snap.state === 'unavailable') return { status: 'CAPCOM no disponible', tone: 'bad', body: '', hint: '' };
  const needsMic = snap.mic !== 'granted' && !snap.talking && (snap.state === 'disconnected' || snap.state === 'error');
  if (needsMic) return { status: 'Sin micrófono', tone: 'warn', body: NEEDS_MIC_TEXT, hint: 'Permite el micrófono en la página y vuelve a entrar.' };
  if (snap.state === 'error') return { status: 'Sin conexión', tone: 'bad', body: snap.message ?? '', hint: 'Mantén A para reintentar' };
  const status = snap.talking ? 'Escuchando…'
    : snap.state === 'connecting' ? 'Conectando…'
    : snap.state === 'thinking' ? 'Pensando…'
    : snap.state === 'speaking' ? 'Hablando…'
    : snap.state === 'listening' ? 'Listo' : 'En espera';
  const tone = snap.talking || snap.state === 'speaking' ? 'ok' : 'dim';
  return { status, tone, body: snap.answer || snap.question, hint: 'Mantén A para hablar' };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Small panel next to the pause / stop panel: CAPCOM's state and its last subtitle, plus the right A button as the
 * hold-to-talk control (and a toggle button for hand tracking), with the Burro Pardo donkey hopping beside it as the
 * face of the voice assistant. Returns the function that removes it.
 */
export function mountCapcomVrPanel(app: LunarApp, controller: CapcomController): () => void {
  const panel = new Panel(W, H, WIDTH_M, (p, g) => {
    const snap = controller.getSnapshot();
    const text = describePanel(snap);
    p.frame(g, 0, 0, W, H, 24);
    g.font = `600 22px ${UI.font}`; g.fillStyle = UI.dim; g.fillText('CAPCOM', 28, 44);
    g.font = `600 24px ${UI.font}`; g.fillStyle = UI[text.tone === 'dim' ? 'text' : text.tone]; g.textAlign = 'right';
    g.fillText(text.status, W - 28, 44); g.textAlign = 'left';
    g.font = `500 28px ${UI.font}`; g.fillStyle = UI.text;
    const lines = wrap(g, text.body, W - 56);
    lines.slice(-BODY_LINES + 1).forEach((line, i) => g.fillText(line, 28, 88 + i * 36));
    if (text.hint) { g.font = `500 22px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(text.hint, 28, H - 22); }
    if (snap.state !== 'unavailable') {
      p.button(g, 'talk', W - 196, H - 70, 168, 52, snap.talking ? 'Soltar' : 'Hablar', () => (snap.talking ? controller.release() : controller.press()), snap.talking ? 'primary' : 'ghost');
    }
  });
  const a = (DEPRESSION_DEG * Math.PI) / 180;
  const z = (AZIMUTH_DEG * Math.PI) / 180;
  panel.place(
    DISTANCE_M * Math.cos(a) * Math.sin(z),
    app.eyeHeight - DISTANCE_M * Math.sin(a),
    -DISTANCE_M * Math.cos(a) * Math.cos(z),
  );

  // Child of the panel: it faces the viewer with it and hides with it outside VR.
  const donkey = new DonkeyGuide().load();
  donkey.group.position.set(WIDTH_M / 2 + DONKEY_GAP_M, -(WIDTH_M * H) / W / 2, 0.02);
  donkey.group.rotation.y = DONKEY_TURN_RAD;
  donkey.setMood(donkeyMood(controller.getSnapshot()));
  panel.mesh.add(donkey.group);

  // Panels redraw from the frame loop; this one is owned here, so it redraws when it is about to be drawn.
  panel.mesh.onBeforeRender = () => { panel.update(); donkey.update(performance.now() / 1000); };
  app.rig.add(panel.mesh);
  app.globalTargets.push(panel.mesh);

  const offState = controller.subscribe(() => { panel.invalidate(); donkey.setMood(donkeyMood(controller.getSnapshot())); });
  const offButton = app.input.onAButton((held) => (held ? controller.press() : controller.release()));
  return () => {
    offState();
    offButton();
    const at = app.globalTargets.indexOf(panel.mesh);
    if (at >= 0) app.globalTargets.splice(at, 1);
    donkey.dispose();
    panel.dispose();
  };
}
