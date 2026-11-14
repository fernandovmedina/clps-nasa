# LROC QuickMap

**URL:** https://quickmap.lroc.asu.edu/

**Qué es:** visor de mapas interactivo de ASU/LROC. Permite explorar capas de LOLA (DEM) y mosaicos LROC sobre la superficie lunar.

**Qué ofrece:**
- Capas de **DEM de LOLA** y mosaicos de imagen de **LROC**, navegables por zoom/pan.
- Herramienta de **perfil de elevación** (traza una línea y muestra el corte de terreno).
- Capas de **iluminación** (porcentaje de tiempo iluminado a lo largo de una lunación) y de **línea de visión (LOS)** — permite marcar dos puntos y ver si hay línea de vista directa entre ellos, considerando el terreno real.
- Pensado para **explorar y medir**, no tanto para descargar datos en bruto (para eso está Moon Trek).

**Formato / acceso:** interfaz web (SPA), sin API pública documentada de uso sencillo para automatización. El valor está en el uso manual/visual.

## Utilidad para el proyecto

- **Datos (pipeline):** fuente de **validación independiente**. Antes de confiar en la máscara de horizonte calculada desde el DEM propio, hay que comparar manualmente contra la herramienta de LOS/perfil de elevación de QuickMap para los mismos sitios. Esto es un requisito explícito de `CLAUDE.md` (sección 10: *"Valida los cálculos contra una fuente independiente"*).
- **Web / VR:** no aporta datos directamente descargables para la app, pero sirve como referencia visual para verificar que el horizonte que se renderiza (en el diagrama polar o en el terreno VR) se parece al terreno real.
- **Pitch:** buena fuente de capturas de pantalla para justificar la precisión del proyecto frente al jurado.
