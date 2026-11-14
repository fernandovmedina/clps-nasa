# NASA Moon Trek

**URL:** https://trek.nasa.gov/moon/

**Qué es:** portal de JPL/NASA para **descargar** datos lunares recortados por área de interés (a diferencia de QuickMap, que es más para explorar/medir).

**Qué ofrece:**
- DEMs de **LOLA** (incluye productos de alta resolución cerca del polo sur, ~5–20 m/pixel en algunas zonas) y mosaicos de **LROC**.
- Herramienta para dibujar un área de interés sobre el mapa y exportar el recorte.
- Exportación típica en **GeoTIFF** (y otros formatos ráster estándar).

**Formato / acceso:** interfaz web (SPA), descarga manual del recorte elegido. No se confirmó una API REST simple de recorte automatizado en esta revisión; se asume descarga manual vía la UI.

## Utilidad para el proyecto — actualizado 14-nov-2026, no es lo que terminó usándose

**El pipeline real NO usa Moon Trek.** `pipeline/src/touchdown_pipeline/lola.py` descarga directo los productos completos de **NASA Goddard PGDA** (`LDEM_80S_80M` 80 m/px, `LDEM_45S_400M` 400 m/px, `LDEM_16` global ~1.9 km/px — ver [`lola-contexto-vr.md`](./lola-contexto-vr.md) sección 2.1), sin pasar por la UI de recorte de Moon Trek. Era la ruta planeada originalmente, pero PGDA resultó más directo (descarga programática por URL, sin recorte manual).

- **Datos (pipeline):** ya no es la fuente usada. Dejar esta página como referencia de una herramienta NASA útil para explorar/recortar visualmente, no como parte del pipeline real.
- **VR / Web:** el heightmap real (`GET /api/sites/{id}/terrain`, RAW16 513×513) viene de los productos PGDA procesados por `pipeline/`, consumido por la app WebXR/three.js en `web/` (ya no Unity — ver `CLAUDE.md` sección 9, decisión 14-nov).
- **Uso que le queda:** exploración visual manual y validación cruzada ad hoc, igual que QuickMap — no como fuente de datos del pipeline.
