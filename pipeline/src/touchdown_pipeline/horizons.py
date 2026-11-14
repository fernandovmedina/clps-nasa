from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_HORIZONS_CACHE = Path.home() / ".cache" / "clps-nasa" / "horizons"
HORIZONS_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api"
ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
START = datetime(2026, 11, 1, tzinfo=timezone.utc)
END = datetime(2028, 1, 1, tzinfo=timezone.utc)
STEP_MINUTES = 60
SAMPLE_COUNT = int((END - START) / timedelta(minutes=STEP_MINUTES)) + 1
MAX_ATTEMPTS = 5
RETRYABLE_HTTP = (429, 500, 502, 503, 504)
REQUEST_PAUSE_S = 1.0

MONTHS = {
    name: index
    for index, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), start=1
    )
}
ROW_PATTERN = re.compile(r"^\s*(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})\s+(.+?)\s*$")
NUMBER_PATTERN = re.compile(r"[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?")
EPHEMERIS_NAME_PATTERN = re.compile(r"\{source: (DE\d+)\}")
LONGITUDE_SIGN_PATTERN = re.compile(r"Positive\s+longitude\s+is\s+to\s+the\s+(EAST|WEST)")
GLOBAL_COLUMNS_PATTERN = re.compile(r"ObsSub-LON\s+ObsSub-LAT\s+SunSub-LON\s+SunSub-LAT\s+delta")


def parse_horizons_table(
    result_text: str, n_values: int, expected_count: int | None = None
) -> list[tuple[str, tuple[float, ...]]]:
    in_block = False
    closed = False
    rows: list[tuple[str, tuple[float, ...]]] = []
    for line in result_text.splitlines():
        if "$$SOE" in line:
            in_block = True
            continue
        if "$$EOE" in line:
            closed = True
            break
        if not in_block or not line.strip():
            continue
        match = ROW_PATTERN.match(line)
        if not match:
            raise ValueError(f"Unparsable Horizons row: {line!r}")
        year, month, day, hour, minute, rest = match.groups()
        if month not in MONTHS:
            raise ValueError(f"Unknown month in Horizons row: {line!r}")
        tokens = rest.split()
        flags = 0
        while tokens and not NUMBER_PATTERN.fullmatch(tokens[0]):
            tokens.pop(0)
            flags += 1
        if flags > 2 or len(tokens) != n_values or not all(NUMBER_PATTERN.fullmatch(t) for t in tokens):
            raise ValueError(f"Horizons row does not carry {n_values} values: {line!r}")
        stamp = datetime(int(year), MONTHS[month], int(day), int(hour), int(minute), tzinfo=timezone.utc)
        rows.append((stamp.strftime(ISO_FORMAT), tuple(float(t) for t in tokens)))
    if not closed:
        raise ValueError("Horizons result has no complete $$SOE/$$EOE block")
    if expected_count is not None and len(rows) != expected_count:
        raise ValueError(f"Horizons returned {len(rows)} rows, expected {expected_count}")
    return rows


def expected_timeline() -> list[str]:
    return [(START + timedelta(minutes=STEP_MINUTES * i)).strftime(ISO_FORMAT) for i in range(SAMPLE_COUNT)]


def ephemeris_name(result_text: str) -> str:
    match = EPHEMERIS_NAME_PATTERN.search(result_text)
    if not match:
        raise ValueError("Horizons result does not name its ephemeris")
    return match.group(1)


def longitude_sign(result_text: str) -> int:
    directions = set(LONGITUDE_SIGN_PATTERN.findall(result_text))
    if len(directions) != 1:
        raise ValueError(f"Horizons legend does not state one longitude direction: {sorted(directions)}")
    return 1 if directions == {"EAST"} else -1


def _clean(value: float, decimals: int) -> float:
    return round(value, decimals) + 0.0


def _request(url: str) -> dict:
    delay = 5.0
    failure = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=180) as response:
                payload = json.loads(response.read().decode("utf-8"))
            result = payload.get("result")
            if isinstance(result, str) and "$$SOE" in result:
                return payload
            failure = str(payload.get("message") or payload.get("error") or result)[:300]
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:300]
            if exc.code not in RETRYABLE_HTTP:
                raise RuntimeError(f"Horizons rejected the request (HTTP {exc.code}): {body}") from exc
            failure = f"HTTP {exc.code}: {body}"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            failure = repr(exc)
        if attempt < MAX_ATTEMPTS:
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"Horizons request failed after {MAX_ATTEMPTS} attempts: {failure}")


def _cached_query(name: str, params: dict[str, str], cache_dir: Path) -> dict:
    query = urllib.parse.urlencode(params)
    digest = hashlib.sha1(query.encode("utf-8")).hexdigest()[:10]
    cache_file = cache_dir / f"{name}_{START:%Y%m%d}_{END:%Y%m%d}_{digest}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    payload = _request(f"{HORIZONS_ENDPOINT}?{query}")
    cache_file.write_text(json.dumps(payload), encoding="utf-8")
    time.sleep(REQUEST_PAUSE_S)
    return payload


def _base_params(command: str, quantities: str) -> dict[str, str]:
    return {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "START_TIME": f"'{START:%Y-%m-%d}'",
        "STOP_TIME": f"'{END:%Y-%m-%d}'",
        "STEP_SIZE": "'1 h'",
        "QUANTITIES": f"'{quantities}'",
    }


def fetch_site_body(
    site_id: str,
    body_id: str,
    lat_deg: float,
    lon_deg: float,
    elev_m: float,
    cache_dir: Path = DEFAULT_HORIZONS_CACHE,
) -> tuple[list[float], list[float], str]:
    params = _base_params(body_id, "4")
    params["CENTER"] = "'coord@301'"
    params["COORD_TYPE"] = "'GEODETIC'"
    params["SITE_COORD"] = f"'{lon_deg % 360.0:.5f},{lat_deg:.5f},{round(elev_m / 1000.0, 4):.4f}'"
    payload = _cached_query(f"{site_id}_{body_id}", params, cache_dir)
    result_text = payload["result"]
    rows = parse_horizons_table(result_text, n_values=2, expected_count=SAMPLE_COUNT)
    if [t for t, _ in rows] != expected_timeline():
        raise ValueError(f"Horizons timeline for {site_id} body {body_id} is not the expected hourly grid")
    az = [values[0] for _, values in rows]
    el = [values[1] for _, values in rows]
    return az, el, ephemeris_name(result_text)


def horizon_elevation_at(az_deg: float, horizon_deg: list[float], az_step_deg: float = 0.5) -> float:
    n = len(horizon_deg)
    wrapped = az_deg % 360.0
    pos = wrapped / az_step_deg
    i0 = int(pos) % n
    i1 = (i0 + 1) % n
    frac = pos - int(pos)
    return horizon_deg[i0] * (1.0 - frac) + horizon_deg[i1] * frac


def build_site_ephemeris(
    site_id: str,
    lat_deg: float,
    lon_deg: float,
    elev_m: float,
    cache_dir: Path = DEFAULT_HORIZONS_CACHE,
) -> dict[str, object]:
    sun_az, sun_el, sun_name = fetch_site_body(site_id, "10", lat_deg, lon_deg, elev_m, cache_dir)
    earth_az, earth_el, earth_name = fetch_site_body(site_id, "399", lat_deg, lon_deg, elev_m, cache_dir)
    if sun_name != earth_name:
        raise ValueError(f"Horizons used different ephemerides for {site_id}: {sun_name} and {earth_name}")
    return {
        "site_id": site_id,
        "source": f"JPL Horizons {sun_name}, coord@301, QUANTITIES=4",
        "start": START.strftime(ISO_FORMAT),
        "step_minutes": STEP_MINUTES,
        "count": SAMPLE_COUNT,
        "sun_az": [_clean(v, 2) for v in sun_az],
        "sun_el": [_clean(v, 2) for v in sun_el],
        "earth_az": [_clean(v, 2) for v in earth_az],
        "earth_el": [_clean(v, 2) for v in earth_el],
    }


def build_global_series(cache_dir: Path = DEFAULT_HORIZONS_CACHE) -> dict[str, object]:
    params = _base_params("301", "14,15,20")
    params["CENTER"] = "'500@399'"
    params["RANGE_UNITS"] = "'KM'"
    params["SUPPRESS_RANGE_RATE"] = "'YES'"
    payload = _cached_query("moon_geocentric", params, cache_dir)
    result_text = payload["result"]
    if not GLOBAL_COLUMNS_PATTERN.search(result_text):
        raise ValueError("Horizons columns are not ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT, delta")
    sign = longitude_sign(result_text)
    rows = parse_horizons_table(result_text, n_values=5, expected_count=SAMPLE_COUNT)
    if [t for t, _ in rows] != expected_timeline():
        raise ValueError("Horizons global timeline is not the expected hourly grid")

    def east_lon(value: float) -> float:
        return _clean((sign * value + 180.0) % 360.0 - 180.0, 3)

    return {
        "source": f"JPL Horizons {ephemeris_name(result_text)}, target 301 from 500@399, QUANTITIES=14,15,20",
        "start": START.strftime(ISO_FORMAT),
        "step_minutes": STEP_MINUTES,
        "count": SAMPLE_COUNT,
        "sub_earth_lon": [east_lon(v[0]) for _, v in rows],
        "sub_earth_lat": [_clean(v[1], 3) for _, v in rows],
        "sub_solar_lon": [east_lon(v[2]) for _, v in rows],
        "sub_solar_lat": [_clean(v[3], 3) for _, v in rows],
        "earth_range_km": [_clean(v[4], 3) for _, v in rows],
    }
