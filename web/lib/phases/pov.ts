import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import { Panel, UI, roundRect } from '../engine/panel';
import { evaluateSites, fmtHours, scoreColor, skyPosAt, type SiteMetrics } from '../mission/scoring';
import { defaultMission } from './orbit';
import { surfaceFor, type SurfaceWorld } from './surface-world';

export function ensureSelection(app: LunarApp): SiteMetrics {
  if (!app.data) app.data = defaultMission();
  if (!app.ranking.length) app.ranking = evaluateSites(app.data.sites, app.data.landingDate);
  if (!app.selected) app.selected = app.ranking[0];
  return app.selected;
}

interface Sample { sun: number; earth: number; hSun: number; hEarth: number }

/** Phase 3 — stand on the candidate site, see the landing zone, Sun/Earth and the 14-day outlook. */
export class PovPhase implements Phase {
  readonly name = 'pov' as const;
  readonly scene: THREE.Scene;
  targets: THREE.Object3D[] = [];
  private world: SurfaceWorld;
  private m: SiteMetrics;
  private info: Panel; private actions: Panel;
  private series: Sample[] = [];
  private eye: THREE.Vector3;

  constructor(private app: LunarApp) {
    this.m = ensureSelection(app);
    this.world = surfaceFor(app, this.m);
    this.scene = this.world.scene;
    this.eye = new THREE.Vector3(0, this.world.heightAt(0, 0) + app.eyeHeight, 0);

    const start = app.data!.landingDate.getTime();
    for (let h = 0; h <= 14 * 24; h += 2) {
      const d = new Date(start + h * 3600000);
      const { sun: s, earth: e } = skyPosAt(this.m.site, d);
      this.series.push({ sun: s.elevation, earth: e.elevation, hSun: s.elevation - s.aboveHorizon, hEarth: e.elevation - e.aboveHorizon });
    }

    this.info = new Panel(1024, 1240, 0.66, (p, g) => this.drawInfo(p, g));
    this.actions = new Panel(1024, 760, 0.56, (p, g) => this.drawActions(p, g));
    this.targets.push(this.info.mesh, this.actions.mesh);
  }

  enter() {
    this.world.lander.visible = false;
    this.world.lzMarker.visible = true;
    this.app.rig.add(this.info.mesh, this.actions.mesh);
    this.info.place(-0.86, 1.4, -1.45);
    this.actions.place(0.84, 1.28, -1.45);
    const look = this.world.lz.clone().add(new THREE.Vector3(0, 3, 0));
    this.app.setView(this.eye, look, { snap: true, rate: 3 });
  }

  exit() { this.info.dispose(); this.actions.dispose(); }

  update(dt: number, t: number) {
    this.world.update(dt, t);
    this.app.setView(this.eye, this.world.lz.clone().add(new THREE.Vector3(0, 3, 0)), { rate: 3 });
    this.info.update(); this.actions.update();
  }

  private drawInfo(p: Panel, g: CanvasRenderingContext2D) {
    const m = this.m;
    p.frame(g);
    g.font = `600 24px ${UI.mono}`; g.fillStyle = UI.accent; g.fillText('VISTA DESDE EL SITIO · PRECONFIRMACIÓN', 48, 70);
    g.font = `700 46px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 48, 128);
    g.font = `500 24px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`${Math.abs(m.site.lat).toFixed(2)}°S ${m.site.lon.toFixed(2)}°  ·  ${this.app.data!.landingDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`, 48, 166);

    const rows: [string, string, string?][] = [
      ['Sol · elevación / azimut', `${m.sun.elevation.toFixed(2)}° / ${m.sun.azimuth.toFixed(0)}°`, '#ffd27a'],
      ['Sol sobre el horizonte local', `${m.sun.aboveHorizon >= 0 ? '+' : ''}${m.sun.aboveHorizon.toFixed(2)}°`],
      ['Tiempo hasta la puesta de sol', m.sun.aboveHorizon > -0.27 ? fmtHours(m.hoursToSunset) : 'en sombra'],
      ['Tierra · elevación / azimut', `${m.earth.elevation.toFixed(2)}° / ${m.earth.azimuth.toFixed(0)}°`, '#8ec5ff'],
      ['Ventana de comunicación', m.earth.aboveHorizon > 0 ? `${fmtHours(m.hoursToEarthset)} restantes` : 'requiere relevo'],
      ['Potencia solar (panel vertical)', `${m.powerPct}%`],
      ['Temperatura estimada', `${m.tempC.toFixed(0)} °C`],
      ['Rugosidad zona de alunizaje', `${this.world.roughness.toFixed(2)} m`],
    ];
    rows.forEach(([k, v, c], i) => {
      const y = 228 + i * 62;
      g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k, 48, y);
      g.font = `700 30px ${UI.mono}`; g.fillStyle = c ?? UI.text; g.textAlign = 'right'; g.fillText(v, 976, y); g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(48, y + 18, 928, 2);
    });

    // 14-day outlook chart: Sun and Earth elevation vs the local horizon
    const x0 = 80, x1 = 976, y0 = 760, y1 = 1150, lo = -4, hi = 9;
    const X = (i: number) => x0 + (i / (this.series.length - 1)) * (x1 - x0);
    const Y = (e: number) => y1 - ((Math.max(lo, Math.min(hi, e)) - lo) / (hi - lo)) * (y1 - y0);
    g.font = `600 24px ${UI.mono}`; g.fillStyle = UI.dim; g.fillText('PRÓXIMOS 14 DÍAS · ELEVACIÓN (°)', 48, 735);
    roundRect(g, x0, y0, x1 - x0, y1 - y0, 10); g.fillStyle = 'rgba(255,255,255,.04)'; g.fill();
    g.font = `500 20px ${UI.mono}`;
    for (let e = lo; e <= hi; e += 2) {
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, Y(e), x1 - x0, 1);
      g.fillStyle = UI.dim; g.textAlign = 'right'; g.fillText(`${e}`, x0 - 10, Y(e) + 7); g.textAlign = 'left';
    }
    for (let d = 0; d <= 14; d += 2) { g.fillStyle = UI.dim; g.fillText(`d${d}`, X((d * 12)) - 12, y1 + 30); }
    // sunlit shading
    this.series.forEach((s, i) => {
      if (s.sun > s.hSun - 0.27) { g.fillStyle = 'rgba(255,200,90,.08)'; g.fillRect(X(i), y0, (x1 - x0) / this.series.length + 1, y1 - y0); }
    });
    const curve = (key: 'sun' | 'earth' | 'hSun', color: string, dash: number[] = [], w = 4) => {
      g.beginPath(); this.series.forEach((s, i) => (i ? g.lineTo(X(i), Y(s[key])) : g.moveTo(X(i), Y(s[key]))));
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = w; g.stroke(); g.setLineDash([]);
    };
    curve('hSun', 'rgba(255,255,255,.45)', [8, 8], 3);
    curve('earth', '#8ec5ff');
    curve('sun', '#ffd27a');
    g.font = `600 22px ${UI.font}`;
    g.fillStyle = '#ffd27a'; g.fillText('■ Sol', x0 + 12, y0 + 32);
    g.fillStyle = '#8ec5ff'; g.fillText('■ Tierra', x0 + 110, y0 + 32);
    g.fillStyle = UI.dim; g.fillText('- - horizonte local', x0 + 240, y0 + 32);
    g.fillStyle = 'rgba(255,200,90,.7)'; g.fillText('▒ iluminado', x0 + 470, y0 + 32);
  }

  private drawActions(p: Panel, g: CanvasRenderingContext2D) {
    const m = this.m, col = scoreColor(m.score);
    p.frame(g);
    g.font = `600 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText('Viabilidad del sitio', 48, 76);
    g.font = `800 120px ${UI.mono}`; g.fillStyle = col; g.fillText(`${Math.round(m.score)}%`, 48, 200);
    g.font = `600 30px ${UI.font}`; g.fillStyle = UI.text; g.fillText(`#${m.rank} del ranking`, 520, 150);
    g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim;
    g.fillText('Mira a tu alrededor: el anillo verde', 48, 270);
    g.fillText('marca la zona donde alunizarás.', 48, 306);
    p.button(g, 'confirm', 48, 380, 928, 110, 'Confirmar alunizaje', () => this.app.goTo('landing', 0.8, 1.0));
    p.button(g, 'back', 48, 520, 928, 96, 'Elegir otro sitio', () => this.app.goTo('orbit', 0.7, 1.0), 'ghost');
  }
}
