# NASA Moon Trek

**URL:** https://trek.nasa.gov/moon/

**Qué es:** portal de JPL/NASA para **descargar** datos lunares recortados por área de interés (a diferencia de QuickMap, que es más para explorar/medir).

**Qué ofrece:**
- DEMs de **LOLA** (incluye productos de alta resolución cerca del polo sur, ~5–20 m/pixel en algunas zonas) y mosaicos de **LROC**.
- Herramienta para dibujar un área de interés sobre el mapa y exportar el recorte.
- Exportación típica en **GeoTIFF** (y otros formatos ráster estándar).

**Formato / acceso:** interfaz web (SPA), descarga manual del recorte elegido. No se confirmó una API REST simple de recorte automatizado en esta revisión; se asume descarga manual vía la UI.

## Utilidad para el proyecto

- **Datos (pipeline):** es la fuente **principal** para obtener el DEM real de cada sitio (Malapert A, Mons Mouton, etc.). El flujo es: recortar el área en Moon Trek → descargar GeoTIFF → abrir con `rasterio` en Python → generar la máscara de horizonte (sección 6 de `CLAUDE.md`) y el heightmap recortado para VR/3D.
- **VR:** el heightmap que consume Unity (`GET /api/sites/{id}/terrain`, formato RAW16) se genera a partir de este GeoTIFF. Es el primer eslabón de la cadena que termina en el terreno que se ve en el Quest.
- **Web:** mismo GeoTIFF es la fuente de la máscara de horizonte (`horizon_deg[az]`) que alimenta el diagrama polar.

**Pendiente de confirmar con la persona de Datos:** si Moon Trek expone alguna API de descarga programática, o si el flujo es 100% manual (recortar y bajar un archivo por sitio).

> **Ver también:** [`lola-contexto-vr.md`](./lola-contexto-vr.md) documenta una fuente alternativa/complementaria de DEMs ya recortados y listos para descarga directa por URL (NASA Goddard PGDA, sitios Site01/Site04), que puede ser más rápida que recortar a mano en Moon Trek para el MVP del hackathon.
