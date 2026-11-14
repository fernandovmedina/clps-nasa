# JPL Horizons

**URL:** https://ssd.jpl.nasa.gov/horizons/

**Qué es:** servicio de JPL para calcular **efemérides** (posiciones de cuerpos del sistema solar) con alta precisión. Es la fuente de datos del Sol y la Tierra vistos desde cada sitio lunar.

## Qué ofrece y cómo se usa (API)

- Observador en un punto de la superficie: `CENTER='coord'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt'`.
- **Detalle crítico:** por default el sitio se interpreta sobre la Tierra. Para anclar el observador a la **superficie lunar** hay que especificar el cuerpo con `CENTER='coord@301'` (301 = código de la Luna).
- Target **Sol** = `COMMAND='10'`, target **Tierra** = `COMMAND='399'`.
- `QUANTITIES=4` (azimut/elevación aparente topocéntrica).
- Formatos de respuesta: `format=text` (texto plano) o `format=json` (estructurado).
- Manual oficial: https://ssd.jpl.nasa.gov/horizons/manual.html

**Ya confirmado y en producción (14-nov-2026):** `pipeline/src/touchdown_pipeline/horizons.py` usa exactamente `coord@301` + `QUANTITIES=4` contra la API real de Horizons (DE441). Cada archivo de efemérides generado (`web/public/data/ephemeris/*.json`) trae el campo `source` con la llamada exacta usada, por ejemplo `"JPL Horizons DE441, coord@301, QUANTITIES=4"` — ya no es una suposición a validar, es lo que corrió.

## Utilidad para el proyecto

- **Datos (pipeline):** fuente principal de las efemérides Sol/Tierra. Alimenta directamente `GET /api/sites/{id}/ephemeris` (azimut/elevación por paso de tiempo) del contrato de datos (sección 7 de `CLAUDE.md`), vía el tipo compartido `EphemerisFile`/`Track` de `@touchdown/core`.
- **Web + VR:** esos valores mueven el diagrama polar, la línea de tiempo, y posicionan el Sol y la Tierra en la escena de **three.js/WebXR** (`web/lib/mission/scoring.ts`, `web/lib/mission/global-track.ts`) — conversión directa `az/el → dirección 3D`.
- **Principio clave del proyecto:** todo esto se **precalcula offline** y se sirve como JSON; nada de llamadas en vivo a Horizons durante el demo (riesgo de internet en el evento).
