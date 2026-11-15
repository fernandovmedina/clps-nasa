import * as THREE from 'three';
import type { Marker, MarkerKind } from '@touchdown/core';
import { UI, textLabel } from '../engine/panel';

const STYLE: Record<MarkerKind, { color: string; glyph: string; label: string }> = {
  rock: { color: '#C9A26B', glyph: '🪨', label: 'Roca' },
  slope: { color: UI.warn, glyph: '⛰', label: 'Pendiente' },
  shadow: { color: UI.earth, glyph: '🌑', label: 'Sombra' },
  other: { color: UI.bad, glyph: '⚠', label: 'Otro' },
};

/**
 * Renders one site's risk markers as a ground ring + floating label, kept in
 * sync with LunarApp.markers (CLAUDE.md sec. 7: x_m/y_m are local metres,
 * east=+x, north=+y - this world's convention is north=-z, see pov.ts).
 */
export class MarkerField {
  private group = new THREE.Group();
  private byId = new Map<string, THREE.Object3D>();

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

    const lines: { text: string; size: number; color?: string; weight?: number; mono?: boolean }[] = [
      { text: `${style.glyph} ${style.label}`, size: 32, color: style.color, weight: 800, mono: true },
    ];
    if (m.note) lines.push({ text: m.note, size: 24 });
    const label = textLabel(lines, 2.4);
    label.position.y = 1.7;
    g.add(label);

    this.group.add(g);
    return g;
  }

  dispose() {
    for (const obj of this.byId.values()) disposeMarkerObject(obj);
    this.byId.clear();
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
