"""
Genera un heightmap sintetico (crater + cerro) que respeta el contrato
GET /api/sites/{id}/terrain de CLAUDE.md, para probar el importador de
terreno en Three.js sin depender de un GeoTIFF real de LOLA.

Uso:
    python gen_test_heightmap.py
"""
import json
import struct
from pathlib import Path

import numpy as np

SIZE_PX = 1025           # 2^n + 1, igual que el contrato
EXTENT_M = 20000          # 20 km, igual al ejemplo del contrato
MIN_HEIGHT_M = 3200
MAX_HEIGHT_M = 5400
SITE_PX = [512, 512]      # el sitio queda al centro del recorte

OUT_DIR = Path(__file__).parent.parent / "webxr-test" / "terrain"
SITE_ID = "test-site"


def build_heights():
    x = np.linspace(-1, 1, SIZE_PX)
    y = np.linspace(-1, 1, SIZE_PX)
    xx, yy = np.meshgrid(x, y)
    r = np.sqrt(xx**2 + yy**2)

    # Cerro grande a un lado (para probar oclusion de Sol/Tierra)
    hill = np.exp(-((xx - 0.4) ** 2 + (yy - 0.3) ** 2) / 0.05) * 1.0

    # Crater simple cerca del centro
    crater = -0.3 * np.exp(-((r - 0.1) ** 2) / 0.01) + 0.15 * np.exp(-(r**2) / 0.002)

    base = 0.1 * np.sin(xx * 3) * np.cos(yy * 3)

    normalized = hill + crater + base
    normalized = (normalized - normalized.min()) / (normalized.max() - normalized.min())
    heights_m = MIN_HEIGHT_M + normalized * (MAX_HEIGHT_M - MIN_HEIGHT_M)
    return heights_m.astype(np.float64)


def write_raw16(path, heights_m):
    scale = 65535.0 / (MAX_HEIGHT_M - MIN_HEIGHT_M)
    quantized = np.clip((heights_m - MIN_HEIGHT_M) * scale, 0, 65535).astype("<u2")
    with open(path, "wb") as f:
        f.write(quantized.tobytes())


def write_contract_json(path):
    contract = {
        "site_id": SITE_ID,
        "heightmap_url": f"/terrain/{SITE_ID}.raw",
        "format": "RAW16 little-endian",
        "size_px": SIZE_PX,
        "extent_m": EXTENT_M,
        "min_height_m": MIN_HEIGHT_M,
        "max_height_m": MAX_HEIGHT_M,
        "texture_url": None,
        "site_px": SITE_PX,
        "source": "demo/mock - heightmap sintetico, NO es dato real de LOLA",
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(contract, f, indent=2)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    heights_m = build_heights()
    write_raw16(OUT_DIR / f"{SITE_ID}.raw", heights_m)
    write_contract_json(OUT_DIR / f"{SITE_ID}.json")
    print(f"Escrito {SITE_ID}.raw y {SITE_ID}.json en {OUT_DIR}")


if __name__ == "__main__":
    main()
