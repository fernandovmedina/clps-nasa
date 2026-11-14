# Docs — fuentes de datos del reto

Análisis de las fuentes de datos oficiales del reto (pestaña *Resources*), separadas por archivo. Para cada una: qué es, qué ofrece, cómo se usa, y a qué parte del proyecto le sirve.

| Fuente | Archivo | Rol principal que la usa | Para qué |
|---|---|---|---|
| LROC QuickMap | [`quickmap.md`](./quickmap.md) | Datos | Validar horizonte/LOS calculado contra una fuente independiente |
| NASA Moon Trek | [`moon-trek.md`](./moon-trek.md) | — | Exploración visual/validación ad hoc. **No es la fuente real del pipeline** (ver nota abajo) |
| JPL Horizons | [`jpl-horizons.md`](./jpl-horizons.md) | Datos | Efemérides Sol/Tierra (az/el) por sitio y fecha — **ya en producción**, confirmado |
| CSA Moon Exploration | [`csa-moon-exploration.md`](./csa-moon-exploration.md) | Pitch/diseño | Contexto narrativo de "Human Exploration" para el video/página |
| Contexto LOLA + VR (investigación extendida) | [`lola-contexto-vr.md`](./lola-contexto-vr.md) | VR / Datos | Física de LOLA, fórmulas de horizonte con curvatura lunar, geometría Sol/Tierra — referencia científica profunda |

**Actualizado 14-nov-2026:** el pipeline real (`pipeline/`, integrado al repo) usa los productos **NASA Goddard PGDA** (`LDEM_80S_80M`/`LDEM_45S_400M`/`LDEM_16`) directo por URL, no Moon Trek. Arquitectura final: **Cloudflare Workers + Durable Objects** (no AWS), VR en **WebXR/three.js** dentro de `web/` (no Unity) — ver `CLAUDE.md` sección 5. El contrato de datos de la sección 7 ya está implementado en `core/`, `worker/` y `web/`, no es un borrador.

El documento `lola-contexto-vr.md` sigue siendo útil como referencia científica (física de LOLA, fórmulas de horizonte, límites de incertidumbre) — su sección final de reconciliación arquitectónica quedó resuelta y está marcada como tal dentro del propio archivo.
