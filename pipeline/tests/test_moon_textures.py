import io
import math

import numpy as np
import pytest
from PIL import Image

from touchdown_pipeline.moon_textures import (
    TileMatrix,
    TileStore,
    band_lat_bounds,
    compose_mosaic,
    encode_jpeg,
    parse_capabilities,
    polar_lat_lon,
    reproject_polar,
    rows_for_lat_range,
    sample_equirect,
)

CAPABILITIES_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" version="1.0.0">
  <Contents>
    <Layer>
      <ows:Identifier>TEST_LAYER</ows:Identifier>
      <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style>
      <Format>image/jpeg</Format>
      <TileMatrixSetLink><TileMatrixSet>default028mm</TileMatrixSet></TileMatrixSetLink>
      <ResourceURL format="image/jpeg" resourceType="tile" template="https://example.test/EQ/TEST_LAYER/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg"/>
    </Layer>
    <TileMatrixSet>
      <ows:Identifier>default028mm</ows:Identifier>
      <TileMatrix><ows:Identifier>0</ows:Identifier><TopLeftCorner>-180.0 90.0</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>2.0</MatrixWidth><MatrixHeight>1.0</MatrixHeight></TileMatrix>
      <TileMatrix><ows:Identifier>6</ows:Identifier><TopLeftCorner>-180.0 90.0</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>128.0</MatrixWidth><MatrixHeight>64.0</MatrixHeight></TileMatrix>
    </TileMatrixSet>
  </Contents>
</Capabilities>
"""


def pixel_of(lat_deg: float, lon_deg: float, size: int, extent_deg: float, south: bool) -> tuple[float, float]:
    colat = math.radians(90.0 - abs(lat_deg))
    rho = 0.5 * math.tan(colat / 2.0) / math.tan(math.radians(extent_deg) / 2.0)
    lon = math.radians(lon_deg)
    col = (0.5 + rho * math.sin(lon)) * size
    row = (0.5 - rho * math.cos(lon) if south else 0.5 + rho * math.cos(lon)) * size
    return row, col


def blob_source(lat_deg: float, lon_deg: float, width: int = 1440, sigma_deg: float = 1.0) -> np.ndarray:
    height = width // 2
    lats = np.radians(90.0 - (np.arange(height) + 0.5) * 180.0 / height)[:, None]
    lons = np.radians(-180.0 + (np.arange(width) + 0.5) * 360.0 / width)[None, :]
    lat0, lon0 = math.radians(lat_deg), math.radians(lon_deg)
    cos_angle = np.sin(lats) * math.sin(lat0) + np.cos(lats) * math.cos(lat0) * np.cos(lons - lon0)
    angle = np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))
    return np.rint(255.0 * np.exp(-(angle**2) / (2.0 * sigma_deg**2))).astype(np.uint8)


def test_parse_capabilities_reads_matrices_and_builds_urls():
    caps = parse_capabilities(CAPABILITIES_XML)
    assert caps.matrices[6] == TileMatrix(6, 256, 256, 128, 64, -180.0, 90.0)
    assert caps.matrices[6].width_px == 32768 and caps.matrices[6].height_px == 16384
    assert caps.tile_url(6, 63, 12) == "https://example.test/EQ/TEST_LAYER/1.0.0/default/default028mm/6/63/12.jpg"


def test_parse_capabilities_rejects_non_global_matrix_and_dtd():
    with pytest.raises(ValueError):
        parse_capabilities(CAPABILITIES_XML.replace("<MatrixHeight>1.0<", "<MatrixHeight>3.0<"))
    with pytest.raises(ValueError):
        parse_capabilities(CAPABILITIES_XML.replace("<Capabilities", '<!DOCTYPE x [<!ENTITY a "b">]><Capabilities', 1))


def test_rows_cover_the_requested_polar_band():
    matrix = parse_capabilities(CAPABILITIES_XML).matrices[6]
    south = rows_for_lat_range(matrix, -70.0, -90.0)
    north = rows_for_lat_range(matrix, 90.0, 70.0)
    assert (south.start, south.stop) == (56, 64)
    assert (north.start, north.stop) == (0, 8)
    top, bottom = band_lat_bounds(matrix, south)
    assert top == pytest.approx(-67.5) and bottom == pytest.approx(-90.0)
    top, bottom = band_lat_bounds(matrix, north)
    assert top == pytest.approx(90.0) and bottom == pytest.approx(67.5)


def test_compose_mosaic_places_each_tile_at_its_row_and_column():
    rows, cols = range(5, 7), range(2, 5)
    tiles = {(r, c): np.full((4, 3), r * 10 + c, dtype=np.uint8) for r in rows for c in cols}
    mosaic = compose_mosaic(tiles, rows, cols, 4, 3)
    assert mosaic.shape == (8, 9)
    assert mosaic[0, 0] == 52 and mosaic[3, 2] == 52
    assert mosaic[0, 3] == 53 and mosaic[0, 8] == 54
    assert mosaic[4, 0] == 62 and mosaic[7, 8] == 64
    with pytest.raises(ValueError):
        compose_mosaic({**tiles, (6, 4): np.zeros((4, 4), dtype=np.uint8)}, rows, cols, 4, 3)


def test_tile_store_downloads_once_and_composes(tmp_path):
    caps = parse_capabilities(CAPABILITIES_XML)
    calls: list[str] = []

    def fake_fetch(url: str) -> bytes:
        calls.append(url)
        row, col = (int(part) for part in url.removesuffix(".jpg").split("/")[-2:])
        buffer = io.BytesIO()
        Image.new("L", (256, 256), row * 16 + col * 4).save(buffer, "JPEG", quality=100)
        return buffer.getvalue()

    store = TileStore(tmp_path, caps, workers=2, delay_s=0.0, fetch=fake_fetch)
    first = store.mosaic(6, range(1, 3), range(0, 2))
    second = store.mosaic(6, range(1, 3), range(0, 2))
    assert len(calls) == 4 and store.downloaded == 4
    assert first.shape == (512, 512) and np.array_equal(first, second)
    assert abs(int(first[0, 0]) - 16) <= 2 and abs(int(first[511, 511]) - 36) <= 2


def test_sample_equirect_hits_pixel_centres_and_wraps_the_antimeridian():
    source = np.zeros((4, 8), dtype=np.uint8)
    source[1, 0] = 200
    source[1, 7] = 100
    centre_lat = 90.0 - 1.5 * 45.0
    assert sample_equirect(source, np.array([centre_lat]), np.array([-180.0 + 0.5 * 45.0]), 90.0, -90.0)[0] == pytest.approx(200.0)
    across = sample_equirect(source, np.array([centre_lat]), np.array([180.0]), 90.0, -90.0)[0]
    assert across == pytest.approx(150.0)


def centroid(image: np.ndarray) -> tuple[float, float]:
    weights = np.where(image > 0.5 * image.max(), image.astype(np.float64), 0.0)
    rows, cols = np.indices(image.shape)
    total = weights.sum()
    return float((rows * weights).sum() / total) + 0.5, float((cols * weights).sum() / total) + 0.5


@pytest.mark.parametrize("south", [True, False])
@pytest.mark.parametrize("lon", [0.0, 90.0, -90.0, 180.0, 37.0])
@pytest.mark.parametrize("colat", [4.0, 10.0, 15.0])
def test_polar_reprojection_puts_a_marked_point_at_the_expected_pixel(south, lon, colat):
    lat = -(90.0 - colat) if south else 90.0 - colat
    size, extent = 512, 20.0
    lat_top, lat_bottom = (-67.5, -90.0) if south else (90.0, 67.5)
    full = blob_source(lat, lon)
    height = full.shape[0]
    band = full[int(height * (90.0 - lat_top) / 180.0) : int(height * (90.0 - lat_bottom) / 180.0)]
    out = reproject_polar(band, lat_top, lat_bottom, size, extent, south, supersample=1)
    row, col = centroid(out)
    expected_row, expected_col = pixel_of(lat, lon, size, extent, south)
    assert abs(row - expected_row) <= 1.0
    assert abs(col - expected_col) <= 1.0


@pytest.mark.parametrize(
    ("south", "pixel", "expected_lon"),
    [
        (True, (40, 256), 0.0),
        (True, (256, 470), 90.0),
        (True, (470, 256), 180.0),
        (True, (256, 40), -90.0),
        (False, (470, 256), 0.0),
        (False, (256, 470), 90.0),
        (False, (40, 256), 180.0),
        (False, (256, 40), -90.0),
    ],
)
def test_polar_orientation_matches_the_shader_convention(south, pixel, expected_lon):
    lat, lon = polar_lat_lon(512, 20.0, south, 1, 0, 512)
    delta = (lon[pixel] - expected_lon + 180.0) % 360.0 - 180.0
    assert abs(delta) < 1.0
    assert (lat[pixel] < 0) == south


def test_reprojection_of_a_constant_image_is_constant_even_in_the_corners():
    band = np.full((64, 256), 90, dtype=np.uint8)
    out = reproject_polar(band, -67.5, -90.0, 128, 20.0, True)
    assert out.min() == 90 and out.max() == 90


def test_reprojection_leaves_the_area_outside_the_declared_extent_flat():
    rng = np.random.default_rng(7)
    band = (rng.random((128, 512)) * 255).astype(np.uint8)
    out = reproject_polar(band, -67.5, -90.0, 128, 20.0, True, supersample=1)
    offsets = (np.arange(128) + 0.5) / 128 - 0.5
    outside = np.hypot(offsets[None, :], offsets[:, None]) > 0.5
    assert len(np.unique(out[outside])) == 1
    assert len(np.unique(out[~outside])) > 50


def test_encode_jpeg_picks_the_highest_quality_that_fits():
    rng = np.random.default_rng(1)
    image = Image.fromarray((rng.random((256, 256)) * 255).astype(np.uint8))
    data, quality = encode_jpeg(image, 40_000)
    assert len(data) <= 40_000 and quality < 95
    with pytest.raises(ValueError):
        encode_jpeg(image, 100)
