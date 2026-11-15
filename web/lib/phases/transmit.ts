import * as THREE from 'three';
import type { LunarApp, Phase } from '../engine/app';
import { Panel, UI, roundRect } from '../engine/panel';
import { Particles } from '../engine/particles';
import { glowTexture } from '../engine/textures';
import { clamp01, disposeTree, rand, smooth } from '../engine/util';
import { ensureSelection } from './pov';
import { surfaceFor, type SurfaceWorld } from './surface-world';
import { earthRangeKmAt } from '../mission/global-track';
import { fmtInt, fmtPercent, fmtSigned, signalDelayS, type HudReadout, type PhaseHud } from '../engine/hud';

const TX_SECONDS = 14;
const LIGHT_TIME_S = 384400 / 299792.458;

/** Animated energy beam between two points (additive, flowing stripes toward `to`). */
function beam(from: THREE.Vector3, to: THREE.Vector3, rFrom: number, rTo: number, color: number, stripe: number, speed: number) {
  const dir = to.clone().sub(from); const L = dir.length(); dir.normalize();
  const geo = new THREE.CylinderGeometry(rTo, rFrom, L, 32, 1, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, len: { value: L }, stripe: { value: stripe }, speed: { value: speed }, intensity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float time, len, stripe, speed, intensity; uniform vec3 color;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float d = vUv.y * len;                       // distance from 'from' (uv.y = 0 at bottom)
        float flow = pow(fract(d / stripe - time * speed / stripe), 6.0);
        float core = pow(abs(dot(vN, vV)), 1.6);
        float ends = smoothstep(0.0, 0.004, vUv.y) * (1.0 - smoothstep(0.985, 1.0, vUv.y));
        float a = (0.22 + 0.78 * flow) * core * ends * intensity;
        gl_FragColor = vec4(color * (0.7 + 0.6 * flow), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from).addScaledVector(dir, L / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return { mesh, mat, dir, len: L, from: from.clone() };
}

/** Phase 5 — successful landing: sunlight on the arrays, data beamed to Earth. */
export class TransmitPhase implements Phase {
  readonly name = 'transmit' as const;
  readonly scene: THREE.Scene;
  targets: THREE.Object3D[] = [];
  private world: SurfaceWorld;
  private t = 0;
  private fx = new THREE.Group();
  private beams: ReturnType<typeof beam>[] = [];
  private sunRays: ReturnType<typeof beam>[] = [];
  private packets: Particles;
  private focal: { sprite: THREE.Sprite; base: number; phase: number }[] = [];
  private rings: THREE.Mesh[] = [];
  private hud: Panel;
  private eyeBase: THREE.Vector3; private perp: THREE.Vector3;
  private dishWorld = new THREE.Vector3();
  private relay: THREE.Vector3 | null = null;
  private sent = 0;
  private chirpBin = -1;
  private uiT = 0;

  constructor(private app: LunarApp) {
    const m = ensureSelection(app);
    this.world = surfaceFor(app, m);
    this.scene = this.world.scene;
    const w = this.world, lz = w.lz;
    w.lander.visible = true;
    w.lander.position.copy(lz);
    w.lander.updateMatrixWorld(true);
    w.dish.getWorldPosition(this.dishWorld);

    // stand beside the lander on its sunlit side, so the beam crosses the view toward the Earth
    this.perp = new THREE.Vector3(-w.earthHoriz.z, 0, w.earthHoriz.x);
    const sunH = new THREE.Vector3(m.sun.local.x, 0, m.sun.local.z).normalize();
    if (this.perp.dot(sunH) < 0) this.perp.negate();
    const ex = lz.x - w.earthHoriz.x * 12 + this.perp.x * 17, ez = lz.z - w.earthHoriz.z * 12 + this.perp.z * 17;
    this.eyeBase = new THREE.Vector3(ex, w.heightAt(ex, ez) + app.eyeHeight, ez);

    const glow = glowTexture();
    // Earth link (direct, or through a relay satellite when Earth is below the horizon)
    const earthAim = w.earthPos.clone().sub(this.dishWorld).normalize();
    const earthR = 30000 * Math.tan(Math.PI / 180);
    const earthSpot = w.earthPos.clone().addScaledVector(earthAim, -earthR * 0.98);
    if (w.earthVisible) {
      this.beams.push(beam(this.dishWorld, earthSpot, 0.35, 260, 0x7fd0ff, 40, 420));
    } else {
      this.relay = new THREE.Vector3(lz.x, lz.y + 1900, lz.z).addScaledVector(w.earthHoriz, 1100);
      this.beams.push(beam(this.dishWorld, this.relay, 0.35, 12, 0x7fd0ff, 30, 260));
      this.beams.push(beam(this.relay, earthSpot, 4, 260, 0x7fd0ff, 60, 600));
      const sat = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xbfe6ff, blending: THREE.AdditiveBlending, depthWrite: false }));
      sat.position.copy(this.relay); sat.scale.setScalar(60); this.fx.add(sat);
    }
    this.beams.forEach((b) => this.fx.add(b.mesh));

    // sunlight converging on the solar arrays
    if (w.sunVisible > 0.15) {
      const sunDir = m.sun.local.clone();
      for (const p of w.solarPanels) {
        const c = new THREE.Vector3(); p.getWorldPosition(c);
        for (let k = 0; k < 3; k++) {
          const off = new THREE.Vector3(rand(-3, 3), rand(-1, 3), rand(-3, 3));
          const ray = beam(c.clone().addScaledVector(sunDir, 35).add(off), c, 0.4, 0.1, 0xffe2a6, 1.2, 9);
          this.sunRays.push(ray); this.fx.add(ray.mesh);
        }
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false }));
        glint.position.copy(c); this.fx.add(glint);
        this.focal.push({ sprite: glint, base: 1.4, phase: rand(0, 6) });
      }
    }

    // focal points: antenna and the receiving station on Earth
    const dishGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9fe0ff, blending: THREE.AdditiveBlending, depthWrite: false }));
    dishGlow.position.copy(this.dishWorld); this.fx.add(dishGlow);
    this.focal.push({ sprite: dishGlow, base: 1.2, phase: 0 });
    const earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    earthGlow.position.copy(earthSpot); this.fx.add(earthGlow);
    this.focal.push({ sprite: earthGlow, base: 900, phase: 1.5 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.position.copy(this.dishWorld); ring.userData.offset = i / 3;
      this.rings.push(ring); this.fx.add(ring);
    }

    this.packets = new Particles(700, glow, true);
    this.fx.add(this.packets.points);
    this.scene.add(this.fx);

    this.hud = new Panel(1024, 900, 0.64, (p, g) => this.drawHud(p, g));
    this.targets.push(this.hud.mesh);
  }

  enter() {
    this.world.lzMarker.visible = false;
    this.app.rig.add(this.hud.mesh);
    this.hud.place(-0.84, 1.36, -1.45);
    this.app.setView(this.eyeBase, this.lookAt(), { snap: true, rate: 2 });
  }

  private lookAt() {
    return this.world.lz.clone().add(new THREE.Vector3(0, 4, 0)).addScaledVector(this.world.earthHoriz, 9);
  }

  exit() {
    this.hud.dispose();
    this.scene.remove(this.fx); disposeTree(this.fx);
    this.world.lzMarker.visible = true;
  }

  update(dt: number, time: number) {
    this.t += dt;
    const t = this.t, w = this.world, app = this.app;
    w.update(dt, time);

    // gentle desktop orbit around the lander; static in VR
    const eye = this.eyeBase.clone();
    if (!app.isXR) {
      const a = Math.sin(t * 0.12) * 0.35;
      const rel = eye.clone().sub(w.lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      eye.copy(w.lz).add(rel); eye.y = w.heightAt(eye.x, eye.z) + app.eyeHeight + 1.5;
    }
    app.setView(eye, this.lookAt(), { rate: 2 });

    // ramp: sunlight first, then the link to Earth
    const sunOn = smooth(0.5, 2.5, t), linkOn = smooth(2.5, 4.5, t);
    this.sunRays.forEach((r) => { r.mat.uniforms.time.value = t; r.mat.uniforms.intensity.value = 0.4 * sunOn; });
    this.beams.forEach((b) => { b.mat.uniforms.time.value = t; b.mat.uniforms.intensity.value = 0.9 * linkOn; });
    w.solarPanels.forEach((p) => ((p.material as THREE.MeshStandardMaterial).emissiveIntensity = sunOn * w.sunVisible * (0.35 + 0.15 * Math.sin(t * 2))));

    this.focal.forEach((f) => {
      const k = 1 + 0.35 * Math.sin(t * 3 + f.phase);
      f.sprite.scale.setScalar(f.base * k * (f.base > 100 ? linkOn : 1));
      f.sprite.material.opacity = f.base > 100 ? linkOn : 0.9;
    });
    const camPos = new THREE.Vector3().setFromMatrixPosition(app.camera.matrixWorld);
    this.rings.forEach((r) => {
      const ph = (t * 0.7 + r.userData.offset) % 1;
      r.scale.setScalar(0.4 + ph * 3.5);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.8 * linkOn;
      r.lookAt(camPos);
    });

    // data packets flowing along the first beam (and on to Earth via relay if any)
    const transmitting = linkOn > 0.5 && this.sent < 1;
    if (transmitting) {
      for (const b of this.beams) {
        for (let i = 0, n = Math.floor(30 * dt + Math.random()); i < n; i++) {
          const sp = b === this.beams[0] ? rand(500, 800) : rand(4000, 6000);
          this.packets.emit({ x: b.from.x, y: b.from.y, z: b.from.z, vx: b.dir.x * sp, vy: b.dir.y * sp, vz: b.dir.z * sp,
            life: Math.min(b.len / sp, 6), drag: 0, lift: 0, s0: b === this.beams[0] ? 0.9 : 40, s1: b === this.beams[0] ? 6 : 200, a: 1, c0: [0.7, 0.95, 1], c1: [0.4, 0.8, 1] });
        }
      }
    }
    this.packets.update(dt, app.pointScale());
    if (linkOn > 0.5) this.sent = clamp01(this.sent + dt / TX_SECONDS);
    const bin = linkOn > 0.5 && this.sent < 1 ? Math.floor(this.sent * 16) : this.chirpBin;
    if (bin !== this.chirpBin) { this.chirpBin = bin; app.audio.play('transmit_chirp'); }
    if (this.sent >= 1 && this.chirpBin < 16) { this.chirpBin = 16; app.audio.play('success_chime'); }
    this.uiT += dt;
    if (this.uiT > 0.1) { this.uiT = 0; this.hud.invalidate(); }
    this.hud.update();
  }

  private drawHud(p: Panel, g: CanvasRenderingContext2D) {
    const m = this.world.m, w = this.world;
    p.frame(g);
    g.font = `800 64px ${UI.font}`; g.fillStyle = UI.ok; g.fillText('¡Alunizaje exitoso!', 48, 112);
    g.font = `600 30px ${UI.font}`; g.fillStyle = UI.text; g.fillText(m.site.name, 48, 166);
    g.font = `500 24px ${UI.mono}`; g.fillStyle = UI.dim;
    g.fillText(`${Math.abs(m.site.lat).toFixed(2)}°S ${m.site.lon.toFixed(2)}° · viabilidad ${Math.round(m.score)}%`, 48, 204);

    const done = this.sent >= 1;
    g.font = `700 30px ${UI.font}`; g.fillStyle = done ? UI.ok : UI.accent;
    g.fillText(done ? 'Telemetría recibida en la Tierra' : this.relay ? 'Transmitiendo vía satélite de relevo…' : 'Transmitiendo directo a la Tierra…', 48, 278);
    roundRect(g, 48, 300, 928, 14, 7); g.fillStyle = 'rgba(250,249,245,.14)'; g.fill();
    if (this.sent > 0.005) { roundRect(g, 48, 300, 928 * this.sent, 14, 7); g.fillStyle = UI.accent; g.fill(); }
    g.font = `700 26px ${UI.mono}`; g.fillStyle = UI.text; g.textAlign = 'right'; g.fillText(`${Math.round(this.sent * 100)}%`, 976, 350); g.textAlign = 'left';

    const rows: [string, string][] = [
      ['Enlace', this.relay ? 'Relevo orbital (Tierra bajo el horizonte)' : `Directo · Tierra a ${m.earth.elevation.toFixed(1)}°`],
      ['Retardo de la señal', `${LIGHT_TIME_S.toFixed(2)} s`],
      ['Paquetes enviados', `${Math.round(this.sent * 4096).toLocaleString('en-US')} / 4,096`],
      ['Energía solar', w.sunVisible > 0.15 ? `${m.powerPct}% · Sol a ${m.sun.elevation.toFixed(1)}°` : 'En sombra · baterías'],
      ['Ventana restante', m.earth.aboveHorizon > 0 ? `${Math.round(m.hoursToEarthset)} h de comunicación` : '—'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 420 + i * 62;
      g.font = `500 26px ${UI.font}`; g.fillStyle = UI.dim; g.fillText(k, 48, y);
      g.font = `600 26px ${UI.mono}`; g.fillStyle = UI.text; g.textAlign = 'right'; g.fillText(v, 976, y); g.textAlign = 'left';
    });
    p.button(g, 'again', 48, 760, 440, 96, 'Repetir misión', () => this.app.goTo('launch', 1.0, 1.2), 'ghost');
    p.button(g, 'other', 536, 760, 440, 96, 'Otro sitio', () => this.app.goTo('orbit', 0.8, 1.0));
  }

  controlHud(): PhaseHud {
    const m = this.world.m, w = this.world;
    const done = this.sent >= 1;
    const data = this.app.data;
    const rangeKm = data ? earthRangeKmAt(data.global, data.landingDate) : null;
    const items: HudReadout[] = [
      { label: 'Enlace', value: this.relay ? 'Relevo orbital' : 'Directo con la Tierra' },
      { label: 'Elevación de la Tierra', value: `${fmtSigned(m.earth.elevation, 2)}° · ${w.earthVisible ? 'visible' : 'bajo el horizonte'}` },
    ];
    if (rangeKm !== null) {
      items.push(
        { label: 'Distancia Tierra–Luna', value: `${fmtInt(rangeKm)} km` },
        { label: 'Retardo de la señal', value: `${signalDelayS(rangeKm).toFixed(2)} s` },
      );
    }
    return {
      figure: { value: fmtPercent(this.sent * 100), caption: 'de la telemetría enviada', badge: { label: 'Alunizaje exitoso', tone: 'ok' } },
      progress: { value: this.sent, label: 'Telemetría enviada' },
      facts: [
        { label: 'Paquetes enviados', value: `${fmtInt(this.sent * 4096)} / 4 096` },
        { label: 'Energía solar', value: w.sunVisible > 0.15 ? `${m.powerPct} % · Sol a ${m.sun.elevation.toFixed(1)}°` : 'En sombra · baterías' },
        { label: 'Ventana restante', value: m.earth.aboveHorizon > 0 ? `${Math.round(m.hoursToEarthset)} h de comunicación` : '—' },
      ],
      detail: done ? 'Telemetría recibida en la Tierra' : this.relay ? 'Transmitiendo vía satélite de relevo…' : 'Transmitiendo directo a la Tierra…',
      side: { kind: 'readouts', items, note: rangeKm !== null ? 'El retardo sale de la distancia real a la fecha de aterrizaje y la velocidad de la luz.' : undefined },
      secondary: [
        { id: 'again', label: 'Repetir misión', run: () => this.app.goTo('launch', 1.0, 1.2) },
        { id: 'other', label: 'Otro sitio', run: () => this.app.goTo('orbit', 0.8, 1.0) },
      ],
      primary: { id: 'report', label: 'Ver reporte en Mission Control', href: '/mission-control/' },
    };
  }
}
