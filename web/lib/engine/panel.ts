import * as THREE from 'three';

/**
 * A flat UI panel drawn with Canvas2D and shown as a plane in the 3D world.
 * Works the same on desktop (mouse) and in VR (controller rays / hand pinch).
 */
export interface PanelButton {
  id: string; x: number; y: number; w: number; h: number;
  onClick: () => void;
}

export const UI = {
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
  bg: 'rgba(7,11,19,0.82)',
  line: 'rgba(255,255,255,0.12)',
  text: '#e8eef7',
  dim: 'rgba(232,238,247,0.6)',
  accent: '#ff9a3c',
};

export class Panel {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  buttons: PanelButton[] = [];
  hover: string | null = null;
  private dirty = true;

  constructor(
    readonly pxW: number,
    readonly pxH: number,
    widthM: number,
    private drawFn: (p: Panel, ctx: CanvasRenderingContext2D) => void,
    opts: { transparentBg?: boolean } = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, (widthM * pxH) / pxW), mat);
    this.mesh.renderOrder = 20;
    this.mesh.userData.panel = this;
    if (opts.transparentBg) this.mesh.userData.passThrough = true;
  }

  invalidate() { this.dirty = true; }

  /** Call once per frame; redraws only when something changed. */
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.buttons = [];
    this.ctx.clearRect(0, 0, this.pxW, this.pxH);
    this.drawFn(this, this.ctx);
    this.texture.needsUpdate = true;
  }

  /** Places the panel facing `eye` (both in the parent's local space). */
  place(x: number, y: number, z: number, eye = new THREE.Vector3(0, 1.6, 0)) {
    // orient in the parent's local frame so it keeps facing the viewer when the rig moves
    this.mesh.position.set(x, y, z);
    const m = new THREE.Matrix4().lookAt(eye, this.mesh.position, new THREE.Vector3(0, 1, 0));
    this.mesh.quaternion.setFromRotationMatrix(m);
    return this;
  }

  pointer(uv: THREE.Vector2, kind: 'move' | 'click') {
    const x = uv.x * this.pxW, y = (1 - uv.y) * this.pxH;
    const b = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
    if (kind === 'move') {
      const id = b?.id ?? null;
      if (id !== this.hover) { this.hover = id; this.invalidate(); }
      return !!b;
    }
    if (b) { b.onClick(); this.invalidate(); }
    return !!b;
  }
  leave() { if (this.hover) { this.hover = null; this.invalidate(); } }

  /* ---- drawing helpers ---- */
  frame(ctx: CanvasRenderingContext2D, x = 0, y = 0, w = this.pxW, h = this.pxH, r = 28) {
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r);
    ctx.fillStyle = UI.bg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = UI.line; ctx.stroke();
  }

  button(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, label: string,
    onClick: () => void, style: 'primary' | 'ghost' = 'primary') {
    const hov = this.hover === id;
    roundRect(ctx, x, y, w, h, h / 2);
    if (style === 'primary') { ctx.fillStyle = hov ? '#ffb46b' : UI.accent; ctx.fill(); }
    else { ctx.fillStyle = hov ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = style === 'primary' ? '#141008' : UI.text;
    ctx.font = `600 ${Math.round(h * 0.38)}px ${UI.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    this.buttons.push({ id, x, y, w, h, onClick });
  }

  /** Invisible clickable region (for list rows). */
  region(id: string, x: number, y: number, w: number, h: number, onClick: () => void) {
    this.buttons.push({ id, x, y, w, h, onClick });
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Sprite-like text label as a plane (always faces the viewer if billboard = true). */
export function textLabel(lines: { text: string; size: number; color?: string; weight?: number; mono?: boolean }[], widthM: number, pad = 18) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const W = 512;
  const H = lines.reduce((a, l) => a + l.size * 1.3, 0) + pad * 2;
  c.width = W; c.height = Math.ceil(H);
  roundRect(g, 2, 2, W - 4, c.height - 4, 22);
  g.fillStyle = 'rgba(7,11,19,0.78)'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.stroke();
  let y = pad;
  for (const l of lines) {
    g.font = `${l.weight ?? 600} ${l.size}px ${l.mono ? UI.mono : UI.font}`;
    g.fillStyle = l.color ?? UI.text; g.textBaseline = 'top'; g.textAlign = 'center';
    g.fillText(l.text, W / 2, y);
    y += l.size * 1.3;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, fog: false }));
  sprite.scale.set(widthM, (widthM * c.height) / W, 1);
  sprite.renderOrder = 15;
  return sprite;
}
