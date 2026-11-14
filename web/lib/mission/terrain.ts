/**
 * Real LOLA heightmap (RAW16 little-endian) for sites with `has_terrain`.
 *
 * Pixel orientation (must match `pipeline/src/touchdown_pipeline/lola.py`
 * `export_terrain_patch`, which is the ground truth): row 0 = north edge,
 * last row = south edge; col 0 = west edge, last col = east edge. Combined
 * with this app's local frame (x = east, z = -north, see
 * `web/lib/mission/scoring.ts`), both axes map the same way:
 *   col = (x_local + extent/2) / cellM
 *   row = (z_local + extent/2) / cellM
 * (because z_local = -north_m, and row grows as north_m shrinks).
 */
import type { TerrainInfo } from '@touchdown/core';

export interface TerrainPatch {
  info: TerrainInfo;
  /** Meters, relative to the real height AT the site's own position (site_px). */
  heights: Float32Array;
  cellM: number;
}

export async function loadTerrainPatch(info: TerrainInfo): Promise<TerrainPatch> {
  const res = await fetch(info.heightmap_url);
  if (!res.ok) throw new Error(`fetch ${info.heightmap_url} failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const n = info.size_px;
  const raw = new Uint16Array(buf);
  if (raw.length !== n * n) {
    throw new RangeError(`terrain ${info.site_id}: expected ${n * n} samples, got ${raw.length}`);
  }

  const span = info.max_height_m - info.min_height_m;
  const [siteCol, siteRow] = info.site_px;
  const siteHeightM = info.min_height_m + (raw[siteRow * n + siteCol]! / 65535) * span;

  const heights = new Float32Array(raw.length);
  for (let k = 0; k < raw.length; k++) {
    heights[k] = info.min_height_m + (raw[k]! / 65535) * span - siteHeightM;
  }
  return { info, heights, cellM: info.extent_m / (n - 1) };
}

/** Bilinear-sampled height (meters, relative to the site) at local (x = east, z = -north) meters. */
export function sampleTerrainHeight(patch: TerrainPatch, xLocal: number, zLocal: number): number {
  const { info, heights, cellM } = patch;
  const n = info.size_px;
  const half = info.extent_m / 2;
  const colF = (xLocal + half) / cellM;
  const rowF = (zLocal + half) / cellM;
  const c0 = Math.min(Math.max(Math.floor(colF), 0), n - 1);
  const r0 = Math.min(Math.max(Math.floor(rowF), 0), n - 1);
  const c1 = Math.min(c0 + 1, n - 1);
  const r1 = Math.min(r0 + 1, n - 1);
  const fc = Math.min(Math.max(colF - c0, 0), 1);
  const fr = Math.min(Math.max(rowF - r0, 0), 1);
  const h00 = heights[r0 * n + c0]!, h01 = heights[r0 * n + c1]!;
  const h10 = heights[r1 * n + c0]!, h11 = heights[r1 * n + c1]!;
  const h0 = h00 + (h01 - h00) * fc;
  const h1 = h10 + (h11 - h10) * fc;
  return h0 + (h1 - h0) * fr;
}
