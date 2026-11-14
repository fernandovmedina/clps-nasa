from __future__ import annotations

import argparse
import io
import math
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping

import numpy as np
from PIL import Image

LAYER = "LRO_WAC_Mosaic_Global_303ppd_v02"
CAPABILITIES_URL = f"https://trek.nasa.gov/tiles/Moon/EQ/{LAYER}/1.0.0/WMTSCapabilities.xml"
DEFAULT_CACHE = Path.home() / ".cache" / "touchdown" / "moontrek"
DEFAULT_OUT = Path(__file__).resolve().parents[3] / "web" / "public" / "textures" / "moon"
USER_AGENT = "touchdown-pipeline/0.1 (moon texture build)"

GENERAL_LEVEL = 3
POLAR_LEVEL = 6
GENERAL_SIZE = (4096, 2048)
POLAR_SIZE = 2048
POLAR_EXTENT_DEG = 20.0
SUPERSAMPLE = 2
GENERAL_MAX_BYTES = 2_500_000
POLAR_MAX_BYTES = 1_500_000

WMTS = "{http://www.opengis.net/wmts/1.0}"
OWS = "{http://www.opengis.net/ows/1.1}"


@dataclass(frozen=True)
class TileMatrix:
    level: int
    tile_width: int
    tile_height: int
    matrix_width: int
    matrix_height: int
    left_lon: float
    top_lat: float

    @property
    def deg_per_row(self) -> float:
        return 180.0 / self.matrix_height

    @property
    def width_px(self) -> int:
        return self.tile_width * self.matrix_width

    @property
    def height_px(self) -> int:
        return self.tile_height * self.matrix_height


@dataclass(frozen=True)
class Capabilities:
    url_template: str
    style: str
    matrix_set: str
    matrices: Mapping[int, TileMatrix]

    def tile_url(self, level: int, row: int, col: int) -> str:
        url = (
            self.url_template.replace("{Style}", self.style)
            .replace("{TileMatrixSet}", self.matrix_set)
            .replace("{TileMatrix}", str(level))
            .replace("{TileRow}", str(row))
            .replace("{TileCol}", str(col))
        )
        return re.sub(r"(?<!:)/{2,}", "/", url)


def parse_capabilities(xml_text: str) -> Capabilities:
    if "<!DOCTYPE" in xml_text or "<!ENTITY" in xml_text:
        raise ValueError("capabilities: DTD declarations are not accepted")
    root = ET.fromstring(xml_text)
    resource = root.find(f".//{WMTS}Layer/{WMTS}ResourceURL")
    if resource is None or resource.get("format") != "image/jpeg":
        raise ValueError("capabilities: no image/jpeg ResourceURL")
    style = root.findtext(f".//{WMTS}Layer/{WMTS}Style/{OWS}Identifier")
    matrix_set = root.find(f"./{WMTS}Contents/{WMTS}TileMatrixSet")
    if style is None or matrix_set is None:
        raise ValueError("capabilities: missing style or tile matrix set")
    matrix_set_id = matrix_set.findtext(f"{OWS}Identifier", "")
    matrices: dict[int, TileMatrix] = {}
    for node in matrix_set.findall(f"{WMTS}TileMatrix"):
        left, top = (float(v) for v in node.findtext(f"{WMTS}TopLeftCorner", "").split())
        matrix = TileMatrix(
            level=int(node.findtext(f"{OWS}Identifier", "")),
            tile_width=int(node.findtext(f"{WMTS}TileWidth", "")),
            tile_height=int(node.findtext(f"{WMTS}TileHeight", "")),
            matrix_width=int(float(node.findtext(f"{WMTS}MatrixWidth", ""))),
            matrix_height=int(float(node.findtext(f"{WMTS}MatrixHeight", ""))),
            left_lon=left,
            top_lat=top,
        )
        if (matrix.left_lon, matrix.top_lat) != (-180.0, 90.0) or matrix.matrix_width != 2 * matrix.matrix_height:
            raise ValueError(f"capabilities: level {matrix.level} is not a global equirectangular matrix")
        matrices[matrix.level] = matrix
    if not matrices:
        raise ValueError("capabilities: no tile matrices")
    return Capabilities(resource.get("template", ""), style, matrix_set_id, matrices)


def rows_for_lat_range(matrix: TileMatrix, lat_top: float, lat_bottom: float) -> range:
    first = int(math.floor((matrix.top_lat - lat_top) / matrix.deg_per_row + 1e-9))
    last = int(math.ceil((matrix.top_lat - lat_bottom) / matrix.deg_per_row - 1e-9)) - 1
    return range(max(first, 0), min(last, matrix.matrix_height - 1) + 1)


def band_lat_bounds(matrix: TileMatrix, rows: range) -> tuple[float, float]:
    return (
        matrix.top_lat - rows.start * matrix.deg_per_row,
        matrix.top_lat - rows.stop * matrix.deg_per_row,
    )


def compose_mosaic(
    tiles: Mapping[tuple[int, int], np.ndarray], rows: range, cols: range, tile_height: int, tile_width: int
) -> np.ndarray:
    mosaic = np.zeros((len(rows) * tile_height, len(cols) * tile_width), dtype=np.uint8)
    for i, row in enumerate(rows):
        for j, col in enumerate(cols):
            tile = tiles[(row, col)]
            if tile.shape != (tile_height, tile_width):
                raise ValueError(f"tile ({row}, {col}) has shape {tile.shape}")
            mosaic[i * tile_height : (i + 1) * tile_height, j * tile_width : (j + 1) * tile_width] = tile
    return mosaic


def sample_equirect(mosaic: np.ndarray, lat: np.ndarray, lon: np.ndarray, lat_top: float, lat_bottom: float) -> np.ndarray:
    height, width = mosaic.shape
    x = (lon + 180.0) / 360.0 * width - 0.5
    y = np.clip((lat_top - lat) / (lat_top - lat_bottom) * height - 0.5, 0.0, height - 1.0)
    x_floor = np.floor(x)
    y_floor = np.floor(y)
    fx = (x - x_floor).astype(np.float32)
    fy = (y - y_floor).astype(np.float32)
    x0 = x_floor.astype(np.int64) % width
    x1 = (x0 + 1) % width
    y0 = y_floor.astype(np.int64)
    y1 = np.minimum(y0 + 1, height - 1)
    top = mosaic[y0, x0] * (1.0 - fx) + mosaic[y0, x1] * fx
    bottom = mosaic[y1, x0] * (1.0 - fx) + mosaic[y1, x1] * fx
    return top * (1.0 - fy) + bottom * fy


def polar_lat_lon(
    size: int, extent_deg: float, south: bool, supersample: int, row_start: int, row_stop: int
) -> tuple[np.ndarray, np.ndarray]:
    """Latitude/longitude (degrees, east positive) of the sub-samples of output rows [row_start, row_stop).

    Image convention, as read by the polar branch of the Moon shader: x = rho*sin(lon), and
    y = rho*cos(lon) up for the south pole (lon 0 at the top) or y = -rho*cos(lon) up for the
    north pole (lon 0 at the bottom). rho is 0.5 at `extent_deg` from the pole (stereographic).
    """
    n = size * supersample
    offsets = (np.arange(n) + 0.5) / n - 0.5
    u = offsets[None, :]
    v = -offsets[row_start * supersample : row_stop * supersample, None]
    rho = np.hypot(u, v)
    colat = 2.0 * np.arctan(2.0 * rho * math.tan(math.radians(extent_deg) / 2.0))
    lon = np.degrees(np.arctan2(u, v if south else -v))
    lat = -(90.0 - np.degrees(colat)) if south else 90.0 - np.degrees(colat)
    return lat, lon


def reproject_polar(
    mosaic: np.ndarray,
    lat_top: float,
    lat_bottom: float,
    size: int,
    extent_deg: float,
    south: bool,
    supersample: int = SUPERSAMPLE,
) -> np.ndarray:
    out = np.zeros((size, size), dtype=np.uint8)
    strip = 128
    for start in range(0, size, strip):
        stop = min(start + strip, size)
        lat, lon = polar_lat_lon(size, extent_deg, south, supersample, start, stop)
        values = sample_equirect(mosaic, lat, lon, lat_top, lat_bottom)
        block = values.reshape(stop - start, supersample, size, supersample).mean(axis=(1, 3))
        out[start:stop] = np.clip(np.rint(block), 0, 255).astype(np.uint8)
    offsets = (np.arange(size) + 0.5) / size - 0.5
    rho = np.hypot(offsets[None, :], offsets[:, None])
    ring = (rho > 0.45) & (rho <= 0.5)
    out[rho > 0.5] = int(round(float(out[ring].mean())))
    return out


def encode_jpeg(image: Image.Image, max_bytes: int) -> tuple[bytes, int]:
    for quality in range(95, 40, -1):
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=quality, optimize=True, progressive=True)
        if buffer.tell() <= max_bytes:
            return buffer.getvalue(), quality
    raise ValueError(f"cannot fit {image.size} image in {max_bytes} bytes")


def download(url: str, attempts: int = 5, timeout: float = 30.0) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500:
                raise
            if attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == attempts - 1:
                raise
        time.sleep(2.0**attempt)
    raise RuntimeError("unreachable")


class TileStore:
    def __init__(
        self,
        cache_dir: Path,
        capabilities: Capabilities,
        workers: int = 3,
        delay_s: float = 0.05,
        fetch: Callable[[str], bytes] = download,
    ) -> None:
        self.cache_dir = cache_dir
        self.capabilities = capabilities
        self.workers = workers
        self.delay_s = delay_s
        self.fetch = fetch
        self.downloaded = 0

    def _path(self, level: int, row: int, col: int) -> Path:
        return self.cache_dir / "tiles" / LAYER / str(level) / str(row) / f"{col}.jpg"

    def _load(self, matrix: TileMatrix, row: int, col: int) -> np.ndarray:
        path = self._path(matrix.level, row, col)
        if not path.exists():
            data = self.fetch(self.capabilities.tile_url(matrix.level, row, col))
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                if image.size != (matrix.tile_width, matrix.tile_height):
                    raise ValueError(f"tile {matrix.level}/{row}/{col} has size {image.size}")
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(path)
            time.sleep(self.delay_s)
        with Image.open(path) as image:
            return np.asarray(image.convert("L"))

    def mosaic(self, level: int, rows: range, cols: range) -> np.ndarray:
        matrix = self.capabilities.matrices[level]
        keys = [(row, col) for row in rows for col in cols]
        missing = sum(not self._path(level, row, col).exists() for row, col in keys)
        print(f"level {level}: {len(keys)} tiles, {missing} to download", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            arrays = list(pool.map(lambda key: self._load(matrix, *key), keys))
        self.downloaded += missing
        return compose_mosaic(dict(zip(keys, arrays)), rows, cols, matrix.tile_height, matrix.tile_width)


def load_capabilities(cache_dir: Path) -> Capabilities:
    path = cache_dir / f"{LAYER}_WMTSCapabilities.xml"
    if not path.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(download(CAPABILITIES_URL))
    return parse_capabilities(path.read_text(encoding="utf-8"))


def write_jpeg(image: Image.Image, path: Path, max_bytes: int) -> None:
    data, quality = encode_jpeg(image, max_bytes)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"{path.name}: {image.size[0]}x{image.size[1]} q{quality} {len(data)} bytes", file=sys.stderr)


def build(out_dir: Path, cache_dir: Path, workers: int) -> None:
    capabilities = load_capabilities(cache_dir)
    store = TileStore(cache_dir, capabilities, workers=workers)

    general = capabilities.matrices[GENERAL_LEVEL]
    mosaic = store.mosaic(GENERAL_LEVEL, range(general.matrix_height), range(general.matrix_width))
    image = Image.fromarray(mosaic)
    if image.size != GENERAL_SIZE:
        image = image.resize(GENERAL_SIZE, Image.Resampling.LANCZOS)
    write_jpeg(image, out_dir / "general.jpg", GENERAL_MAX_BYTES)

    polar = capabilities.matrices[POLAR_LEVEL]
    cols = range(polar.matrix_width)
    bands = {
        "south-pole.jpg": (True, rows_for_lat_range(polar, -90.0 + POLAR_EXTENT_DEG, -90.0)),
        "north-pole.jpg": (False, rows_for_lat_range(polar, 90.0, 90.0 - POLAR_EXTENT_DEG)),
    }
    for name, (south, rows) in bands.items():
        band = store.mosaic(POLAR_LEVEL, rows, cols)
        lat_top, lat_bottom = band_lat_bounds(polar, rows)
        tiles = reproject_polar(band, lat_top, lat_bottom, POLAR_SIZE, POLAR_EXTENT_DEG, south)
        write_jpeg(Image.fromarray(tiles), out_dir / name, POLAR_MAX_BYTES)
    print(f"tiles downloaded this run: {store.downloaded}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Moon textures from NASA Moon Trek WAC mosaic tiles")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    build(args.out, args.cache, max(1, args.workers))


if __name__ == "__main__":
    main()
