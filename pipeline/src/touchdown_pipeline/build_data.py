from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .horizons import END, ISO_FORMAT, START, STEP_MINUTES, build_global_series, build_site_ephemeris
from .lola import LolaStore
from .sites import CURATED_SITES

MAX_RANGE_KM = 300
OBSERVER_HEIGHT_M = 2.0
AZ_STEP_DEG = 0.5


def _write_compact(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def build_all(repo_root: Path) -> None:
    data_dir = repo_root / "web" / "public" / "data"
    horizons_dir = data_dir / "horizons"
    ephemeris_dir = data_dir / "ephemeris"
    terrain_dir = repo_root / "web" / "public" / "static" / "terrain"

    horizons_dir.mkdir(parents=True, exist_ok=True)
    ephemeris_dir.mkdir(parents=True, exist_ok=True)
    terrain_dir.mkdir(parents=True, exist_ok=True)

    _write_compact(data_dir / "global.json", build_global_series())

    lola = LolaStore()
    sites_payload: list[dict[str, object]] = []
    terrain_index: dict[str, dict[str, object]] = {}

    for site in CURATED_SITES:
        horizon_deg, elev_m, lola_source = lola.compute_horizon_mask(
            site.lat,
            site.lon,
            az_step_deg=AZ_STEP_DEG,
            observer_height_m=OBSERVER_HEIGHT_M,
            max_range_km=MAX_RANGE_KM,
        )
        _write_compact(
            horizons_dir / f"{site.id}.json",
            {
                "site_id": site.id,
                "az_step_deg": AZ_STEP_DEG,
                "horizon_deg": horizon_deg,
                "observer_height_m": OBSERVER_HEIGHT_M,
                "source": lola_source,
                "max_range_km": MAX_RANGE_KM,
            },
        )

        _write_compact(
            ephemeris_dir / f"{site.id}.json",
            build_site_ephemeris(site_id=site.id, lat_deg=site.lat, lon_deg=site.lon, elev_m=elev_m),
        )

        if site.has_terrain:
            terrain_index[site.id] = lola.export_terrain_patch(
                site_id=site.id,
                lat_deg=site.lat,
                lon_deg=site.lon,
                out_dir=terrain_dir,
            )

        sites_payload.append(
            {
                "id": site.id,
                "name": site.name,
                "program": site.program,
                "region": site.region,
                "lat": site.lat,
                "lon": site.lon,
                "elevation_m": elev_m,
                "has_terrain": site.has_terrain,
                "horizon_source": "lola",
                "ephemeris_source": "jpl-horizons",
                "coord_source": site.coord_source,
                "approx": site.approx,
                "notes": site.notes,
            }
        )

    catalog = {
        "generated_at": datetime.now(timezone.utc).strftime(ISO_FORMAT),
        "ephemeris_range": {
            "start": START.strftime(ISO_FORMAT),
            "end": END.strftime(ISO_FORMAT),
            "step_minutes": STEP_MINUTES,
        },
        "sites": sites_payload,
    }
    (data_dir / "sites.json").write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    (data_dir / "terrains.json").write_text(json.dumps(terrain_index, indent=2), encoding="utf-8")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    build_all(repo_root)


if __name__ == "__main__":
    main()
