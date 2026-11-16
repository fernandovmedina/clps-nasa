import * as THREE from 'three';
import type { Marker, MarkerKind } from '@touchdown/core';
import { UI, roundRect } from '../engine/panel';
import { palette } from '../ui/palette';
import { t } from '@/lib/i18n';
import { phasesWorldDict as D } from '@/lib/i18n/dicts/phases-world';

export interface PaperLine { text: string; size: number; weight?: number; /** Línea secundaria: tinta 2 en vez de tinta. */ muted?: boolean }

const PAPER_PAD_X = 22;
/** Los metros por pixel de una ficha salen de su ancho nominal sobre estos 512 px, como las fichas de siempre. */
const PAPER_NOMINAL_W = 512;
const PAPER_MIN_W = 96;
const PAPER_ACCENT_H = 5;

/** Color de estado para usarlo solo como detalle (filete) sobre papel: como texto no llega a 4.5:1. */
export function paperStatusColor(status: 'viable' | 'marginal' | 'bad'): string {
  return palette[status];
}

/** Fondo de papel opaco, borde fino de control y, si se pide, un filete de color de estado en el borde inferior. */
export function paintPaperChip(g: CanvasRenderingContext2D, w: number, h: number, accent?: string, radius = 18) {
  roundRect(g, 2, 2, w - 4, h - 4, radius);
  g.fillStyle = palette['bg-surface']; g.fill();
  g.strokeStyle = palette['control-border']; g.lineWidth = 2; g.stroke();
  if (accent) {
    roundRect(g, radius, h - 2 - 4 - PAPER_ACCENT_H, w - radius * 2, PAPER_ACCENT_H, PAPER_ACCENT_H / 2);
    g.fillStyle = accent; g.fill();
  }
}

/**
 * Ficha de papel dentro del 3D: fondo papel opaco, texto en tinta (tinta 2 si es secundario), borde fino y el color
 * de estado, del Sol o de la Tierra solo como filete. El lienzo se mide al texto; `widthM` fija la escala como en las
 * fichas de 512 px de siempre (metros por pixel = widthM / 512), así que el tamaño del texto no cambia.
 */
export type PaperOpts = { pad?: number; accent?: string; name?: string };

export function paperLabel(lines: PaperLine[], widthM: number, opts: PaperOpts = {}): THREE.Sprite {
  const pad = opts.pad ?? 18;
  const accentRoom = opts.accent ? PAPER_ACCENT_H + 6 : 0;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const fontOf = (l: PaperLine) => `${l.weight ?? 600} ${l.size}px ${UI.font}`;
  let widest = 0;
  for (const l of lines) {
    g.font = fontOf(l);
    const measured = Number(g.measureText(l.text).width);
    widest = Math.max(widest, Number.isFinite(measured) ? measured : l.text.length * l.size * 0.58);
  }
  const W = Math.max(PAPER_MIN_W, Math.ceil(widest + PAPER_PAD_X * 2));
  const H = Math.ceil(lines.reduce((a, l) => a + l.size * 1.3, 0) + pad * 2 + accentRoom);
  c.width = W; c.height = H; // redimensionar reinicia el contexto
  paintPaperChip(g, W, H, opts.accent);
  let y = pad;
  for (const l of lines) {
    g.font = fontOf(l);
    g.fillStyle = l.muted ? palette['label-2'] : palette.label; g.textBaseline = 'top'; g.textAlign = 'center';
    g.fillText(l.text, W / 2, y);
    y += l.size * 1.3;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, fog: false }));
  const mPerPx = widthM / PAPER_NOMINAL_W;
  sprite.scale.set(W * mPerPx, H * mPerPx, 1);
  sprite.renderOrder = 15;
  if (opts.name) sprite.name = opts.name;
  return sprite;
}

/**
 * Vuelve a pintar una ficha de papel con otras líneas, en el mismo sprite: conserva posición, nombre, orden de dibujo,
 * visibilidad y prueba de profundidad, cambia el mapa y la escala, y libera la textura vieja.
 */
export function relabelPaper(sprite: THREE.Sprite, lines: PaperLine[], widthM: number, opts: PaperOpts = {}) {
  const fresh = paperLabel(lines, widthM, opts);
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.map = (fresh.material as THREE.SpriteMaterial).map;
  mat.needsUpdate = true;
  sprite.scale.copy(fresh.scale);
  fresh.material.dispose();
}

const STYLE: Record<MarkerKind, { color: string; glyph: string }> = {
  rock: { color: palette.accent, glyph: '🪨' },
  slope: { color: palette.marginal, glyph: '⛰' },
  shadow: { color: palette.earth, glyph: '🌑' },
  other: { color: palette.bad, glyph: '⚠' },
};

/** Nombre del tipo de riesgo en el idioma actual: «Roca» / «Rock». */
export const markerLabel = (kind: MarkerKind) => t(D, `mk.${kind}` as const);

/** Las líneas de la ficha de un riesgo: el tipo con su glifo y, si la hay, la nota de quien lo marcó. */
function markerLines(m: Marker): PaperLine[] {
  const lines: PaperLine[] = [{ text: `${STYLE[m.kind].glyph} ${markerLabel(m.kind)}`, size: 32, weight: 800 }];
  if (m.note) lines.push({ text: m.note, size: 24, muted: true });
  return lines;
}

/**
 * Renders one site's risk markers as a ground ring + floating label, kept in
 * sync with LunarApp.markers (CLAUDE.md sec. 7: x_m/y_m are local metres,
 * east=+x, north=+y - this world's convention is north=-z, see pov.ts).
 */
export class MarkerField {
  private group = new THREE.Group();
  private byId = new Map<string, THREE.Object3D>();
  private labels = new Map<string, { sprite: THREE.Sprite; m: Marker }>();

  constructor(scene: THREE.Scene, private siteId: string, private heightAt: (x: number, z: number) => number) {
    scene.add(this.group);
  }

  /** Adds objects for new markers, removes objects for markers no longer in the list. */
  sync(markers: Marker[]) {
    const mine = markers.filter((m) => m.site_id === this.siteId);
    const seen = new Set(mine.map((m) => m.id));
    for (const [id, obj] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(obj);
      disposeMarkerObject(obj);
      this.byId.delete(id);
      this.labels.delete(id);
    }
    for (const m of mine) {
      if (!this.byId.has(m.id)) this.byId.set(m.id, this.build(m));
    }
  }

  private build(m: Marker): THREE.Object3D {
    const style = STYLE[m.kind];
    const x = m.x_m, z = -m.y_m; // contract north(+y_m) == this world's -z
    const g = new THREE.Group();
    g.position.set(x, this.heightAt(x, z), z);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 24),
      new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    const label = paperLabel(markerLines(m), 2.4, { accent: style.color });
    label.position.y = 1.7;
    g.add(label);
    this.labels.set(m.id, { sprite: label, m });

    this.group.add(g);
    return g;
  }

  /** El idioma cambió: cada ficha se vuelve a pintar con el nombre del tipo en el idioma nuevo. */
  relabel() {
    for (const { sprite, m } of this.labels.values()) relabelPaper(sprite, markerLines(m), 2.4, { accent: STYLE[m.kind].color });
  }

  dispose() {
    for (const obj of this.byId.values()) disposeMarkerObject(obj);
    this.byId.clear();
    this.labels.clear();
    this.group.removeFromParent();
  }
}

function disposeMarkerObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as Partial<THREE.Mesh & THREE.Sprite>;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial | THREE.SpriteMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
