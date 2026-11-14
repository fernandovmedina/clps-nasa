from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

R_MOON_M = 1_737_400.0
DEFAULT_LOLA_CACHE = Path.home() / ".cache" / "clps-nasa" / "lola"
NEAR_FIELD_M = 30_000.0
FAR_FIELD_MIN_STEP_M = 160.0


@dataclass(frozen=True)
class PolarDemSpec:
    product: str
    filename: str
    size: int
    scale_m: float
    offset_px: float
    min_lat_deg: float
    max_lat_deg: float


@dataclass(frozen=True)
class CylindricalDemSpec:
    product: str
    filename: str
    lines: int
    samples: int
    ppd: float
    line_offset: float
    sample_offset: float
    center_lon: float


POLAR_80S = PolarDemSpec(
    product="LDEM_80S_80M",
    filename="LDEM_80S_80M.IMG",
    size=7600,
    scale_m=80.0,
    offset_px=3799.5,
    min_lat_deg=-90.0,
    max_lat_deg=-80.05,
)

POLAR_45S = PolarDemSpec(
    product="LDEM_45S_400M",
    filename="LDEM_45S_400M.IMG",
    size=7200,
    scale_m=400.0,
    offset_px=3599.5,
    min_lat_deg=-90.0,
    max_lat_deg=-45.1,
)

CYL_16 = CylindricalDemSpec(
    product="LDEM_16",
    filename="LDEM_16.IMG",
    lines=2880,
    samples=5760,
    ppd=16.0,
    line_offset=1439.5,
    sample_offset=2879.5,
    center_lon=180.0,
)


def native_step_m(lat_deg: float) -> float:
    if lat_deg <= POLAR_80S.max_lat_deg:
        return POLAR_80S.scale_m
    if lat_deg <= POLAR_45S.max_lat_deg:
        return POLAR_45S.scale_m
    return 2.0 * math.pi * R_MOON_M / (360.0 * CYL_16.ppd)


def latlon_to_polar_px(lat_deg: float, lon_deg: float, spec: PolarDemSpec) -> tuple[float, float]:
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    rho = 2.0 * R_MOON_M * math.tan(math.pi / 4.0 + lat / 2.0)
    col = spec.offset_px + (rho * math.sin(lon)) / spec.scale_m
    row = spec.offset_px - (rho * math.cos(lon)) / spec.scale_m
    return row, col


def latlon_to_cyl_px(lat_deg: float, lon_deg: float, spec: CylindricalDemSpec) -> tuple[float, float]:
    lon_360 = lon_deg % 360.0
    col = spec.sample_offset + (lon_360 - spec.center_lon) * spec.ppd
    row = spec.line_offset - lat_deg * spec.ppd
    return row, col


def bilinear_sample(arr: np.ndarray, row: np.ndarray, col: np.ndarray, wrap_x: bool = False) -> np.ndarray:
    h, w = arr.shape
    r0 = np.floor(row).astype(np.int64)
    c0 = np.floor(col).astype(np.int64)
    dr = row - r0
    dc = col - c0

    r0c = np.clip(r0, 0, h - 1)
    r1c = np.clip(r0 + 1, 0, h - 1)
    if wrap_x:
        c0c = np.mod(c0, w)
        c1c = np.mod(c0 + 1, w)
    else:
        c0c = np.clip(c0, 0, w - 1)
        c1c = np.clip(c0 + 1, 0, w - 1)

    v00 = arr[r0c, c0c].astype(np.float64)
    v01 = arr[r0c, c1c].astype(np.float64)
    v10 = arr[r1c, c0c].astype(np.float64)
    v11 = arr[r1c, c1c].astype(np.float64)

    return (
        v00 * (1.0 - dr) * (1.0 - dc)
        + v01 * (1.0 - dr) * dc
        + v10 * dr * (1.0 - dc)
        + v11 * dr * dc
    ) * 0.5


def geodesic_destination(
    lat_deg: float,
    lon_deg: float,
    az_deg: np.ndarray,
    dist_m: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    lat1 = math.radians(lat_deg)
    lon1 = math.radians(lon_deg)
    az = np.radians(az_deg)[:, None]
    delta = (dist_m / R_MOON_M)[None, :]

    sin_lat2 = math.sin(lat1) * np.cos(delta) + math.cos(lat1) * np.sin(delta) * np.cos(az)
    sin_lat2 = np.clip(sin_lat2, -1.0, 1.0)
    lat2 = np.arcsin(sin_lat2)
    lon2 = lon1 + np.arctan2(
        np.sin(az) * np.sin(delta) * math.cos(lat1),
        np.cos(delta) - math.sin(lat1) * sin_lat2,
    )
    return np.degrees(lat2), np.degrees(lon2)


class LolaStore:
    def __init__(self, cache_dir: Path = DEFAULT_LOLA_CACHE) -> None:
        self.cache_dir = cache_dir
        self._arrays: dict[str, np.memmap] = {}

    def _open(self, filename: str, shape: tuple[int, int]) -> np.memmap:
        if filename not in self._arrays:
            path = self.cache_dir / filename
            if not path.exists():
                raise FileNotFoundError(f"Missing LOLA DEM file: {path}")
            self._arrays[filename] = np.memmap(path, dtype="<i2", mode="r", shape=shape)
        return self._arrays[filename]

    def sample_heights_m(self, lat_deg: np.ndarray, lon_deg: np.ndarray) -> tuple[np.ndarray, list[str]]:
        out = np.empty_like(lat_deg, dtype=np.float64)
        mask_80 = lat_deg <= POLAR_80S.max_lat_deg
        mask_45 = (~mask_80) & (lat_deg <= POLAR_45S.max_lat_deg)
        mask_16 = ~(mask_80 | mask_45)

        products: list[str] = []
        if np.any(mask_80):
            arr = self._open(POLAR_80S.filename, (POLAR_80S.size, POLAR_80S.size))
            lat_r = np.radians(lat_deg[mask_80])
            lon_r = np.radians(lon_deg[mask_80])
            rho = 2.0 * R_MOON_M * np.tan(math.pi / 4.0 + lat_r / 2.0)
            col = POLAR_80S.offset_px + (rho * np.sin(lon_r)) / POLAR_80S.scale_m
            row = POLAR_80S.offset_px - (rho * np.cos(lon_r)) / POLAR_80S.scale_m
            out[mask_80] = bilinear_sample(arr, row, col)
            products.append(POLAR_80S.product)

        if np.any(mask_45):
            arr = self._open(POLAR_45S.filename, (POLAR_45S.size, POLAR_45S.size))
            lat_r = np.radians(lat_deg[mask_45])
            lon_r = np.radians(lon_deg[mask_45])
            rho = 2.0 * R_MOON_M * np.tan(math.pi / 4.0 + lat_r / 2.0)
            col = POLAR_45S.offset_px + (rho * np.sin(lon_r)) / POLAR_45S.scale_m
            row = POLAR_45S.offset_px - (rho * np.cos(lon_r)) / POLAR_45S.scale_m
            out[mask_45] = bilinear_sample(arr, row, col)
            products.append(POLAR_45S.product)

        if np.any(mask_16):
            arr = self._open(CYL_16.filename, (CYL_16.lines, CYL_16.samples))
            lon_360 = np.mod(lon_deg[mask_16], 360.0)
            col = CYL_16.sample_offset + (lon_360 - CYL_16.center_lon) * CYL_16.ppd
            row = CYL_16.line_offset - lat_deg[mask_16] * CYL_16.ppd
            out[mask_16] = bilinear_sample(arr, row, col, wrap_x=True)
            products.append(CYL_16.product)

        return out, products

    def site_elevation_m(self, lat_deg: float, lon_deg: float) -> tuple[float, list[str]]:
        h, products = self.sample_heights_m(np.array([lat_deg]), np.array([lon_deg]))
        return round(float(h[0]), 2), products

    def compute_horizon_mask(
        self,
        lat_deg: float,
        lon_deg: float,
        az_step_deg: float = 0.5,
        observer_height_m: float = 2.0,
        max_range_km: float = 300.0,
    ) -> tuple[list[float], float, str]:
        h0, site_products = self.site_elevation_m(lat_deg, lon_deg)
        azimuths = np.arange(0.0, 360.0, az_step_deg, dtype=np.float64)
        near_step = native_step_m(lat_deg)
        far_step = max(FAR_FIELD_MIN_STEP_M, near_step)
        max_range_m = max_range_km * 1000.0
        distances = np.concatenate(
            [
                np.arange(near_step, min(NEAR_FIELD_M, max_range_m), near_step, dtype=np.float64),
                np.arange(NEAR_FIELD_M, max_range_m, far_step, dtype=np.float64),
                np.array([max_range_m]),
            ]
        )

        ray_lats, ray_lons = geodesic_destination(lat_deg, lon_deg, azimuths, distances)
        heights, ray_products = self.sample_heights_m(ray_lats.ravel(), ray_lons.ravel())
        heights = heights.reshape(ray_lats.shape)

        curvature_drop = (distances * distances) / (2.0 * R_MOON_M)
        angles = np.degrees(
            np.arctan2(heights - (h0 + observer_height_m) - curvature_drop[None, :], distances[None, :])
        )
        max_angles = np.max(angles, axis=1)
        used = set(site_products) | set(ray_products)
        ordered = [p.product for p in (POLAR_80S, POLAR_45S, CYL_16) if p.product in used]
        return [round(float(x), 2) for x in max_angles], h0, "LOLA " + " + ".join(ordered)

    def export_terrain_patch(
        self,
        site_id: str,
        lat_deg: float,
        lon_deg: float,
        out_dir: Path,
        size_px: int = 513,
        extent_m: float = 20_000.0,
    ) -> dict[str, object]:
        out_dir.mkdir(parents=True, exist_ok=True)
        half = extent_m / 2.0
        east_offsets = np.linspace(-half, half, size_px, dtype=np.float64)
        north_offsets = np.linspace(half, -half, size_px, dtype=np.float64)
        ee, nn = np.meshgrid(east_offsets, north_offsets)

        dist = np.hypot(ee, nn)
        az_rad = np.arctan2(ee, nn)
        delta = dist / R_MOON_M
        lat1 = math.radians(lat_deg)
        lon1 = math.radians(lon_deg)

        sin_lat2 = math.sin(lat1) * np.cos(delta) + math.cos(lat1) * np.sin(delta) * np.cos(az_rad)
        sin_lat2 = np.clip(sin_lat2, -1.0, 1.0)
        lat2 = np.degrees(np.arcsin(sin_lat2))
        lon2 = np.degrees(
            lon1
            + np.arctan2(
                np.sin(az_rad) * np.sin(delta) * math.cos(lat1),
                np.cos(delta) - math.sin(lat1) * sin_lat2,
            )
        )

        heights, _ = self.sample_heights_m(lat2.ravel(), lon2.ravel())
        grid = heights.reshape((size_px, size_px))

        min_h = float(np.min(grid))
        max_h = float(np.max(grid))
        span = max(max_h - min_h, 1.0)
        norm16 = np.clip(np.round(((grid - min_h) / span) * 65535.0), 0, 65535).astype("<u2")

        raw_path = out_dir / f"{site_id}.raw"
        norm16.tofile(raw_path)

        cell_m = extent_m / (size_px - 1)
        gy, gx = np.gradient(grid, cell_m)
        sun_az = math.radians(315.0)
        sun_el = math.radians(28.0)
        sx = math.cos(sun_el) * math.sin(sun_az)
        sy = math.cos(sun_el) * math.cos(sun_az)
        sz = math.sin(sun_el)
        nx = -gx
        ny = gy
        nz = np.ones_like(grid)
        inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
        shade = np.clip((nx * sx + ny * sy + nz * sz) * inv_len, 0.08, 1.0)

        elev_tint = (grid - min_h) / span
        albedo = np.clip(0.26 + 0.34 * shade + 0.12 * elev_tint, 0.05, 0.92)
        rgb = np.stack(
            [
                np.round(albedo * 228).astype(np.uint8),
                np.round(albedo * 232).astype(np.uint8),
                np.round(albedo * 240).astype(np.uint8),
            ],
            axis=-1,
        )
        shade_png_path = out_dir / f"{site_id}.png"
        Image.fromarray(rgb, mode="RGB").save(shade_png_path, optimize=True)

        center = size_px // 2
        return {
            "site_id": site_id,
            "heightmap_url": f"/static/terrain/{site_id}.raw",
            "format": "RAW16 little-endian",
            "size_px": size_px,
            "extent_m": int(extent_m),
            "min_height_m": round(min_h, 2),
            "max_height_m": round(max_h, 2),
            "texture_url": f"/static/terrain/{site_id}.png",
            "site_px": [center, center],
        }


def compute_horizon_from_grid(
    grid_m: np.ndarray,
    cell_m: float,
    observer_height_m: float = 2.0,
    az_step_deg: float = 0.5,
    max_range_m: float | None = None,
) -> list[float]:
    h_rows, w_cols = grid_m.shape
    cy, cx = h_rows // 2, w_cols // 2
    h0 = float(grid_m[cy, cx])
    limit = max_range_m if max_range_m is not None else min(cy, cx) * cell_m
    distances = np.arange(cell_m, limit + 1e-6, cell_m, dtype=np.float64)
    azimuths = np.arange(0.0, 360.0, az_step_deg, dtype=np.float64)

    az_rad = np.radians(azimuths)[:, None]
    cols = cx + (distances[None, :] * np.sin(az_rad)) / cell_m
    rows = cy - (distances[None, :] * np.cos(az_rad)) / cell_m
    sampled = bilinear_sample(grid_m * 2.0, rows.ravel(), cols.ravel()).reshape(rows.shape)
    curvature = (distances * distances) / (2.0 * R_MOON_M)
    angles = np.degrees(
        np.arctan2(sampled - (h0 + observer_height_m) - curvature[None, :], distances[None, :])
    )
    return [round(float(x), 3) for x in np.max(angles, axis=1)]
