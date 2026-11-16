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

/**
 * Solo se lee el heightmap: el PNG de al lado (`texture_url`) es un hillshade que el pipeline hornea con una luz fija
 * del noroeste; usarlo como color pintaría un segundo Sol falso encima del real.
 */
export async function loadTerrainPatch(info: TerrainInfo): Promise<TerrainPatch> {
  const res = await fetch(info.heightmap_url);
  if (!res.ok) throw new Error(`fetch ${info.heightmap_url} failed: ${res.status}`);
  return decodeTerrainPatch(info, new Uint16Array(await res.arrayBuffer()));
}

/** Convierte las muestras RAW16 en alturas (m) relativas al sitio, sin E/S. */
export function decodeTerrainPatch(info: TerrainInfo, raw: Uint16Array): TerrainPatch {
  const n = info.size_px;
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

/**
 * Rugosidad del terreno real alrededor de (x, z): desviación estándar (m) de las muestras del DEM dentro de `radiusM`
 * respecto al plano que mejor las ajusta. Se quita el plano para que una ladera lisa pero inclinada dé ~0: eso es
 * pendiente, no rugosidad. Usa solo muestras reales (nodos del DEM), sin el detalle cosmético ni el aplanado de la zona.
 * null si dentro del radio caben menos de 6 nodos.
 */
export function terrainRoughness(patch: TerrainPatch, xLocal: number, zLocal: number, radiusM = 120): number | null {
  const { info, heights, cellM } = patch;
  const n = info.size_px, half = info.extent_m / 2;
  const colF = (xLocal + half) / cellM, rowF = (zLocal + half) / cellM;
  const reach = Math.ceil(radiusM / cellM);
  const pts: [number, number, number][] = [];
  for (let r = Math.max(0, Math.round(rowF) - reach); r <= Math.min(n - 1, Math.round(rowF) + reach); r++) {
    for (let c = Math.max(0, Math.round(colF) - reach); c <= Math.min(n - 1, Math.round(colF) + reach); c++) {
      const dx = (c - colF) * cellM, dz = (r - rowF) * cellM;
      if (dx * dx + dz * dz <= radiusM * radiusM) pts.push([dx, dz, heights[r * n + c]!]);
    }
  }
  if (pts.length < 6) return null;

  // Mínimos cuadrados h = a + b·dx + c·dz (ecuaciones normales 3x3, resueltas por Cramer).
  let sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  for (const [dx, dz, h] of pts) { sx += dx; sz += dz; sh += h; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxh += dx * h; szh += dz * h; }
  const m = pts.length;
  const det = (a: number[], b: number[], c: number[]) => a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
  const A = [m, sx, sz], B = [sx, sxx, sxz], C = [sz, sxz, szz];
  const d = det(A, B, C);
  if (Math.abs(d) < 1e-9) return null;
  const a = det([sh, sx, sz], [sxh, sxx, sxz], [szh, sxz, szz]) / d;
  const b = det([m, sh, sz], [sx, sxh, sxz], [sz, szh, szz]) / d;
  const c = det([m, sx, sh], [sx, sxx, sxh], [sz, sxz, szh]) / d;
  let ss = 0;
  for (const [dx, dz, h] of pts) ss += (h - (a + b * dx + c * dz)) ** 2;
  return Math.sqrt(ss / m);
}
