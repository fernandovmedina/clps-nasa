from __future__ import annotations

import numpy as np

from .lola import R_MOON_M


def _unit_vector(lon_deg: np.ndarray | float, lat_deg: np.ndarray | float) -> np.ndarray:
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def _azimuth_elevation(
    vectors: np.ndarray, east: np.ndarray, north: np.ndarray, up: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    e = vectors @ east
    n = vectors @ north
    u = vectors @ up
    return np.degrees(np.arctan2(e, n)) % 360.0, np.degrees(np.arctan2(u, np.hypot(e, n)))


def sun_earth_azel(
    global_series: dict[str, object], lat_deg: float, lon_deg: float, height_m: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = _unit_vector(lon_deg, lat_deg)
    site_km = (R_MOON_M + height_m) / 1000.0 * up

    earth_dir = _unit_vector(np.asarray(global_series["sub_earth_lon"]), np.asarray(global_series["sub_earth_lat"]))
    sun_dir = _unit_vector(np.asarray(global_series["sub_solar_lon"]), np.asarray(global_series["sub_solar_lat"]))
    earth_from_site = np.asarray(global_series["earth_range_km"])[:, None] * earth_dir - site_km

    sun_az, sun_el = _azimuth_elevation(sun_dir, east, north, up)
    earth_az, earth_el = _azimuth_elevation(earth_from_site, east, north, up)
    return sun_az, sun_el, earth_az, earth_el
