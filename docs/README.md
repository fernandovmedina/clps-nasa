# Docs — fuentes de datos del reto

Análisis de las fuentes de datos oficiales del reto (pestaña *Resources*), separadas por archivo. Para cada una: qué es, qué ofrece, cómo se usa, y a qué parte del proyecto le sirve.

| Fuente | Archivo | Rol principal que la usa | Para qué |
|---|---|---|---|
| LROC QuickMap | [`quickmap.md`](./quickmap.md) | Datos | Validar horizonte/LOS calculado contra una fuente independiente |
| NASA Moon Trek | [`moon-trek.md`](./moon-trek.md) | Datos | Descargar el DEM real (GeoTIFF) de cada sitio del polo sur |
| JPL Horizons | [`jpl-horizons.md`](./jpl-horizons.md) | Datos | Efemérides Sol/Tierra (az/el) por sitio y fecha; o SPICE como alternativa offline |
| CSA Moon Exploration | [`csa-moon-exploration.md`](./csa-moon-exploration.md) | Pitch/diseño | Contexto narrativo de "Human Exploration" para el video/página |
| Contexto LOLA + VR (investigación extendida) | [`lola-contexto-vr.md`](./lola-contexto-vr.md) | VR / Datos | Física de LOLA, DEMs oficiales descargables (Site01/Site04), fórmulas de horizonte con curvatura lunar, geometría Sol/Tierra con SPICE, y propuesta de arquitectura WebXR |

**Nota:** ninguna de las fuentes 1-4 expone directamente el formato final que consumen la web o el VR (JSON del contrato, RAW16 del terreno). Todas pasan primero por el **pipeline de Python** (sección 5 de `CLAUDE.md`), que las transforma a los formatos precalculados definidos en el contrato de datos (sección 7).

El documento `lola-contexto-vr.md` fue escrito como investigación independiente para un enfoque WebXR; antes de usarlo como guía de implementación, reconciliar con el equipo los puntos señalados en su sección final ("Nota de coherencia con el resto del proyecto").
