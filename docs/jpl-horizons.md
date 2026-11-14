# JPL Horizons

**URL:** https://ssd.jpl.nasa.gov/horizons/

**Qué es:** servicio de JPL para calcular **efemérides** (posiciones de cuerpos del sistema solar) con alta precisión. Es la fuente de datos del Sol y la Tierra vistos desde cada sitio lunar.

## Qué ofrece y cómo se usa (API)

- Observador en un punto de la superficie: `CENTER='coord'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt'`.
- **Detalle crítico:** por default el sitio se interpreta sobre la Tierra. Para anclar el observador a la **superficie lunar** hay que especificar el cuerpo con `CENTER='coord@301'` (301 = código de la Luna). Esto ya está anotado correctamente en `CLAUDE.md` sección 6 — confirmarlo con una llamada de prueba antes de construir el pipeline completo encima.
- Target **Sol** = `COMMAND='10'`, target **Tierra** = `COMMAND='399'`.
- `QUANTITIES` con el código de azimut/elevación aparente topocéntrica (consultar el manual para el código exacto; históricamente es el código `4`).
- Formatos de respuesta: `format=text` (texto plano) o `format=json` (estructurado).
- Manual oficial: https://ssd.jpl.nasa.gov/horizons/manual.html

## Alternativa offline: NAIF SPICE

Para no depender de internet durante el demo, `CLAUDE.md` recomienda **NAIF SPICE** con `spiceypy` (kernels `de440`/`de441` planetarios, PCK lunar de alta precisión `moon_pa_de440`, lunar FK, LSK) como alternativa local a Horizons.

- NAIF/SPICE: https://naif.jpl.nasa.gov/
- Documentación `spkpos`: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html

Ver [`lola-contexto-vr.md`](./lola-contexto-vr.md) sección 5 para un esqueleto de código con `spiceypy` (obtención de vectores Sol/Tierra en el marco `MOON_ME` y proyección a azimut/elevación local ENU).

## Utilidad para el proyecto

- **Datos (pipeline):** fuente principal de las efemérides Sol/Tierra. Alimenta directamente `GET /api/sites/{id}/ephemeris` (azimut/elevación por paso de tiempo) del contrato de datos (sección 7 de `CLAUDE.md`).
- **Web:** esos valores son los que mueve el diagrama polar y la línea de tiempo.
- **VR:** los mismos az/el son los que posicionan los objetos Sol y Tierra en la escena de Unity (o Three.js) — conversión directa `az/el → dirección 3D`.
- **Principio clave del proyecto:** todo esto se **precalcula offline** y se sirve como JSON; nada de llamadas en vivo a Horizons durante el demo (riesgo de internet en el evento).
