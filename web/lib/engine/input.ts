import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { LunarApp } from './app';
import type { Panel } from './panel';

interface Hit { panel?: Panel; uv?: THREE.Vector2; obj?: THREE.Object3D; distance: number }

/**
 * Unified pointer input:
 *  - Desktop: mouse/touch ray from the camera (drag = look around, click = select)
 *  - Quest 3S: controller rays (trigger) or hand-tracking pinch, both arrive as `select`
 * Selectable things are panels (userData.panel) or objects with userData.onSelect.
 */
export class Input {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private mouseIn = false;
  private down: { x: number; y: number } | null = null;
  private dragging = false;
  private hoverPanel: Panel | null = null;
  private hoverObj: THREE.Object3D | null = null;
  readonly controllers: THREE.XRTargetRaySpace[] = [];
  /** Controller 3D models (not just the ray line) - a spy-view capture must hide these too. */
  readonly grips: THREE.XRGripSpace[] = [];
  private lines: THREE.Line[] = [];

  constructor(private app: LunarApp) {
    const el = app.renderer.domElement;
    this.ray.camera = app.camera; // needed to raycast sprites (site labels)
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', () => { this.mouseIn = false; this.down = null; this.clearHover(); });

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffc58a, transparent: true, opacity: 0.8 });
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const c = app.renderer.xr.getController(i);
      const line = new THREE.Line(lineGeo, lineMat);
      line.scale.z = 5;
      c.add(line);
      // handedness: used by avatar.ts to attach the right/left IK arm to the right/left controller.
      c.addEventListener('connected', (e) => { c.userData.connected = true; c.userData.handedness = e.data.handedness; });
      c.addEventListener('disconnected', () => { c.userData.connected = false; c.userData.handedness = undefined; });
      c.addEventListener('select', () => this.activate(this.castFrom(c)));
      app.rig.add(c);
      this.controllers.push(c); this.lines.push(line);
      const grip = app.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      app.rig.add(grip);
      this.grips.push(grip);
    }
  }

  dispose() {
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointerup', this.onUp);
  }

  private setNdc(e: PointerEvent) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  private onMove = (e: PointerEvent) => {
    this.mouseIn = true; this.setNdc(e);
    if (this.down) {
      const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
      if (!this.dragging && Math.hypot(dx, dy) > 6) this.dragging = true;
      if (this.dragging) { this.app.lookDrag(e.movementX, e.movementY); }
    }
  };
  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; this.dragging = false; this.setNdc(e); };
  private onUp = (e: PointerEvent) => {
    if (this.down && !this.dragging) { this.setNdc(e); this.activate(this.castCamera()); }
    this.down = null; this.dragging = false;
  };

  private castCamera() {
    this.ray.setFromCamera(this.ndc, this.app.camera);
    return this.cast();
  }
  private castFrom(c: THREE.Object3D) {
    c.updateMatrixWorld();
    const o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
    this.ray.set(o, d);
    return this.cast();
  }
  private cast(): Hit | null {
    const targets = [...(this.app.phase?.targets ?? []), ...this.app.globalTargets];
    if (!targets.length) return null;
    const hits = this.ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if (!isVisible(o)) continue;
      while (o) {
        if (o.userData.panel && !o.userData.passThrough) return { panel: o.userData.panel, uv: h.uv, distance: h.distance };
        if (o.userData.onSelect) return { obj: o, distance: h.distance };
        if (o.userData.blocker) return null;
        o = o.parent;
      }
    }
    return null;
  }

  private activate(hit: Hit | null) {
    if (!hit) return;
    if (hit.panel && hit.uv) hit.panel.pointer(hit.uv, 'click');
    else hit.obj?.userData.onSelect?.();
  }

  private applyHover(hit: Hit | null) {
    const panel = hit?.panel ?? null;
    if (this.hoverPanel && this.hoverPanel !== panel) this.hoverPanel.leave();
    this.hoverPanel = panel;
    let overButton = false;
    if (panel && hit?.uv) overButton = panel.pointer(hit.uv, 'move');
    const obj = hit?.obj ?? null;
    if (obj !== this.hoverObj) {
      this.hoverObj?.userData.onHover?.(false);
      obj?.userData.onHover?.(true);
      this.hoverObj = obj;
    }
    if (!this.app.isXR) this.app.renderer.domElement.style.cursor = overButton || obj ? 'pointer' : this.down ? 'grabbing' : 'grab';
  }
  private clearHover() { this.applyHover(null); }

  update() {
    if (this.app.isXR) {
      let best: Hit | null = null;
      this.controllers.forEach((c, i) => {
        const line = this.lines[i];
        if (!c.userData.connected) return;
        const hit = this.castFrom(c);
        line.scale.z = hit ? hit.distance / this.app.rig.scale.z : 5;
        if (hit && !best) best = hit;
      });
      this.applyHover(best);
    } else if (this.mouseIn && !this.dragging) {
      this.applyHover(this.castCamera());
    }
  }
}

function isVisible(o: THREE.Object3D | null) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
