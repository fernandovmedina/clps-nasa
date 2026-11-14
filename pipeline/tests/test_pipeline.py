import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
import pytest

from touchdown_pipeline.geometry import sun_earth_azel
from touchdown_pipeline.horizons import SAMPLE_COUNT, horizon_elevation_at, parse_horizons_table
from touchdown_pipeline.lola import (
    DEFAULT_LOLA_CACHE,
    POLAR_45S,
    POLAR_80S,
    R_MOON_M,
    LolaStore,
    bilinear_sample,
    compute_horizon_from_grid,
    latlon_to_polar_px,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "web" / "public" / "data"
REGIONS = {"south-pole", "mid-latitude", "equatorial", "far-side"}


@lru_cache(maxsize=None)
def read_json(relative_path: str) -> dict:
    return json.loads((DATA_DIR / relative_path).read_text(encoding="utf-8"))


def catalog_sites() -> list[dict]:
    return read_json("sites.json")["sites"]


def angle_diff_deg(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a - b + 180.0) % 360.0 - 180.0


@pytest.fixture(scope="module")
def lola_store() -> LolaStore:
    for spec in (POLAR_80S, POLAR_45S):
        if not (DEFAULT_LOLA_CACHE / spec.filename).exists():
            pytest.skip(f"LOLA product {spec.filename} is not cached")
    return LolaStore()


def polar_height_m(store: LolaStore, spec, lat_deg: float, lon_deg: float) -> float:
    row, col = latlon_to_polar_px(lat_deg, lon_deg, spec)
    arr = store._open(spec.filename, (spec.size, spec.size))
    return float(bilinear_sample(arr, np.array([row]), np.array([col]))[0])


def test_parse_horizons_table():
    sample_text = """
$$SOE
 2027-Jan-10 00:00  i  151.755795  -7.846098
 2027-Jan-10 01:00  *  151.244981   2.805424
$$EOE
"""
    rows = parse_horizons_table(sample_text, n_values=2)
    assert rows == [
        ("2027-01-10T00:00:00Z", (151.755795, -7.846098)),
        ("2027-01-10T01:00:00Z", (151.244981, 2.805424)),
    ]


@pytest.mark.parametrize(
    "block",
    [
        " 2027-Jan-10 00:00  151.755795\n",
        " 2027-Jan-10 00:00  151.755795  n.a.\n",
        " 2027-Foo-10 00:00  151.755795  -7.846098\n",
        " 2027-Jan-10  151.755795  -7.846098\n",
    ],
)
def test_parse_horizons_table_rejects_malformed_rows(block):
    with pytest.raises(ValueError):
        parse_horizons_table(f"$$SOE\n{block}$$EOE\n", n_values=2)


def test_parse_horizons_table_checks_count_and_block_end():
    rows = " 2027-Jan-10 00:00  151.755795  -7.846098\n"
    with pytest.raises(ValueError):
        parse_horizons_table(f"$$SOE\n{rows}$$EOE\n", n_values=2, expected_count=2)
    with pytest.raises(ValueError):
        parse_horizons_table(f"$$SOE\n{rows}", n_values=2)


def test_horizon_mask_detects_ridge_and_curvature():
    grid = np.zeros((101, 101), dtype=np.float64)
    grid[25, 45:56] = 1000.0
    cell_m = 200.0
    mask = compute_horizon_from_grid(grid, cell_m=cell_m, observer_height_m=2.0, az_step_deg=1.0)
    assert len(mask) == 360

    north_angle = mask[0]
    south_angle = mask[180]
    d = 25 * cell_m
    expected_north = math.degrees(math.atan2(1000.0 - 2.0 - (d * d) / (2.0 * R_MOON_M), d))
    assert abs(north_angle - expected_north) < 0.05
    assert south_angle < 0.0


def test_horizon_elevation_interpolates_wraparound():
    mask = [1.0] * 720
    mask[0] = 4.0
    mask[719] = 2.0
    val = horizon_elevation_at(359.75, mask, az_step_deg=0.5)
    assert abs(val - 3.0) < 1e-6


def test_generated_dataset_integrity():
    catalog = read_json("sites.json")
    terrains = read_json("terrains.json")
    sites = catalog["sites"]

    assert catalog["ephemeris_range"] == {
        "start": "2026-11-01T00:00:00Z",
        "end": "2028-01-01T00:00:00Z",
        "step_minutes": 60,
    }
    assert len(sites) == 10
    for site in sites:
        site_id = site["id"]
        assert site["region"] in REGIONS
        assert site["horizon_source"] == "lola"
        assert site["ephemeris_source"] == "jpl-horizons"
        assert site["coord_source"].startswith("https://")
        assert isinstance(site["approx"], bool)

        horizon = read_json(f"horizons/{site_id}.json")
        ephem = read_json(f"ephemeris/{site_id}.json")
        assert len(horizon["horizon_deg"]) == 720
        assert horizon["max_range_km"] == 300
        assert horizon["source"].startswith("LOLA LDEM_")
        assert all(math.isfinite(v) for v in horizon["horizon_deg"])
        assert ephem["count"] == SAMPLE_COUNT == 10225
        for key in ("sun_az", "sun_el", "earth_az", "earth_el"):
            assert len(ephem[key]) == ephem["count"]
            assert all(math.isfinite(v) for v in ephem[key])
        if site["has_terrain"]:
            assert site_id in terrains

    global_series = read_json("global.json")
    assert global_series["count"] == 10225
    for key in ("sub_earth_lon", "sub_earth_lat", "sub_solar_lon", "sub_solar_lat", "earth_range_km"):
        assert len(global_series[key]) == 10225
        assert all(math.isfinite(v) for v in global_series[key])
    assert -180.0 <= min(global_series["sub_solar_lon"]) and max(global_series["sub_solar_lon"]) <= 180.0


def test_far_side_site_never_sees_earth():
    assert max(read_json("ephemeris/change-4.json")["earth_el"]) < 0.0


def test_apollo_11_earth_is_high_in_the_west():
    ephem = read_json("ephemeris/apollo-11.json")
    assert 245.0 <= min(ephem["earth_az"]) and max(ephem["earth_az"]) <= 295.0
    assert 52.0 <= min(ephem["earth_el"]) and max(ephem["earth_el"]) <= 78.0


def test_malapert_a_sky_geometry():
    ephem = read_json("ephemeris/malapert-a.json")
    assert 0.0 <= min(ephem["earth_el"]) and max(ephem["earth_el"]) <= 18.0
    north_offset = np.abs(angle_diff_deg(np.array(ephem["earth_az"]), 0.0))
    assert north_offset.max() < 12.0
    assert max(ephem["sun_el"]) < 12.0


@pytest.mark.parametrize("site_id", [s["id"] for s in catalog_sites()])
def test_ephemeris_matches_sub_point_geometry(site_id):
    site = next(s for s in catalog_sites() if s["id"] == site_id)
    ephem = read_json(f"ephemeris/{site_id}.json")
    sun_az, sun_el, earth_az, earth_el = sun_earth_azel(
        read_json("global.json"), site["lat"], site["lon"], site["elevation_m"]
    )
    rng = np.random.default_rng(20261114)
    picks = np.sort(rng.choice(SAMPLE_COUNT, size=1000, replace=False))

    for name, az, el in (("sun", sun_az, sun_el), ("earth", earth_az, earth_el)):
        ref_az = np.array(ephem[f"{name}_az"])[picks]
        ref_el = np.array(ephem[f"{name}_el"])[picks]
        assert np.abs(el[picks] - ref_el).max() < 0.2
        assert (np.abs(angle_diff_deg(az[picks], ref_az)) * np.cos(np.radians(ref_el))).max() < 0.3


def test_polar_dems_agree_between_resolutions(lola_store):
    rng = np.random.default_rng(7)
    lats = rng.uniform(-88.0, -80.5, size=300)
    lons = rng.uniform(-180.0, 180.0, size=300)
    diffs = [
        abs(polar_height_m(lola_store, POLAR_80S, lat, lon) - polar_height_m(lola_store, POLAR_45S, lat, lon))
        for lat, lon in zip(lats, lons)
    ]
    assert float(np.median(diffs)) < 80.0


def test_shackleton_floor_depth(lola_store):
    heights, _ = lola_store.sample_heights_m(np.array([-89.67]), np.array([129.78]))
    assert -3400.0 < float(heights[0]) < -2300.0


@pytest.mark.parametrize("site_id", [s["id"] for s in catalog_sites() if s["has_terrain"]])
def test_terrain_raw_matches_metadata(site_id):
    meta = read_json("terrains.json")[site_id]
    site = next(s for s in catalog_sites() if s["id"] == site_id)
    assert set(meta) == {
        "site_id",
        "heightmap_url",
        "format",
        "size_px",
        "extent_m",
        "min_height_m",
        "max_height_m",
        "texture_url",
        "site_px",
    }
    size = meta["size_px"]
    raw_path = REPO_ROOT / "web" / "public" / meta["heightmap_url"].lstrip("/")
    assert raw_path.name == f"{site_id}.raw"
    assert raw_path.stat().st_size == size * size * 2

    raw = np.fromfile(raw_path, dtype="<u2").reshape(size, size)
    col, row = meta["site_px"]
    height = meta["min_height_m"] + raw[row, col] / 65535.0 * (meta["max_height_m"] - meta["min_height_m"])
    assert abs(height - site["elevation_m"]) < 30.0
