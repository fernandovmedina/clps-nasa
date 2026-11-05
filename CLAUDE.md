# TOUCHDOWN — NASA Space Apps Challenge 2026

Contexto completo del proyecto para Claude Code. Léelo entero antes de proponer o escribir código.

---

## 1. Datos generales

- **Evento:** NASA International Space Apps Challenge 2026, tema "The Next Frontier"
- **Fechas del hackathon:** 14 y 15 de noviembre de 2026 (48 horas)
- **Equipo:** 6 personas
- **Reto elegido:** **Lunar Landing Site Navigator** (en los resúmenes previos aparecía como "CLPS Lunar Mission Browser")
- **Dificultad:** Advanced / Intermediate
- **Temas:** Human Exploration, Moon, Software, Space Exploration
- **Hardware disponible:** Meta Quest 3S
- **Recursos oficiales del reto:** la pestaña "Resources" se publica el 13 de noviembre. Hasta entonces usamos fuentes públicas (sección 6).

### Regla importante sobre trabajo previo
Space Apps normalmente pide que el proyecto se construya **durante** el hackathon. Antes del 14 solo se vale preparar: investigar, aprender, configurar entornos, probar datos y hacer prototipos desechables. **El código final del producto se escribe el 14–15.** Si te piden algo antes de esa fecha, trátalo como prototipo o prueba de concepto, salvo que el equipo diga otra cosa. Hay que confirmar las reglas exactas del evento local.

---

## 2. El reto (texto oficial completo)

> Missions to the Moon's south pole face extreme lighting and communication constraints, and planning them takes careful coordination between science and engineering teams. Tools for determining Sun and Earth positions at candidate landing sites exist, but their complicated interfaces make it difficult to evaluate critical information with efficiency. Your challenge is to create an intuitive tool or application that lets mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows.

### BACKGROUND

> NASA's Commercial Lunar Payload Services (CLPS) program and other lunar missions depend on careful selection of landing sites and dates that balance the needs of both science and engineering teams. One of the most significant challenges in this process is understanding the local lighting and communication environment at a potential landing site. The position of the Sun determines power availability for solar arrays and thermal conditions for equipment, while the position of Earth determines whether direct communication is possible without relay satellites.
>
> This challenge is particularly acute at the Moon's south pole, where many future missions are planned due to the presence of water ice and other scientifically valuable resources. The south pole's geometry creates extreme variations in solar illumination and Earth visibility across different lunar days and seasons. Small changes in landing location or date can dramatically affect both power generation potential and communication windows, making rapid site evaluation critical.
>
> In practice, mission development rarely proceeds on a fixed timeline. Hardware development challenges, launch delays, or other factors often force mission planners to reconsider their original landing date and location. When this happens, engineers need to quickly evaluate alternative sites in the same region, or alternative dates at the same site, to understand how these changes impact mission feasibility. A tool that enables rapid, intuitive comparison of multiple scenarios would accelerate this decision-making process and help teams identify viable alternatives when constraints shift.
>
> Tools that provide this information — such as NASA's Quickmap, Moon Trek, and the JPL Horizons System — are built for detailed analysis and are often difficult for non-specialists to use effectively for rapid scenario comparison. Evaluating each site-data combination means navigating multiple interfaces and interpreting raw data. This leaves a gap between the technical data available and the accessible tools needed to support agile mission planning. An intuitive interface that translates complex ephemeris and topographic data into clear, comparable visualizations could help bridge that gap.

### OBJECTIVES

> Your challenge is to create a tool or application that enables rapid evaluation of lunar landing site options. Your solution may include:
>
> - **Interactive site selection and comparison:** You may consider allowing users to choose from a curated list of notable landing sites – such as past Apollo missions, future CLPS mission targets, targets of other commercial lunar missions, or landing sites from other countries' lunar programs – as well as the ability to input custom lunar coordinates. You may also consider enabling side-by-side or sequential comparison of multiple sites to help users quickly assess trade-offs.
> - **Date and time flexibility:** You may consider allowing users to select landing dates and times, and providing tools to explore how conditions change across different lunar days or seasons. This enables users to understand how mission schedule adjustments affect feasibility.
> - **Sun and Earth position visualization:** Display the positions of the Sun and Earth relative to the horizon at a selected landing site on a chosen date. You may consider showing how much time remains before sunset or Earthset, as this directly impacts mission operations and power generation windows.
> - **Power and communication assessment:** You may consider highlighting key metrics such as solar elevation angle (which affects power generation efficiency), duration of sunlight, and Earth visibility windows. These metrics help mission planners quickly assess whether a site-date combination is viable.
> - **Multiple visualization approaches:** You may explore 2D maps, 3D surface visualizations, or other creative representations that help users understand the spatial relationships between the landing site, Sun, and Earth.
> - **Temporal dynamics:** You may consider creating animations or timeline views that show how Sun and Earth positions change over a lunar day or across multiple days, helping users understand the duration and timing of operational windows.
> - **Accessibility across skill levels:** Your tool could serve mission planners seeking detailed technical information for rapid decision-making, as well as educators and the general public curious about why the Moon presents such distinct engineering challenges.
>
> You are encouraged to be creative in how you present this information. Your solution might be a web application, a mobile app, an interactive visualization, an educational game, or another format entirely — as long as it makes rapid site evaluation clear and efficient.

### POTENTIAL CONSIDERATIONS

> You may (but are not required to) consider the following:
>
> **Technical approach:**
> - Ephemeris data – the positions and motions of celestial bodies – can be calculated using tools like the JPL Horizons System, or you may consider using pre-computed datasets.
> - Lunar topography data from sources like the Lunar Orbiter Laser Altimeter (LOLA) can help create realistic surface visualizations and accurate horizon calculations.
> - Consider how to handle the Moon's lack of atmosphere when calculating horizon positions. Without atmospheric refraction, the horizon is determined by local terrain and the edge of the lunar sphere as seen from the landing site.
> - Solar elevation angle is a key metric for power generation, and you may consider calculating and displaying this prominently.
>
> **User experience:**
> - Your interface could prioritize rapid scenario comparison, allowing mission planners to evaluate multiple site-date combinations efficiently.
> - Consider how to clearly communicate time remaining before sunset or Earthset, as this is critical operational information.
> - Think about how to make the extreme differences between lunar and terrestrial conditions apparent—they can be compelling when visualized effectively.
> - You may consider features that help users understand why small location or date changes have large impacts on mission feasibility.
>
> **Data and accuracy:**
> - Consider accounting for the Moon's actual topography, as terrain elevation can significantly affect horizon positions and visibility windows.
> - Consider whether your tool will account for factors like Earth's libration (wobble) or the Moon's orbital variations.
> - South pole terrain is particularly complex, and you may consider how to represent steep slopes and deep craters that create extreme shadow conditions.
>
> **Engagement and impact:**
> - Your solution could support mission planners in coordinating between science and engineering teams during mission development.
> - It could help teams respond quickly when schedule changes or hardware development challenges require landing date or location adjustments.
> - It could also serve as an educational tool to help students and the public understand lunar exploration challenges and why mission planning is so complex.
>
> For data and resources related to this challenge, refer to the Resources tab at the top of the page. More resources may be added before the hackathon begins.

---

## 3. La idea: TOUCHDOWN

**En una línea:** una herramienta para evaluar sitios y fechas de aterrizaje lunar en segundos. Una app web (Mission Control) compara escenarios con efemérides reales y el horizonte real del terreno, y una experiencia en VR (Quest 3S) pone a la persona parada en el sitio para ver por qué un cambio chico de fecha o ubicación lo cambia todo.

**Frase del pitch:** *La web decide con datos y el VR valida con los ojos.*

### Por qué responde al reto
| Lo que pide el reto | Cómo lo cubre TOUCHDOWN |
|---|---|
| Herramienta **intuitiva** (el problema son interfaces complicadas) | Web enfocada en decisiones: cuentas regresivas, semáforos, comparación lado a lado |
| Comparar sitios **y fechas** rápido | Comparador de escenarios (sitio × fecha) y escenario "la misión se retrasó" |
| Sol y Tierra **respecto al horizonte** | Diagrama polar con la máscara de horizonte real + vista 3D/VR |
| Tiempo restante al atardecer / Earthset | Cuentas regresivas grandes y visibles en web y VR |
| Elevación solar prominente | Métrica principal en cada tarjeta de sitio |
| Topografía real (LOLA), sin refracción | Máscara de horizonte por azimut calculada desde DEM de LOLA + curvatura lunar |
| 3D y "formas creativas" | VR en Quest 3S |
| Hacer evidentes las diferencias Luna vs. Tierra | Estar parado en el polo sur con el Sol rozando el horizonte y sombras de kilómetros |
| Planeadores + educadores + público | Web para planeadores; VR para público y educación |
| Coordinación entre ciencia e ingeniería | Dinámica Mission Control (web) + inspector en campo (VR) sincronizados |
| Libración de la Tierra | La efeméride (SPICE/Horizons) la incluye; se menciona en el pitch |

### Diferenciadores frente a la competencia
Ya hay repos públicos de otros equipos con este reto (buscar "CLPS Lunar Mission Browser" en GitHub). Casi todos hacen **solo una web** con efemérides de Horizons/SPICE y gráficas, y varios tratan el horizonte como una **esfera lisa**: uno de ellos admite que la mejora grande sería la máscara de horizonte con LOLA. Nuestros diferenciadores son:
1. **Horizonte real desde LOLA** (lo que hace que un cerro tape la Tierra).
2. **VR sincronizado con la web** (multijugador asimétrico; casi nadie lo hace).
3. **Narrativa del retraso de misión** (el fondo del reto) como eje del demo.

### Riesgos conocidos (del análisis previo)
- El jurado global evalúa sobre todo el **video y la página del proyecto**, no el visor. **La web tiene que ganar sola**; el VR es la capa extra.
- El scope de 48 h es el riesgo número uno: dos apps, sincronización y un pipeline de datos reales. Mantener la sincronización mínima.
- Si el VR no muestra algo que la web no puede, es decoración. Su trabajo es mostrar el **horizonte real**: el cerro que tapa la Tierra o la sombra que cubre la zona.

---

## 4. Roles y experiencia de usuario

### 🖥️ Mission Control (web) — el planeador
- Elige sitios de un **catálogo curado** (Apollo, CLPS, otros países, Artemis III) o mete **coordenadas personalizadas**.
- Elige fecha y hora de aterrizaje y la duración de la misión.
- Ve por sitio: **elevación del Sol** y su azimut, **visibilidad de la Tierra**, **cuenta regresiva al atardecer y al Earthset**, horas de Sol y de comunicación en la ventana de misión y un **semáforo de viabilidad**.
- **Diagrama polar** (cielo visto desde el sitio): la trayectoria del Sol y la Tierra contra la silueta del horizonte real.
- **Línea de tiempo** de varios días: bandas de Sol, Tierra y ventana (cuando coinciden los dos).
- **Comparación lado a lado** de 2 a 4 escenarios (sitio × fecha).
- **Botón de "retraso":** mueve la fecha N días y muestra qué cambia.
- Manda al inspector de VR a un sitio y recibe en vivo los riesgos que marca.
- **Reporte** final: sitio recomendado, ventana y riesgos.

### 🥽 Inspector de sitio (VR, Quest 3S)
- Aparece parado en el sitio a escala real (terreno de LOLA).
- Ve el **Sol y la Tierra en su posición real** para la fecha elegida, y cómo el terreno los tapa.
- **Panel flotante:** elevación solar, estado de la Tierra y cuentas regresivas.
- **Marca riesgos** (rocas, pendientes, sombra) apuntando con el control; le llegan a la web al instante.
- Botones de "mirar al Sol" y "mirar a la Tierra".
- Encuadre flexible: puede ser **inspector del sitio de un lander CLPS** o **astronauta** (el reto incluye Human Exploration).

### Guion del demo (~90 s)
1. Planeador: "La misión aterriza el 10 de enero en Malapert". La web muestra la elevación del Sol, las cuentas regresivas y la ventana de comunicación.
2. "Se retrasó tres semanas". Mueve la fecha: la ventana se cae y la Tierra se oculta antes de terminar la misión.
3. Compara lado a lado contra Mons Mouton: ahí sí hay ventana.
4. En el VR, alguien se para en Malapert y ve el cerro que tapa la Tierra. Ese es el *por qué*.
5. Sale el reporte con la recomendación.

*(Fechas y resultados del guion son ilustrativos; se reemplazan con lo que digan los datos reales.)*

---

## 5. Arquitectura

**Arquitectura serverless** (decisión del 4 de nov de 2026; sustituye al backend FastAPI del borrador original). Como todo se precalcula, no hace falta un servidor siempre encendido. La web y la API REST viven en **Next.js** (las route handlers corren como funciones serverless) y la sincronización en tiempo real va en **API Gateway WebSocket + Lambda + DynamoDB**.

```
        ┌─────────────────────────────────────────┐
        │  Pipeline de datos (offline, Python)    │
        │  LOLA DEM → máscara de horizonte        │
        │  LOLA DEM → heightmap recortado (VR/3D) │
        │  SPICE/Horizons → efemérides Sol/Tierra │
        └───────────────────┬─────────────────────┘
                            │ JSON / PNG / RAW precalculados
                            │ (en el repo o en S3)
        ┌───────────────────▼─────────────────────┐
        │  Next.js (Vercel o AWS Amplify)         │
        │  · UI de Mission Control                │
        │  · Route handlers /api/* (serverless):  │
        │    sitios, horizonte, efemérides,       │
        │    escenario, terreno                   │
        └───────┬─────────────────────────┬───────┘
                │ REST                    │ REST
   ┌────────────▼──────────┐   ┌──────────▼────────────┐
   │ Navegador             │   │ VR (Unity + Meta XR)  │
   │ Mission Control       │   │ Inspector de sitio    │
   └────────────┬──────────┘   └──────────┬────────────┘
                │        WebSocket        │
        ┌───────▼─────────────────────────▼───────┐
        │  AWS API Gateway (WebSocket)            │
        │  → Lambda (connect / disconnect / msg)  │
        │  → DynamoDB (conexiones + último estado │
        │    de cada sala)                        │
        └─────────────────────────────────────────┘
```

### Stack
- **Pipeline de datos:** Python 3.11+, NumPy, `rasterio` (DEMs), `spiceypy` (SPICE) y/o la API de JPL Horizons. Corre offline y su salida son archivos.
- **Web + API REST:** **Next.js** (App Router) + TypeScript. Las route handlers de `/api/*` leen los JSON precalculados y calculan el resumen del escenario. 3D con Three.js / React Three Fiber (o CesiumJS si se quiere un globo). Gráficas con D3 o Recharts (el diagrama polar en D3 o canvas).
- **Hosting de la web:** Vercel o AWS Amplify Hosting (**por decidir**). El código no depende de cuál se elija.
- **Tiempo real:** AWS API Gateway WebSocket + una Lambda (Node.js/TypeScript) + DynamoDB, desplegados con AWS SAM o CDK. La cuenta de AWS ya está configurada en el equipo de Oscar.
- **Datos pesados:** los heightmaps RAW y las texturas pueden ir en `public/` de Next.js o en S3 + CloudFront si pesan demasiado.
- **VR:** Unity (LTS) + Meta XR SDK (o OpenXR + XR Interaction Toolkit), build para Android/Quest. Opcional: Unity MCP con Claude Code (oficial de Unity o IvanMurzak/Unity-MCP). Consume la misma API REST y el mismo WebSocket que la web.
- **Plan B de VR:** WebXR con `@react-three/xr` si Unity se complica (corre en el navegador del Quest y puede vivir dentro de la misma app de Next.js).

### Por qué API Gateway WebSocket (y no otra opción)
- Next.js en Vercel o Amplify **no puede mantener WebSockets abiertos**, así que el tiempo real necesita un servicio aparte.
- API Gateway habla **WebSocket estándar con JSON plano**, y Unity lo consume con cualquier cliente WebSocket. AppSync Events, Supabase Realtime y servicios similares usan protocolos propios que complican el cliente de Unity.
- La lógica cabe en una sola Lambda de unas 50 líneas.

### Riesgos de la arquitectura serverless
- **Depende de internet en el evento.** Mitigación obligatoria: un **servidor WebSocket local de respaldo** (un script pequeño en Node.js con el mismo protocolo) que corra en una laptop y al que se conecten la web y el Quest por la red local. La URL del WebSocket se configura por variable de entorno.
- **La web tiene que funcionar sin sincronización** (con estado local) por si el WebSocket falla durante el video.
- **Depurar es más lento** (logs en CloudWatch). Desarrollar contra el servidor local y desplegar a AWS solo para integrar.
- **Costo:** dentro de la capa gratuita para el volumen de un hackathon. Igual conviene poner una alerta de presupuesto en AWS.

### Principio clave: precalcular
Las efemérides y las máscaras de horizonte se calculan **offline** y se sirven como JSON. Nada de cálculos pesados en vivo durante el demo. Las coordenadas personalizadas pueden usar el horizonte esférico (sin terreno) como fallback, con una etiqueta clara.

---

## 6. Datos y ciencia

### Fuentes
- **LOLA (Lunar Orbiter Laser Altimeter)**, PDS Geosciences Node: DEMs del polo sur en proyección estereográfica polar (productos de ~5–20 m/pixel cerca del polo; resoluciones más gruesas para áreas más amplias).
- **NASA Moon Trek** (trek.nasa.gov/moon): forma fácil de recortar y descargar DEMs y mosaicos de una zona.
- **NASA Quickmap** (quickmap.lroc.asu.edu): exploración y validación visual.
- **LROC** (mosaicos de imagen) para la textura del terreno en 3D/VR.
- **JPL Horizons** (API): azimut y elevación del Sol (`10`) y la Tierra (`399`) vistos desde un punto de la superficie lunar (`coord@301`).
- **NAIF SPICE** con `spiceypy`: alternativa local a Horizons (kernels: `de440`/`de441` planetarios, PCK lunar `moon_pa_de440`, FK lunar, LSK).
- **NASA SVS:** visualizaciones de iluminación del polo sur, útiles para validar y para el pitch.

### Cálculos

**1. Posición del Sol y la Tierra (alt-az topocéntrico)**
- Para cada sitio (lat, lon, altura) y cada paso de tiempo (sugerido: 1 h), calcular el azimut y la elevación del Sol y la Tierra respecto al horizonte local **geométrico** (plano tangente).
- Sin atmósfera, **sin refracción**.
- La libración y las variaciones orbitales ya vienen incluidas en la efeméride.
- Opcional: modelar el Sol como disco (radio angular ≈ 0.27°) y la Tierra (≈ 0.95°) para manejar iluminación o visibilidad parcial.

**2. Máscara de horizonte desde LOLA**
- Para cada azimut (paso sugerido de 0.5°–1°), recorrer el DEM desde el sitio hacia afuera y quedarse con el **ángulo de elevación máximo** del terreno:
  `ang(d) = atan2( h(d) − h0 − h_obs − d² / (2R), d )`
  donde `R = 1737.4 km` (radio lunar), `h0` es la altura del sitio, `h_obs` la altura del observador o los paneles (p. ej. 2 m) y `d²/(2R)` la caída por curvatura.
- Alcance sugerido: 50–150 km (los cerros lejanos del polo sur sí importan).
- Resultado: un arreglo `horizon_deg[az]`. Un cuerpo es visible si `elev > horizon_deg[az]`.
- Esto es exactamente lo que pide el reto con "local terrain and the edge of the lunar sphere".

**3. Métricas derivadas**
- `sun_visible`, `earth_visible` por paso de tiempo.
- **Ventanas:** intervalos continuos de Sol, de Tierra y de ambos.
- **Cuenta regresiva:** tiempo hasta el siguiente atardecer (el Sol cruza el horizonte real hacia abajo) y hasta el siguiente Earthset.
- Horas totales de Sol y de Tierra dentro de la ventana de misión.
- Elevación solar mínima, máxima y promedio.
- **Puntaje de viabilidad** (configurable; pesos sugeridos 50% energía y 50% comunicación, más pendiente si se calcula) y semáforo: viable / marginal / no viable.

### Catálogo inicial de sitios
**Coordenadas aproximadas. Verificar contra fuentes oficiales antes de usar.**

| Sitio | Programa | Lat | Lon (E) | Notas |
|---|---|---|---|---|
| Malapert A (IM-1 Odysseus) | CLPS, 2024 | ≈ −80.1 | ≈ 1.4 | Aterrizó de lado |
| Mons Mouton (IM-2 Athena) | CLPS, 2025; IM-4 planeado | ≈ −84.5 | ≈ 29 | |
| Malapert Massif | Artemis III candidato | ≈ −86 | ≈ 0 | |
| Shackleton (borde / connecting ridge) | Artemis / interés científico | ≈ −89.5 | variable | Zona de iluminación casi permanente |
| Haworth, Nobile Rim 1/2, de Gerlache Rim 2, Slater Plain, Peak near Cabeus B | Artemis III candidatos | polo sur | — | Lista de 9 regiones de NASA (2024) |
| Chandrayaan-3 (Vikram) | ISRO, 2023 | ≈ −69.4 | ≈ 32.3 | |
| Chang'e 4 | CNSA, 2019 | ≈ −45.4 | ≈ 177.6 | Lado oculto: la Tierra **nunca** es visible (buen ejemplo educativo) |
| Apollo 11 | NASA, 1969 | ≈ 0.67 | ≈ 23.47 | Contraste ecuatorial |
| Apollo 17 | NASA, 1972 | ≈ 20.19 | ≈ 30.77 | |
| Personalizado | — | input | input | Horizonte esférico si no hay DEM |

**Sitios con terreno completo (LOLA + VR):** empezar con 3 del polo sur (Malapert, Mons Mouton y uno más). El resto, solo con efemérides y el horizonte esférico o de baja resolución.

---

## 7. Contrato de datos (borrador v0.1)

*Cambios v0 → v0.1 (4 nov): el WebSocket pasa a API Gateway (la sala va como query string), se agrega el mensaje `hello` y `state` incluye `markers`. Los endpoints REST no cambian.*

Formato compartido entre pipeline, API (Next.js), web y VR. **No cambiarlo sin avisar al equipo.** Los endpoints REST los sirven las route handlers de Next.js con las mismas rutas `/api/...` de abajo. Tiempos en UTC ISO 8601 y ángulos en grados. Azimut desde el norte (0°) en sentido horario hacia el este (90°). En el polo sur "norte" es la dirección hacia el meridiano del sitio; documentar la convención exacta usada por el pipeline.

### `GET /api/sites`
```json
[
  {
    "id": "malapert-a",
    "name": "Malapert A (IM-1)",
    "program": "CLPS",
    "lat": -80.13,
    "lon": 1.44,
    "elevation_m": 5100,
    "has_terrain": true,
    "notes": "Coordenadas aproximadas, verificar"
  }
]
```

### `GET /api/sites/{id}/horizon`
```json
{
  "site_id": "malapert-a",
  "az_step_deg": 0.5,
  "horizon_deg": [1.2, 1.3, 1.1],
  "observer_height_m": 2.0,
  "source": "LOLA 20m polar stereographic",
  "max_range_km": 100
}
```

### `GET /api/sites/{id}/ephemeris?start=...&end=...&step=1h`
```json
{
  "site_id": "malapert-a",
  "step_minutes": 60,
  "samples": [
    {
      "t": "2027-01-10T00:00:00Z",
      "sun":   { "az": 123.4, "el": 1.8,  "visible": true },
      "earth": { "az": 3.2,   "el": 4.5,  "visible": true }
    }
  ]
}
```

### `GET /api/scenario?site=...&landing=...&duration_days=...`
```json
{
  "site_id": "malapert-a",
  "landing": "2027-01-10T00:00:00Z",
  "duration_days": 14,
  "sun":   { "elev_now": 1.8, "hours_visible": 210, "next_set": "2027-01-15T06:00:00Z" },
  "earth": { "elev_now": 4.5, "hours_visible": 160, "next_set": "2027-01-12T18:00:00Z" },
  "windows": {
    "sun":   [["2027-01-10T00:00:00Z", "2027-01-15T06:00:00Z"]],
    "earth": [["2027-01-10T00:00:00Z", "2027-01-12T18:00:00Z"]],
    "both":  [["2027-01-10T00:00:00Z", "2027-01-12T18:00:00Z"]]
  },
  "score": 72,
  "status": "marginal"
}
```

### Terreno para VR/3D: `GET /api/sites/{id}/terrain`
```json
{
  "site_id": "malapert-a",
  "heightmap_url": "/static/terrain/malapert-a.raw",
  "format": "RAW16 little-endian",
  "size_px": 1025,
  "extent_m": 20000,
  "min_height_m": 3200,
  "max_height_m": 5400,
  "texture_url": "/static/terrain/malapert-a.png",
  "site_px": [512, 512]
}
```
*(1025 = 2ⁿ+1, que es lo que espera el terreno de Unity.)*

### WebSocket (API Gateway) — estado compartido
**Conexión:** `wss://<api-id>.execute-api.<region>.amazonaws.com/<stage>?room=<room>`
- La sala va como query string porque API Gateway WebSocket no tiene rutas por path.
- La URL se configura por variable de entorno (`NEXT_PUBLIC_WS_URL` en la web y un campo de configuración en Unity), para poder cambiar al servidor local de respaldo (`ws://<ip-laptop>:8787?room=<room>`).

Mensajes en JSON con `type`:
```json
{ "type": "hello" }
{ "type": "state", "site_id": "malapert-a", "t": "2027-01-10T00:00:00Z", "playing": false, "speed": 1, "markers": [] }
{ "type": "set_site", "site_id": "mons-mouton" }
{ "type": "set_time", "t": "2027-01-31T00:00:00Z" }
{ "type": "marker_add", "id": "m1", "site_id": "malapert-a", "x_m": 120.5, "y_m": -40.2, "kind": "rock", "note": "roca ~2 m" }
{ "type": "marker_remove", "id": "m1" }
```
- **Nuevo en v0.1: `hello`.** API Gateway no deja mandar mensajes dentro de `$connect`. Por eso cada cliente, al abrir la conexión, manda `{ "type": "hello" }`, y el servidor le responde **solo a él** con el `state` actual de la sala (marcadores incluidos). Así se cubre a quien se conecta tarde.
- **Nuevo en v0.1: `markers` dentro de `state`.** Lista con los marcadores vigentes de la sala, para que quien se conecta tarde los vea.
- Coordenadas de marcadores: metros locales relativos al sitio (este = +x, norte = +y).
- **Sincronizar solo esto:** sitio, tiempo, reproducción y marcadores. Nada más.
- El servidor reenvía (broadcast) cada mensaje a los demás clientes de la sala y guarda el estado en DynamoDB.
- Límite de API Gateway: 128 KB por mensaje y conexiones de hasta 2 h (10 min sin tráfico las cierra). **Los clientes deben reconectar solos y volver a mandar `hello`.**
- El servidor local de respaldo implementa exactamente este mismo protocolo.

---

## 8. División del equipo (6 personas)

| Rol | Personas | Responsabilidades |
|---|---|---|
| Datos | 1 | Pipeline LOLA → horizonte y heightmap; efemérides precalculadas |
| Web | 1 | Mission Control en Next.js: catálogo, comparador, diagrama polar, línea de tiempo, cuentas regresivas |
| API + tiempo real + integración | 1 | Route handlers `/api/*` de Next.js; API Gateway WebSocket + Lambda + DynamoDB (SAM/CDK); servidor local de respaldo; despliegue; reporte en la web; dueño del contrato de datos |
| VR (Unity) | 2 | Una persona: terreno, Sol y Tierra, iluminación. Otra: interacción, panel flotante, marcadores y cliente WebSocket |
| Pitch / video / diseño | 1 | Narrativa, identidad visual, video, página del proyecto; grabar desde el día 1 |
| Integrador / flotante | (compartido) | Contrato de datos, pruebas en el Quest, apagar incendios |

---

## 9. Plan de trabajo

### Antes del 14 (preparación y prototipos desechables)
- [ ] Revisar las reglas del evento local sobre trabajo previo
- [ ] Datos: bajar DEMs de LOLA de 3 sitios y probar abrirlos con `rasterio`
- [ ] Datos: prototipo de máscara de horizonte para 1 sitio; validar contra Moon Trek/Quickmap
- [ ] Datos: probar Horizons o SPICE y sacar la elevación del Sol y la Tierra para 1 sitio
- [ ] Datos: lista de coordenadas oficiales de los sitios
- [ ] Unity: modo desarrollador del Quest, build "hola mundo", MCP con Claude Code
- [ ] Unity: importar un heightmap de LOLA de prueba y medir el rendimiento en el visor
- [x] Web: decidir el stack → Next.js + serverless (4 nov)
- [ ] Web: prototipar el diagrama polar
- [ ] Infra: decidir el hosting de Next.js (Vercel o Amplify)
- [ ] Infra: prototipo de API Gateway WebSocket + Lambda + DynamoDB y del servidor local de respaldo
- [ ] Infra: alerta de presupuesto en AWS
- [ ] Web: wireframes de comparador, línea de tiempo, cuentas regresivas y reporte
- [ ] Pitch: nombre final, logo, paleta, guion del demo, revisar ganadores de años anteriores
- [ ] Todos: repo **privado**, entornos instalados, este contrato de datos acordado
- [ ] 13 nov: revisar la pestaña Resources del reto y ajustar

### Durante el hackathon (14–15 nov)
- **Hora 0–1:** confirmar el contrato de datos y los roles; build vacío corriendo en el Quest.
- **Hora 1–12:** pipeline con datos reales de 3 sitios; web con datos de prueba del contrato; VR con terreno real.
- **Hora 12–24:** integración (web + API + VR + WebSocket). Desarrollar contra el servidor WebSocket local y desplegar a AWS para integrar.
- **Hora 24–36:** comparador, escenario de retraso, reporte y pulido.
- **Hora 36–44:** video, página del proyecto, ensayo del demo.
- **Hora 44–48:** buffer y entrega.

### Scope
- **Mínimo para presentar:** 3 sitios con terreno real, efemérides, diagrama polar, línea de tiempo, cuentas regresivas, comparación de 2 escenarios, VR con terreno y Sol/Tierra, sincronización de sitio y tiempo.
- **Si sobra tiempo:** catálogo completo con coordenadas personalizadas, marcadores sincronizados, reporte exportable, modo educativo, asistente de voz en el VR, Sol y Tierra como disco.

---

## 10. Convenciones para Claude Code

- Responde y comenta en **español**; el código (nombres de variables y funciones) en **inglés**.
- Respeta el **contrato de datos** de la sección 7. Si un cambio lo requiere, propónlo primero y explica el impacto en web y VR.
- **Precalcula** todo lo pesado. Nada de llamadas a Horizons en vivo durante el demo; cachea en JSON.
- **Serverless:** nada de servidores con estado en memoria dentro de Next.js. El estado compartido vive en DynamoDB (o en el servidor local de respaldo). Las URLs de la API y del WebSocket siempre van por variables de entorno.
- No crear ni borrar recursos de AWS sin confirmarlo con el equipo.
- Marca con claridad cualquier dato aproximado o simulado (por ejemplo, el campo `"source": "approx"`). Nunca presentes datos inventados como reales de NASA.
- Valida los cálculos contra una fuente independiente (Moon Trek, Quickmap o Horizons) antes de confiar en ellos.
- Prioridad: **web funcional > datos correctos > VR > extras.** La web tiene que funcionar sola en el video.
- Para Unity: la configuración del Meta XR SDK y los settings de build de Android se hacen a mano siguiendo la guía de Meta; usa el MCP para scripts, escenas y UI.
- Antes del 14 de noviembre todo es prototipo. Confirma con el equipo antes de tratar código como final.

---

## 11. Referencias
- Reto: https://www.spaceappschallenge.org/2026/challenges/ (Lunar Landing Site Navigator)
- CLPS (NASA): https://www.nasa.gov/reference/commercial-lunar-payload-services/
- Regiones candidatas de Artemis III: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- NAIF SPICE: https://naif.jpl.nasa.gov/naif/
- PDS Geosciences – LOLA: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- Moon Trek: https://trek.nasa.gov/moon/
- Quickmap: https://quickmap.lroc.asu.edu/
- Unity MCP (oficial): https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.17/manual/integration/unity-mcp-get-started.html
- Unity-MCP (IvanMurzak): https://github.com/IvanMurzak/Unity-MCP
- Repos de otros equipos con este reto (para ver competencia):
  - https://github.com/shrestha-droid/clps-lunar-mission-browser
  - https://github.com/0Aaheed0/SeleneSight
  - https://github.com/rafaa-sf/lunar-horizon-clps-browser
  - https://github.com/partofcosmos-site/lunarsite-compass
- Simulación conceptual (privada, compartir desde su menú Share): https://claude.ai/artifact/W4W8wGqhXURQnvehta4UMU
