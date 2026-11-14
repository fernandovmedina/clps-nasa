# Fuentes de datos del reto — análisis y utilidad para el proyecto

Análisis de las fuentes de datos oficiales del reto (pestaña *Resources*). Para cada una: qué es, qué ofrece, cómo se usa, y a qué parte del proyecto le sirve.

---

## 1. LROC QuickMap

**URL:** https://quickmap.lroc.asu.edu/

**Qué es:** visor de mapas interactivo de ASU/LROC. Permite explorar capas de LOLA (DEM) y mosaicos LROC sobre la superficie lunar.

**Qué ofrece:**
- Capas de **DEM de LOLA** y mosaicos de imagen de **LROC**, navegables por zoom/pan.
- Herramienta de **perfil de elevación** (traza una línea y muestra el corte de terreno).
- Capas de **iluminación** (porcentaje de tiempo iluminado a lo largo de una lunación) y de **línea de visión (LOS)** — permite marcar dos puntos y ver si hay línea de vista directa entre ellos, considerando el terreno real.
- Pensado para **explorar y medir**, no tanto para descargar datos en bruto (para eso está Moon Trek).

**Formato / acceso:** interfaz web (SPA), sin API pública documentada de uso sencillo para automatización. El valor está en el uso manual/visual.

**Utilidad para el proyecto:**
- **Datos (pipeline):** fuente de **validación independiente**. Antes de confiar en la máscara de horizonte calculada desde el DEM propio, hay que comparar manualmente contra la herramienta de LOS/perfil de elevación de QuickMap para los mismos sitios. Esto es un requisito explícito de `CLAUDE.md` (sección 10: *"Valida los cálculos contra una fuente independiente"*).
- **Web / VR:** no aporta datos directamente descargables para la app, pero sirve como referencia visual para verificar que el horizonte que se renderiza (en el diagrama polar o en el terreno VR) se parece al terreno real.
- **Pitch:** buena fuente de capturas de pantalla para justificar la precisión del proyecto frente al jurado.

---

## 2. NASA Moon Trek

**URL:** https://trek.nasa.gov/moon/

**Qué es:** portal de JPL/NASA para **descargar** datos lunares recortados por área de interés (a diferencia de QuickMap, que es más para explorar/medir).

**Qué ofrece:**
- DEMs de **LOLA** (incluye productos de alta resolución cerca del polo sur, ~5–20 m/pixel en algunas zonas) y mosaicos de **LROC**.
- Herramienta para dibujar un área de interés sobre el mapa y exportar el recorte.
- Exportación típica en **GeoTIFF** (y otros formatos ráster estándar).

**Formato / acceso:** interfaz web (SPA), descarga manual del recorte elegido. No se confirmó una API REST simple de recorte automatizado en esta revisión; se asume descarga manual vía la UI.

**Utilidad para el proyecto:**
- **Datos (pipeline):** es la fuente **principal** para obtener el DEM real de cada sitio (Malapert A, Mons Mouton, etc.). El flujo es: recortar el área en Moon Trek → descargar GeoTIFF → abrir con `rasterio` en Python → generar la máscara de horizonte (sección 6 de `CLAUDE.md`) y el heightmap recortado para VR/3D.
- **VR:** el heightmap que consume Unity (`GET /api/sites/{id}/terrain`, formato RAW16) se genera a partir de este GeoTIFF. Es el primer eslabón de la cadena que termina en el terreno que se ve en el Quest.
- **Web:** mismo GeoTIFF es la fuente de la máscara de horizonte (`horizon_deg[az]`) que alimenta el diagrama polar.

**Pendiente de confirmar con la persona de Datos:** si Moon Trek expone alguna API de descarga programática, o si el flujo es 100% manual (recortar y bajar un archivo por sitio).

---

## 3. JPL Horizons

**URL:** https://ssd.jpl.nasa.gov/horizons/

**Qué es:** servicio de JPL para calcular **efemérides** (posiciones de cuerpos del sistema solar) con alta precisión. Es la fuente de datos del Sol y la Tierra vistos desde cada sitio lunar.

**Qué ofrece y cómo se usa (API):**
- Observador en un punto de la superficie: `CENTER='coord'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt'`.
- **Detalle crítico:** por default el sitio se interpreta sobre la Tierra. Para anclar el observador a la **superficie lunar** hay que especificar el cuerpo con `CENTER='coord@301'` (301 = código de la Luna). Esto ya está anotado correctamente en `CLAUDE.md` sección 6 — confirmarlo con una llamada de prueba antes de construir el pipeline completo encima.
- Target **Sol** = `COMMAND='10'`, target **Tierra** = `COMMAND='399'`.
- `QUANTITIES` con el código de azimut/elevación aparente topocéntrica (consultar el manual para el código exacto; históricamente es el código `4`).
- Formatos de respuesta: `format=text` (texto plano) o `format=json` (estructurado).
- Alternativa local sin llamadas en vivo: **NAIF SPICE** con `spiceypy` (kernels `de440`/`de441`, PCK lunar `moon_pa_de440`), que es la opción recomendada por `CLAUDE.md` para no depender de internet durante el demo.

**Utilidad para el proyecto:**
- **Datos (pipeline):** fuente principal de las efemérides Sol/Tierra. Alimenta directamente `GET /api/sites/{id}/ephemeris` (azimut/elevación por paso de tiempo) del contrato de datos (sección 7 de `CLAUDE.md`).
- **Web:** esos valores son los que mueve el diagrama polar y la línea de tiempo.
- **VR:** los mismos az/el son los que posicionan los objetos Sol y Tierra en la escena de Unity — conversión directa `az/el → dirección 3D`.
- **Principio clave del proyecto:** todo esto se **precalcula offline** y se sirve como JSON; nada de llamadas en vivo a Horizons durante el demo (riesgo de internet en el evento).

---

## 4. Agencia Espacial Canadiense (CSA) — Moon Exploration

**URL:** https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/

**Qué es:** página de divulgación/educativa de la CSA, no un recurso técnico de datos.

**Qué ofrece:**
- Noticias sobre el astronauta canadiense Jeremy Hansen.
- Material sobre **Canadarm3**, **Gateway** (la estación lunar internacional) y la **campaña Artemis**.
- Enlaces a un rover utilitario canadiense en desarrollo.
- **No contiene** datos técnicos de iluminación, topografía, sitios de aterrizaje ni comunicación Tierra-Luna.

**Utilidad para el proyecto:**
- **No aplica al pipeline de datos.** No hay DEMs, efemérides ni métricas aquí.
- **Pitch / narrativa:** único uso real es como material de contexto para conectar el proyecto con el ángulo **"Human Exploration"** del reto (astronautas, Gateway) en el guion del video o la página del proyecto. Es responsabilidad del rol de Pitch/diseño, no de Datos ni de VR.

---

## Resumen — quién usa qué

| Fuente | Rol principal que la usa | Para qué |
|---|---|---|
| QuickMap | Datos | Validar horizonte/LOS calculado contra una fuente independiente |
| Moon Trek | Datos | Descargar el DEM real (GeoTIFF) de cada sitio del polo sur |
| JPL Horizons | Datos | Efemérides Sol/Tierra (az/el) por sitio y fecha; o SPICE como alternativa offline |
| CSA Moon Exploration | Pitch/diseño | Contexto narrativo de "Human Exploration" para el video/página |

**Nota:** ninguna de estas fuentes expone directamente el formato final que consumen la web o el VR (JSON del contrato, RAW16 del terreno). Todas pasan primero por el **pipeline de Python** (sección 5 de `CLAUDE.md`), que las transforma a los formatos precalculados definidos en el contrato de datos (sección 7).
