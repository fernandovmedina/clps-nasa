# Contexto técnico — Simulador VR de selección de sitios de aterrizaje lunar

**Proyecto:** CLPS Lunar Mission Browser / explorador del polo sur de la Luna
**Objetivo de este documento:** que Claude pueda implementar, o dirigir la implementación, de un simulador WebXR para Meta Quest 3S y navegador de escritorio que utilice datos reales de NASA/LOLA para **comparar regiones de aterrizaje, relieve, iluminación solar y ventanas de comunicación con la Tierra**.
**Fecha de investigación:** 14 de noviembre de 2026.
**Alcance:** investigación de fuentes oficiales, fórmulas y propuesta técnica reproducible. **No** se ha ejecutado aquí un cálculo geoespacial sobre los archivos GeoTIFF ni se han validado coordenadas de puntos individuales. No presentar los lugares mencionados como puntos certificados ni afirmar que NASA los ordenó de mejor a peor.

---

## 0. Instrucciones prioritarias para Claude

Actúa como ingeniero de software científico y desarrollador 3D. La meta es un **MVP funcional, didáctico y científicamente honesto**.

1. Mantén separadas las tres capas: **mediciones LOLA** (históricas), **modelos derivados** (DEM, pendiente, horizontes) y **resultados dependientes de la fecha** (Sol, Tierra, sombra, visibilidad).
2. **LOLA NO es el láser que una nave utiliza para aterrizar en tiempo real.** LOLA viaja en el Lunar Reconnaissance Orbiter (LRO) y mide la superficie para construir mapas. Un altímetro/lidar a bordo de un módulo de aterrizaje sería otro sistema.
3. La resolución de un archivo **5 m/píxel NO equivale a cinco metros de detalle observado sin huecos**: gran parte del DEM se interpola. Nunca garantizar seguridad de aterrizaje ni ausencia de rocas pequeñas usando solo LOLA.
4. Prioriza dos regiones con archivos oficiales disponibles: **Site01 (Connecting Ridge)** y **Site04 (Shackleton Rim)**. Agrega Site07 (Peak Near Shackleton) o Site23 (Malapert Massif) si queda tiempo. Dentro de una región, elige puntos **únicamente mediante análisis real del raster**; no inventes latitud, longitud, altura ni puntuaciones.
5. Calcula los resultados científicos **fuera del navegador** (Python + GIS + SPICE) y exporta archivos compactos. En el Meta Quest 3S, React/Three.js/WebXR debe reproducir la escena y consultar resultados precalculados sin cargar GeoTIFF gigantes ni efectuar cálculos astronómicos pesados en tiempo real.
6. Marca cualquier resultado de prueba como `demo/mock`, no como `NASA`, y deja visible origen, periodo, resolución y nivel de confianza.
7. Antes de calcular, define **intervalo temporal**, **altura de observación**, **área útil de aterrizaje** y **criterios del módulo de aterrizaje**. La NASA no publica un único umbral universal ni un sitio óptimo para todas las misiones.
8. No confundas **promedio histórico** de iluminación/visibilidad con el estado a una fecha y hora concretas.

---

## 1. ¿Qué es LOLA y cómo funciona el láser?

**LOLA** significa *Lunar Orbiter Laser Altimeter*. Está instalado en la nave **Lunar Reconnaissance Orbiter (LRO)**. Su misión es determinar la **topografía geodésica de la Luna**, pendientes, rugosidad e información para investigar iluminación polar y apoyar la selección de sitios de exploración.

### 1.1 Cadena física de medición

1. LOLA emite un **pulso láser infrarrojo**.
2. Un elemento óptico difractivo divide el pulso en **cinco haces**, que producen cinco huellas de medición en la superficie.
3. La luz se refleja/dispersa en el suelo y regresa a los receptores.
4. El instrumento registra **tiempo de ida y vuelta**, **anchura del pulso recibido** y **energía transmitida/recibida**.
5. Con la posición y orientación orbitales de LRO se geolocalizan los puntos medidos en el sistema lunar. Correcciones de órbita, actitud y tiempo son indispensables para coordenadas precisas.
6. La acumulación de múltiples trayectorias orbitales genera **nubes de puntos**; su depuración, ajuste e interpolación permiten crear **modelos digitales de elevación (DEM/LDEM)**.

**Principio elemental del tiempo de vuelo (modelo ideal):**

```text
D = c * Δt / 2

D   = distancia instrumento-superficie (m)
c   = velocidad de la luz, ~299 792 458 m/s
Δt  = intervalo de ida y vuelta del pulso (s)
```

**Ejemplo meramente físico:** si `Δt = 0.000333564 s`, entonces `D ≈ 50 km`. Esto **no** produce por sí solo una coordenada geográfica ni una altura sobre un datum; para ello se necesita el estado orbital de la nave, el ángulo del haz y el marco de referencia.

En su órbita polar nominal cercana a 50 km, LOLA emitía pulsos a **28 Hz** y medía una franja de cinco perfiles de aproximadamente **50 m de ancho**. En una descripción del conjunto de datos EDR de NASA PDS, cada huella es de aproximadamente **5 m de diámetro** y hay del orden de **25 m** entre huellas del patrón. Son características de muestreo, **no la resolución de todos los DEM ni garantía de cobertura completa**.

### 1.2 Qué se infiere de las señales

| Medición física | Uso científico | Precaución |
|---|---|---|
| Tiempo de vuelo del láser | Distancia instrumento-suelo; con navegación orbital se obtiene elevación | Exige geolocalización y correcciones |
| Cinco mediciones en patrón bidimensional | Pendientes a lo largo y transversalmente a la trayectoria | Muestreo limitado; no equivale a un escaneo continuo |
| Ensanchamiento del eco | Indicios de rugosidad/variación de alturas dentro de la huella | Requiere interpretación instrumental y geométrica |
| Energía emitida y retornada | Reflectancia aproximada de superficie | Depende de calibración y geometría; no identifica hielo por sí sola |

**Fuentes NASA:**
- Instrumento LOLA: https://science.nasa.gov/mission/lro/lola/
- NASA Planetary Data System (instrumento): https://pds.nasa.gov/ds-view/pds/viewContext.jsp?identifier=urn%3Anasa%3Apds%3Acontext%3Ainstrument%3Alro.lola
- Descripción del EDR LOLA: https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LRO-L-LOLA-2-EDR-V1.0

### 1.3 Qué NO hace LOLA

LOLA **no elige automáticamente el lugar de aterrizaje**, no informa en vivo la distancia de un lander a la superficie y no resuelve por sí solo el problema de aterrizaje. Sus datos son un **insumo topográfico**. La idoneidad del sitio se evalúa junto con iluminación dependiente de fecha, línea de vista hacia la Tierra, restricciones del vehículo, peligros superficiales, interés científico, accesibilidad, etc.

---

## 2. Productos NASA realmente útiles para el prototipo

### 2.1 DEMs locales de alta resolución: NASA Goddard / PGDA

**Página principal:** https://pgda.gsfc.nasa.gov/products/78
**Directorio:** https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/

La página NASA Goddard publica para diferentes sitios:

- `LDEM`: elevación de terreno interpolada, en **metros**.
- `Slope`: pendiente, en **grados**.
- `LDEC`: cantidad de retornos/huellas LOLA por píxel.
- `Total Z uncertainty`: incertidumbre RMS de elevación, en **metros**.
- `Slope uncertainty`: incertidumbre RMS de pendiente, en **grados**.
- `XYZI`: nube de puntos ajustada y depurada.
- `ROI shapefiles`: polígonos de regiones de interés.
- `Clones`: múltiples realizaciones del terreno para estudiar cómo la incertidumbre afecta los resultados.

**Formato:** GeoTIFF local de **5 m/píxel**, proyección **estereográfica polar sur**, coordenadas X/Y en metros, referencia lunar **MOON_ME asociada a DE421**. Hay que comprobar metadatos, escalas, NoData, origen, orientación de ejes y datum antes de combinar archivos.

**Archivos específicos para empezar:**

**Site01 — Connecting Ridge**
- Elevación: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif
- Pendiente: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_slp.tif
- Recuento de retornos: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_ldec.tif
- Incertidumbre Z: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_toterr.tif
- Incertidumbre pendiente: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_slperr.tif

**Site04 — Shackleton Rim**
- Elevación: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif
- Pendiente: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_slp.tif
- Recuento de retornos: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_ldec.tif
- Incertidumbre Z: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_toterr.tif
- Incertidumbre pendiente: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_slperr.tif

**Importante:** algunos enlaces conducen directamente a binarios TIFF que un lector web no previsualiza; esto no implica que el archivo esté ausente. Para localizar otros sitios y archivos, utilizar la página índice oficial en lugar de generar URLs por suposición.

### 2.2 Límites reales del DEM de 5 m/píxel

El estudio del equipo NASA Goddard indica que, en estos mapas polares de 5 m/píxel, **aproximadamente 90 % de los píxeles pueden estar interpolados** debido a la separación entre trayectorias y huellas. Para las regiones de interés del estudio, las medianas de error RMS fueron aproximadamente **0.30–0.50 m en altura** y **1.5–2.5° en pendiente**. Esos valores **no son errores uniformes ni garantías para todo píxel**; pueden cambiar según sitio, interpolación y densidad de mediciones.

**Consecuencia:** una celda interpolada etiquetada con pendiente de 3° **no demuestra** que un módulo de aterrizaje no encontrará una roca, pequeña zanja o pendiente local peligrosa. Use mapas fotográficos y otros instrumentos si se necesita resolución de peligros a escala submétrica. Estos mapas son excelentes para un **filtro preliminar de sitios** y para visualización educativa.

**Referencia:** https://pgda.gsfc.nasa.gov/products/78

### 2.3 Mosaico amplio del polo sur

**NASA PGDA:** https://pgda.gsfc.nasa.gov/products/81

Contiene mosaico de la zona **87° S–90° S**, derivado de 97 campos solapados, a **5 m/píxel**. Tamaños publicados: elevación ~**3.3 GB**, pendiente ~**4.9 GB**, recuento ~**140 MB**. **No descargarlo ni procesarlo dentro de Quest Browser.** Usar solo para una etapa posterior con CPU/almacenamiento suficiente; para hackathon, comenzar con los sitios locales.

### 2.4 Mapas NASA de iluminación y visibilidad de la Tierra

**Página de NASA PGDA:** https://pgda.gsfc.nasa.gov/products/69

Este recurso es especialmente valioso porque dispone de mapas derivados de LOLA de:

- **Iluminación solar media**.
- **Sombra permanente**.
- **Visibilidad media de la Tierra**.
- **Visibilidad de cielo**.

Para el área **85° S–90° S** hay productos de **60 m/píxel**; también hay mapas más amplios de **120 y 240 m/píxel**. Los productos de iluminación/visibilidad promedio se construyeron sobre un período relacionado con el **ciclo de nutación lunar de ~18.6 años**, a intervalos horarios en el trabajo de referencia.

**Regla fundamental:** un raster con un promedio de 60 % de visibilidad de la Tierra **no significa** que la Tierra sea visible a las 15:00 de una fecha específica; para eso es necesario hacer un cálculo temporal aparte.

En ese producto NASA, se consideró la Tierra visible si **alguna parte de su disco** sobresalía del relieve, una definición **optimista** frente al requisito de un enlace real con estaciones terrestres. Verificar este criterio antes de presentar métricas de comunicación.

Enlaces: página oficial anterior → secciones **Average solar illumination**, **Permanent shadow** y **Average Earth visibility** → archivos `TIF`/`COG` o repositorios PDS. **Nota de validación de enlaces:** al revisar el enlace COG de iluminación 85S/60m, el servidor devolvió 404; no depender de ese acceso concreto. La página principal también incluye TIFFs; verificar que cada enlace descargue antes de automatizarlo.

### 2.5 Marcos lunares y efemérides

- **NASA NAIF/SPICE:** https://naif.jpl.nasa.gov/
- **Documentación `spkpos`:** https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html
- **NASA/JPL Horizons:** https://ssd.jpl.nasa.gov/horizons/manual.html

**No usar WGS84 terrestre para los rásteres lunares.** Los datos locales anteriores están en un marco lunar MOON_ME/DE421. NASA NAIF explica que el alias `MOON_ME` depende de los kernels de orientación lunar cargados y que existen marcos MOON_ME asociados a distintas efemérides. Si se mezclan datos de DE421 con otro marco (por ejemplo `IAU_MOON` sin transformación), pueden aparecer desplazamientos y errores en la dirección de Sol/Tierra. Registrar en el proyecto cuál es el marco y qué kernels se usaron.

---

## 3. ¿Cuáles son los puntos 'óptimos' del polo sur lunar?

**No existe un único punto óptimo sin especificar misión y fecha.** NASA selecciona **regiones candidatas** que contienen múltiples sitios, no una clasificación pública universal de coordenadas exactas que garantice aterrizaje.

### 3.1 Regiones NASA Artemis III que sirven como referencia

NASA anunció el **28 de octubre de 2024** nueve regiones candidatas (enumeradas **sin orden de preferencia**):

1. Peak near Cabeus B.
2. Haworth.
3. Malapert Massif.
4. Mons Mouton Plateau.
5. Mons Mouton.
6. Nobile Rim 1.
7. Nobile Rim 2.
8. de Gerlache Rim 2.
9. Slater Plain.

**Fuente fechada:** https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/

Estos son **nombres de regiones**, no puntos georreferenciados listos para aterrizar; y el anuncio histórico de 2024 no debe tratarse como una clasificación válida para todas las misiones en noviembre de 2026. Tampoco se deben mezclar sin explicación las regiones candidatas de diferentes años o programas.

### 3.2 Qué comenzar a comparar en el MVP

| Región en el dataset NASA LOLA | Código | Motivo para incluirla | Conclusión válida |
|---|---|---|---|
| Connecting Ridge | Site01 | Hay LDEM, pendientes, incertidumbre y evidencia científica sobre iluminación de sus ROI | **Prioridad de análisis**, NO aterrizaje seguro certificado |
| Shackleton Rim | Site04 | Contraste útil de relieve/horizonte; cuenta con productos equivalentes | **Región a evaluar**, NO afirmar que es peor o mejor sin calcular |
| Peak near Shackleton | Site07 | Tercera región cercana, con datos LOLA de 5 m/píxel | **Alternativa** |
| Malapert Massif | Site23 | Aparece en el catálogo LOLA y en la lista NASA de 2024 | **Alternativa** sujeta a tiempo/disponibilidad |

**Resultado documentado muy interesante:** la página NASA PGDA sobre mejores DEMs informa que, para el **intervalo 1 de enero de 2024 a 1 de enero de 2026**, a **1 metro por encima de la superficie**, **Site01** concentró más área con **iluminación media mayor de 70 %**, y que dentro de ese sitio las **ROI 4–6** tuvieron condiciones favorables bajo los análisis descritos. A **5 m** sobre la superficie, el estudio encontró en Site01 períodos continuos de iluminación más prolongados que los de los sitios comparados. **No extender automáticamente este resultado a fechas posteriores ni interpretarlo como selección final de NASA para aterrizaje.**

Fuente: https://pgda.gsfc.nasa.gov/products/78

**Recomendación concreta:** comenzar con **Site01 y Site04** y dejar que la app explique *por qué* el algoritmo prefiere un candidato para una fecha y una misión definidas. Si se escoge una ROI dentro de Site01, cargar y usar los polígonos ROI de NASA en vez de asignar números o coordenadas a mano.

---

## 4. De topografía LOLA a un mapa preliminar de riesgo de aterrizaje

### 4.1 Insumos mínimos

Para cada región (en el mismo CRS lunar y misma rejilla):

```text
Z(x,y)          = altura del DEM (m)
S_NASA(x,y)     = pendiente NASA (grados), cuando esté disponible
N(x,y)          = recuento de huellas LOLA, si está disponible
σZ(x,y)         = error RMS de altura (m)
σS(x,y)         = error RMS de pendiente (grados)
NoData(x,y)     = ausencia de dato válido
ROI             = polígono de zona candidata
```

### 4.2 Pendiente local desde DEM

Para validación/comprobación (o si no se dispone del raster de pendiente oficial), en una rejilla **métrica** con separaciones `dx`, `dy`:

```text
∂Z/∂x ≈ [ Z(x+dx,y) - Z(x-dx,y) ] / (2 dx)
∂Z/∂y ≈ [ Z(x,y+dy) - Z(x,y-dy) ] / (2 dy)

slope_deg = atan( sqrt( (∂Z/∂x)^2 + (∂Z/∂y)^2 ) ) * 180/π
```

**Notas:** derivar solo después de confirmar orientación de filas, unidades y sistema de coordenadas. El cálculo da una **pendiente sobre la escala del raster**, no un mapa de obstáculos menores que la resolución efectiva. Donde haya banda NASA `slp.tif`, úsala preferentemente y conserva tu derivación como comprobación; pequeñas diferencias son esperables debido a metodología y filtrado.

### 4.3 Rugosidad/planitud de una zona de aterrizaje

Elegir una **huella operacional de aterrizaje** (`landing_footprint_m`, por ejemplo 100 m de diámetro **SOLO como parámetro de demostración, no como requerimiento NASA**).

En un círculo/ventana centrada en cada píxel candidato:

- `slope_max` = pendiente máxima válida.
- `slope_p95` = percentil 95 de pendientes.
- `elevation_std` = desviación estándar de altura (indicador simple, no idéntico a rugosidad física instrumental LOLA).
- `plane_fit_rmse` = RMSE después de ajustar un plano local `z = a*x + b*y + c`; da una medida más útil de relieve residual (deja claro escala y muestreo).
- `coverage_ratio` = proporción de píxeles válidos.
- `measured_support_ratio` = proporción de píxeles con retorno LOLA `N>0` (ojo: baja proporción no significa necesariamente mala calidad, pero sí más dependencia de interpolación).
- `uncertainty_median`, `uncertainty_p95` de altura y pendiente.

**Restricciones duras y puntuaciones blandas:**

```text
eligible(candidate) =
    is_inside_study_ROI
    AND enough_valid_data
    AND slope_p95 <= SLOPE_LIMIT_DEG
    AND plane_fit_rmse <= ROUGHNESS_LIMIT_M
    AND uncertainty <= configured_tolerance
```

Los umbrales `SLOPE_LIMIT_DEG`, `ROUGHNESS_LIMIT_M` y demás **deben ser configurables según el vehículo**. No inventar un 'límite NASA' de 5°, 8° o 10° como si fuese universal. Para una demo sin datos del módulo, mostrar los umbrales como **supuestos del equipo**.

**Limitación de seguridad:** ningún filtro de este tipo sustituye la evaluación de rocas, cráteres pequeños, resistencia del regolito, navegación de descenso, trayectoria y sensores terminales. Etiquetar como `preliminary_terrain_screening`.

---

## 5. Geometría de Sol y Tierra: cálculos por fecha y lugar

Los archivos LOLA aportan el **suelo**, pero la **posición del Sol y de la Tierra cambia con el tiempo**. Para ello usar efemérides (NAIF SPICE o Horizons) en un marco lunar consistente, no un movimiento circular ficticio dibujado en Three.js.

### 5.1 Inputs

```text
site.lat_deg                latitud planetocéntrica lunar
site.lon_deg                longitud lunar en MOON_ME, convención explícita
site.elevation_m            altura referida al mismo datum que el DEM
observer_height_m           1 m, 2 m o 5 m sobre la superficie (configurable)
datetime_utc                ISO 8601 en UTC
time_range                  inicio y fin de misión en UTC
timestep_minutes            por ejemplo 60 minutos para un primer MVP
body_frame                  MOON_ME, compatible con raster y kernels
```

En `lat_deg = -90°` exactos la definición de 'norte/este' y azimut puede ser ambigua; documentar una base local estable y probarla.

### 5.2 Posición lunar 3D del observador (aproximación esférica explícita)

Con `R = 1 737 400 m` **solo si coincide con el radio de referencia del DEM usado**:

```text
r = R + elevation_m + observer_height_m
φ = latitud en radianes
λ = longitud en radianes

P = r * [ cosφ cosλ, cosφ sinλ, sinφ ]
```

**Importante:** este es un modelo planetocéntrico esférico útil para la demo. Comprobar el datum del GeoTIFF; si se necesitan garantías de geodesia, aplicar las convenciones exactas del producto NASA.

### 5.3 Obtener Sol y Tierra con SPICE (esqueleto, no script completo listo para correr)

```python
import spiceypy as spice
import numpy as np

# Requiere kernels: leap seconds (.tls), SPK planetario/lunar,
# orientación lunar PCK de alta precisión y lunar FK compatible con el DEM.
# Registrar versiones exactas y rango temporal.
spice.furnsh('kernels.tm')
et = spice.str2et('2026-11-15T12:00:00 UTC')

sun_km, _ = spice.spkpos('SUN',   et, 'MOON_ME', 'NONE', 'MOON')
earth_km, _ = spice.spkpos('EARTH', et, 'MOON_ME', 'NONE', 'MOON')

# Ambos son vectores desde CENTRO lunar, no desde el observador.
# Convertir P a kilómetros antes de restar:
# v_sun   = np.array(sun_km)   - (P_m / 1000.0)
# v_earth = np.array(earth_km) - (P_m / 1000.0)
```

Esta versión usa posiciones **geométricas** (`NONE`) para un primer modelo coherente de direcciones. Para posiciones aparentes más rigurosas, estudiar explícitamente correcciones de tiempo de luz y aberración (`LT+S`), incluido el observador en la superficie, sin introducirlas parcialmente ni confundir posiciones en distintos tiempos. SPICE emplea **kilómetros** para posiciones, frente a los **metros** de los DEM.

**Documentación:** https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html

### 5.4 Proyección en referencia local Este-Norte-Arriba (ENU)

Aproximación usando la normal radial del sitio:

```text
E = [ -sinλ,            cosλ,          0 ]
N = [ -sinφ cosλ,  -sinφ sinλ,       cosφ ]
U = [  cosφ cosλ,   cosφ sinλ,       sinφ ]

v = target_xyz - observer_xyz
vE = dot(v,E)
vN = dot(v,N)
vU = dot(v,U)

azimuth_deg   = (atan2(vE, vN) * 180/π + 360) % 360
elevation_deg = atan2(vU, sqrt(vE² + vN²)) * 180/π
```

Si se requiere la orientación de un panel solar, usar la **normal local al terreno** para calcular incidencia, que no necesariamente es igual a la radial `U`.

### 5.5 Calcular horizonte real del terreno

**El punto más importante del problema.** El Sol puede estar geométricamente por encima del horizonte astronómico (`elevation_deg > 0`) y aun así estar oculto detrás de una cresta. La Tierra también puede quedar bloqueada.

Para cada sitio, calcular una función **`H(azimuth)`** con la elevación angular máxima que alcanzan las montañas en esa dirección. Para lograrlo:

1. Desde el punto observador, muestrear terreno a lo largo de rayos en distintos azimuts (por ejemplo cada 1° o 2° en un MVP).
2. Obtener alturas desde DEM de alta resolución cercano y, **si es posible**, DEM regional para cerros a mayor distancia. **No asignar horizonte despejado a direcciones fuera de cobertura**.
3. Convertir cada muestra a coordenadas lunares tridimensionales con la misma referencia.
4. Calcular su ángulo de elevación visto desde el observador.
5. Elegir la **máxima elevación angular** de todas las muestras válidas del rayo: ese es `H(az)`.
6. Guardar el horizonte por sitio (y por altura del observador), ya que el relieve no cambia con el tiempo.

Fórmula exacta respecto a **esfera lunar** para una muestra a distancia angular central `δ`:

```text
r0 = R + h_observador
r1 = R + h_muestra

angular_elevation = atan2( r1*cos(δ) - r0,  r1*sin(δ) )

H(az) = max(angular_elevation de muestras de ese azimut)
```

Aquí `δ` se expresa en **radianes** y `r0`, `r1`, `R` y alturas tienen unidades coherentes. Para el entorno más próximo, puede calcularse directamente mediante vectores 3D `atan2(dot(sample-observer,U), norma_proyección_horizontal)`.

**No usar simplemente** `atan((altura_montaña - altura_sitio) / distancia)` para obstáculos lejanos: omite la **curvatura de la Luna**. Tampoco restringir el horizonte al pequeño recorte local si hay elevaciones lejanas capaces de producir sombra.

**Método alternativo de producción:** generar perfiles de horizonte y usar raycasting contra un modelo de superficie lunar con curvatura explícita y cobertura regional.

### 5.6 Iluminación solar a una fecha concreta

```text
delta_sun = elevation_sun_deg - H(azimuth_sun_deg)
```

- `delta_sun < -angular_radius_sun`: disco solar completamente oculto.
- `delta_sun > +angular_radius_sun`: disco solar completamente por encima de la obstrucción.
- En medio: visibilidad **parcial** del disco solar, que requiere integrar su geometría si se desea un valor físico fraccional.

El radio angular aparente debe obtenerse de la distancia al Sol para la fecha (`asin(R_sun / distance_sun)`), no introducirlo como un número exacto invariable. Para MVP, se puede usar un criterio **binario por el centro** (`delta_sun > 0`), marcado como **aproximación**.

**Diferencia clave:** `sun_visible = true` NO equivale a 'panel solar producirá potencia suficiente'. La potencia sobre un panel aproximadamente depende de su área, eficiencia, orientación y ángulo de incidencia, además de la irradiancia y la fracción visible del Sol:

```text
P_est_W ≈ irradiance_Wm2 * panel_area_m2 * panel_efficiency
          * max(0, dot(panel_normal, sun_unit_direction))
          * visible_solar_fraction
```

Añadir pérdidas y limitaciones de sombra/temperatura si el usuario quiere una simulación de energía más rigurosa. Si no se conocen parámetros del panel, mostrar **iluminación**, no 'watts reales'.

### 5.7 Visibilidad de Tierra y comunicación

```text
delta_earth = elevation_earth_deg - H(azimuth_earth_deg)
```

Usar el mismo criterio para el disco terrestre; su radio angular visto desde la Luna es mucho mayor que el solar y depende de la distancia a la Tierra. En la capa científica distinguir:

- `earth_center_visible`: centro terrestre sobre el horizonte.
- `earth_any_disk_visible`: cualquier parte del disco geométricamente visible (**criterio NASA en los mapas medios PGDA; optimista**).
- `direct_to_earth_geometry`: posible línea de visión geométrica.
- `actual_radio_link`: **no calculado** salvo que se modelen antena, potencia, frecuencia, estaciones de seguimiento, márgenes de enlace y obstrucciones.

Una misión puede requerir relés para comunicación cuando no haya línea de vista; un punto con excelente iluminación no necesariamente tiene excelente enlace directo a Tierra.

### 5.8 Serie temporal (la parte que usarán los controles de VR)

Repetir para cada instante `t` del período seleccionado:

```text
sun[t] = {
  azimuth_deg, elevation_deg,
  above_local_horizon: bool,
  visible_fraction_estimate: number | null
}

earth[t] = {
  azimuth_deg, elevation_deg,
  above_local_horizon: bool,
  any_disk_visible: bool | null
}
```

Métricas por sitio durante la **ventana de misión seleccionada**:

```text
solar_visibility_pct = 100 * (# muestras con Sol visible) / (# muestras válidas)
earth_visibility_pct = 100 * (# muestras con Tierra visible) / (# muestras válidas)
max_continuous_darkness_hours = máxima secuencia continua sin Sol * Δt_hours
max_earth_blackout_hours = máxima secuencia sin línea de vista * Δt_hours
```

Si hay estados parciales/indeterminados, la estadística debe especificar su tratamiento. Con 1 hora de muestreo, la duración y transiciones tienen **error temporal** de aproximadamente el orden del paso de tiempo; refinar alrededor de cambios de estado. **No afirmar precisión de segundos** con muestras horarias.

---

## 6. Ranking de sitios: criterios y transparencia

NASA considera, entre otros factores, **pendiente/adecuación del terreno**, **iluminación**, **comunicación con la Tierra**, **oportunidad temporal**, **valor científico**, **accesibilidad y capacidad del vehículo**. Su comunicado de 2024 NO proporciona pesos universales.

### 6.1 Modelo propuesto por nuestro equipo (NO ranking oficial NASA)

Usar dos etapas:

**Etapa A — Filtrado preliminar:** eliminar candidatos que no cumplen los umbrales configurados por el usuario para huella, pendiente, datos válidos e incertidumbre. Los candidatos con datos insuficientes se marcan **INDETERMINADOS**, no automáticamente seguros.

**Etapa B — Puntuación informativa:** entre candidatos elegibles, puntuar métricas normalizadas `0..1`:

```text
score = 100 * (
  0.35 * solar_availability_score +
  0.30 * earth_contact_score +
  0.20 * terrain_quality_score +
  0.15 * continuity_score
)
```

Los **pesos 35/30/20/15 son una decisión del prototipo**, no de NASA. El `continuity_score` debe penalizar oscuridad y períodos sin contacto, con normalización documentada. Evitar doble contabilización: si solar_availability y continuity miden aspectos solapados, explicar el motivo y permitir cambiar los pesos. Mostrar siempre **métricas sin ponderar**, ventana temporal y restricciones, no solo un número total.

Una alternativa más honesta para el hackathon es evitar el ranking global y presentar un análisis por escenario:

- **Misión de energía solar:** prioriza continuidad de luz.
- **Misión de comunicación directa:** prioriza continuidad de Tierra visible.
- **Misión de superficie segura:** prioriza área utilizable con pendiente y riesgo topográfico bajos.

**Ejemplo de resultados:** `Sitio A: 72% de horas iluminadas` solo si fue **calculado con archivos reales**; nunca llenar porcentajes inventados y etiquetarlos como datos NASA.

### 6.2 Incertidumbre

Para cada candidato conservar `sigma_z`, `sigma_slope`, cobertura, celdas interpoladas y resolución. Si hay tiempo, repetir análisis de horizonte/visibilidad con algunas de las realizaciones `clones` de NASA, y mostrar un **rango**. Si no se implementan clones, mostrar un aviso de 'incertidumbre topográfica no propagada a la iluminación'.

---

## 7. Arquitectura de implementación recomendada (para Claude)

```text
NASA PGDA GeoTIFF / NASA SPICE kernels
                   │
                   ▼
     Python OFFLINE (rasterio, numpy,
     pyproj compatible con CRS lunar,
     shapely, scipy, spiceypy)
         │                │
         │                ├── Recortes y mallas 3D simplificadas (.glb)
         │                ├── Candidatos (pendiente, calidad, ROI)
         │                ├── Horizonte H(az) por sitio
         │                └── Series temporales Sol/Tierra
         ▼
        JSON compactos + glTF/GLB optimizado
                   │
                   ▼
        React + Three.js / React Three Fiber
        + @react-three/xr + WebXR
              │             │
              ▼             ▼
     navegador laptop    Meta Quest 3S
```

**Por qué:** Meta Quest 3S puede renderizar experiencia WebXR, pero conviene minimizar geometría, memoria, física y procesamiento geoespacial. Para la primera demo, hacer una vista orbital estilizada separada de la vista de terreno **derivado de NASA**. Es válido usar tamaños/distancias artísticas en la vista orbital si se etiquetan **no a escala**; no reutilizarlos para cálculos físicos.

### 7.1 Pipeline mínimo viable

1. Descargar y abrir **Site01** y **Site04** (LDEM, pendiente, recuento, incertidumbres).
2. Verificar CRS, dimensiones, transformación, NoData, rangos de elevación, unidades y alineación entre archivos.
3. Definir ROI/polígonos; elegir candidatos con estadísticas de ventana (sin coordenadas inventadas).
4. Crear mallas 3D locales a partir de recortes adecuados y reducir polígonos sin distorsionar excesivamente el horizonte.
5. Estimar horizonte por azimut; preferir cobertura regional y señalar azimuts no cubiertos.
6. Precalcular efemérides para el período de demo (ej., 24–72 horas definidas de forma explícita) y a la altura de usuario seleccionada.
7. Evaluar Sol/Tierra frente a horizonte; generar métricas, intervalos de sombra y blackout.
8. Exportar JSON por sitio y `GLB` para el visor.
9. En React, hacer selector de sitio, selector de fecha/hora, vista desde superficie y panel comparativo.
10. Probar **en un Quest 3S real**, además de escritorio; nunca confiar exclusivamente en simulador de escritorio para confirmar WebXR.

### 7.2 Contrato JSON sugerido

**Los valores numéricos de ejemplo que se muestran a continuación son de ESQUEMA, no mediciones NASA:**

```json
{
  "schema_version": "1.0",
  "data_status": "REAL_NASA_DERIVED_OR_DEMO_MUST_BE_SET",
  "site_id": "Site01_ROI_to_be_computed",
  "site_label": "Connecting Ridge",
  "coordinates": { "latitude_deg": null, "longitude_deg": null,
                   "projection_x_m": null, "projection_y_m": null,
                   "frame": "MOON_ME_DE421" },
  "terrain": {
    "elevation_m": null,
    "slope_p95_deg": null,
    "roughness_rmse_m": null,
    "z_uncertainty_rms_m": null,
    "slope_uncertainty_rms_deg": null,
    "lola_measured_support_ratio": null,
    "resolution_m_per_pixel": 5,
    "source": "NASA_PGDA_LOLA_5mpp"
  },
  "observer_height_m": 1,
  "time_range_utc": { "start": null, "end": null, "step_minutes": 60 },
  "horizon": {
    "azimuth_step_deg": 2,
    "elevation_deg_by_azimuth": [],
    "uncovered_azimuths_deg": []
  },
  "observations": [
    {
      "timestamp_utc": null,
      "sun": { "azimuth_deg": null, "elevation_deg": null,
               "center_visible": null },
      "earth": { "azimuth_deg": null, "elevation_deg": null,
                 "center_visible": null, "any_disk_visible": null }
    }
  ],
  "summary": {
    "solar_visibility_pct": null,
    "earth_visibility_pct": null,
    "max_continuous_darkness_hours": null,
    "max_earth_blackout_hours": null,
    "ranking_score_demo": null
  },
  "uncertainty_note": "No sustituye un estudio de ingeniería de aterrizaje",
  "sources": ["https://pgda.gsfc.nasa.gov/products/78"]
}
```

**Pautas:** convertir a `number` solo después de lectura real; mantener `null` para indeterminados. Guardar fecha UTC e indicar temporalidad/rango al usuario. El campo `data_status` debe reemplazarse por un enum real (`NASA_DERIVED`, `DEMO_MOCK`, `PARTIAL`) y sustentarse en el procesamiento.

### 7.3 Posibles módulos de código

```text
scripts/
  inspect_rasters.py       # metadatos, bandas, NoData, CRS lunar
  extract_sites.py         # recorte ROIs y conversión a mallas
  terrain_metrics.py       # pendientes, ajuste de plano, densidad, errores
  lunar_horizon.py         # perfil H(az), curvatura lunar
  ephemeris.py             # SPICE Sol/Tierra en MOON_ME
  visibility.py            # luz y comunicación en función de la fecha
  export_for_web.py        # JSON + GLB optimizados

src/
  components/SpaceOverview.tsx
  components/LunarSurface.tsx
  components/SiteSelector.tsx
  components/TimeSlider.tsx
  components/ScientificPanel.tsx
  components/VRControls.tsx
  data/...
```

---

## 8. Pruebas que Claude debe implementar

1. **Prueba de distancia láser:** al duplicar el tiempo de vuelo ideal, la distancia calculada se duplica; unidades correctas.
2. **Prueba de pendiente:** DEM plano → `slope_deg ≈ 0`; rampa `z=x` (1 m/m) → ≈45° lejos de bordes.
3. **Prueba de hemisferio:** latitud del sitio debe ser sur; `-89°` está cerca del polo sur, `+89°` cerca del norte.
4. **Prueba de azimut:** vectores Este/Norte/Arriba devuelven azimut 90°/0° y elevación 90° para un objetivo directamente arriba.
5. **Prueba de curvatura:** en terreno esférico sin relieve, un obstáculo a larga distancia puede quedar bajo el horizonte local aunque su altura sobre el datum sea parecida.
6. **Prueba de cresta:** si `H(az_sol)=+4°` y `elevation_sun=+2°`, el Sol central está oculto; si `elevation_sun=+6°`, está visible.
7. **Prueba temporal:** al calcular porcentajes no mezclar promedio de 18.6 años con 24 horas de una misión definida.
8. **Prueba faltantes:** con NoData o direcciones fuera del DEM → `unknown`, nunca asignar automáticamente visibilidad total.
9. **Prueba de confianza:** mayor error topográfico/menor densidad debe reflejar incertidumbre, no producir falsa exactitud.
10. **Prueba móvil/VR:** botones, textos, selector de hora y menús legibles con controladores Meta Quest 3S; escena a velocidad estable; tamaños planetarios explicados como no a escala si aplica.

---

## 9. Riesgos y límites que se deben presentar explícitamente

- **LOLA es cartografía orbital**, no sensor de aterrizaje en tiempo real.
- Un mapa a **5 m/píxel puede incluir gran interpolación**. No detecta todas las rocas ni certifica una superficie segura.
- **Diferencias de CRS** (MOON_ME/DE421 vs IAU_MOON o WGS84) alteran coordenadas y orientaciones.
- Un DEM local puede omitir **montañas lejanas** que bloquean el Sol bajo del polo sur.
- **Promedios históricos** no sustituyen estado del Sol/Tierra en una fecha concreta.
- Sol sobre horizonte ≠ potencia solar garantizada; Tierra visible ≠ enlace real con una estación DSN.
- Las clasificaciones dependen de **duración, momento, altura de antena/panel, huella del vehículo y requisitos del lander**.
- No se ha calculado aquí el mejor píxel o coordenada del polo sur. El algoritmo debe obtenerlos antes de hablar de resultados concretos.

---

## 10. Fuentes oficiales y técnicas (consultadas)

1. **NASA Science — Lunar Orbiter Laser Altimeter (LOLA).** Funcionamiento de los cinco haces, tiempo de vuelo, rugosidad y reflectancia.
   https://science.nasa.gov/mission/lro/lola/
2. **NASA PDS — Contexto del instrumento LOLA.** Caracterización física y datos instrumentales.
   https://pds.nasa.gov/ds-view/pds/viewContext.jsp?identifier=urn%3Anasa%3Apds%3Acontext%3Ainstrument%3Alro.lola
3. **NASA PDS — EDR LOLA.** Muestreo y distribución de las cinco huellas.
   https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LRO-L-LOLA-2-EDR-V1.0
4. **NASA Goddard PGDA — High-Resolution LOLA Topography for Lunar South Pole Sites.** DEM 5 m/píxel, pendientes, errores, ROIs, comparación histórica de iluminación.
   https://pgda.gsfc.nasa.gov/products/78
5. **NASA Goddard PGDA — South Pole Landing Site LOLA DEMs.** Catálogo directo de archivos.
   https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/
6. **NASA Goddard PGDA — South Pole LOLA DEM Mosaic.** Mosaico regional y tamaño de los rásteres.
   https://pgda.gsfc.nasa.gov/products/81
7. **NASA Goddard PGDA — Lunar Polar Illumination.** Iluminación, sombra permanente y visibilidad media terrestre, 18.6 años, 60/120/240 m/píxel.
   https://pgda.gsfc.nasa.gov/products/69
8. **NASA — Update on Artemis III Moon Landing Regions (28-oct-2024).** Regiones candidatas y criterios de selección.
   https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
9. **NASA — The Lunar South Pole Region.** Relación entre relieve, Sol bajo, sombras y energía.
   https://www.nasa.gov/reference/moonbase-environment/
10. **NASA NTRS — Lunar Pole Illumination and Communications Maps Computed from GSSR Elevation Data.** Referencia metodológica de máscaras de horizonte para iluminación y comunicaciones; atención: **utiliza RADAR GSSR**, no datos LOLA.
    https://ntrs.nasa.gov/citations/20150014706
11. **NAIF/JPL — `spkpos` documentation.** Efemérides y marcos de referencia; posiciones en km.
    https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkpos_c.html
12. **JPL Horizons Manual.** Referencias celestes/lunares y efemérides.
    https://ssd.jpl.nasa.gov/horizons/manual.html
13. **Publicación científica fundamental:** Barker et al. (2021), *Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions*, Planetary and Space Science 203, 105119.
    https://doi.org/10.1016/j.pss.2020.105119
14. **Publicación científica fundamental:** Mazarico et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081.
    https://doi.org/10.1016/j.icarus.2010.10.030

---

## 11. Solicitud sugerida para pasarle a Claude junto con este archivo

> Utiliza este Markdown como especificación científica inicial. Necesito una aplicación React + TypeScript + Three.js/React Three Fiber + WebXR compatible con Meta Quest 3S y escritorio. Implementa primero el pipeline mínimo en Python para abrir DEM, pendiente e incertidumbre NASA LOLA de Site01 y Site04, calcular candidatos dentro de ROIs, perfiles de horizonte y una serie temporal de visibilidad del Sol/Tierra obtenida con SPICE. Exporta JSON y mallas ligeras que el frontend pueda consumir. No inventes coordenadas ni resultados; pon mocks claramente señalados si todavía faltan archivos. Construye una interfaz VR con selector de sitio, fecha y comparación. Divide la implementación en pasos verificables y explica cómo probar cada uno.

**Resultado esperado:** una aplicación que explique **por qué un lugar puede ser favorable o desfavorable en una fecha concreta**, con datos, límites e incertidumbre visibles; no una clasificación NASA ficticia ni una certificación de seguridad de aterrizaje.

---

## Nota de coherencia con el resto del proyecto — RESUELTA (14-nov-2026)

Este documento se escribió como contexto independiente para un enfoque **WebXR puro**, antes de que el equipo decidiera la arquitectura final. Los puntos que pedía reconciliar ya están resueltos:

- **Terreno:** resuelto a favor de **RAW16** (no GLB) — `size_px: 513` (no 1025; el DEM fuente real es de 80 m/px), parseado directo en three.js. Ver `web/lib/mission/sites.ts` y el contrato en `CLAUDE.md` sección 7.
- **Sitios:** resuelto a favor del catálogo del proyecto (Malapert A, Mons Mouton, Malapert Massif, Shackleton–de Gerlache ridge, Nobile Rim 1/2, + Chandrayaan-3/Chang'e 4/Apollo 11/17 sin terreno completo) — no Site01/Site04 de PGDA. Ver `web/public/data/sites.json`, fuente de verdad.
- **Efemérides:** resuelto — **solo JPL Horizons** (`coord@301`, `QUANTITIES=4`), SPICE quedó descartado del pipeline real (no está en las dependencias de `pipeline/pyproject.toml`).
- **Arquitectura:** resuelto a favor de **Cloudflare Workers + Durable Objects** (no AWS, no fue construido nada de AWS) — ver `CLAUDE.md` sección 5.
- Sigue siendo útil como **referencia científica profunda** (física de LOLA, fórmulas de horizonte con curvatura, límites de incertidumbre, pruebas sugeridas en la sección 8) — eso no cambió.
