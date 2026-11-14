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

**Arquitectura serverless unificada en Cloudflare Workers** (decisión del 14 de nov de 2026, hora ~5; sustituye a la topología AWS S3/CloudFront/Lambda/API Gateway/DynamoDB documentada antes — ningún recurso de esa topología llegó a crearse). Como los datos lunares se precalculan, no hay servidores pesados ni bases externas que mantener.
- **Front:** **Next.js como sitio estático** (`output: 'export'`) servido por **Cloudflare Workers Static Assets**.
- **API REST:** **Cloudflare Worker** en el mismo dominio bajo `/api/*`.
- **Tiempo real:** **Cloudflare Durable Objects** (`RoomHub` con WebSocket Hibernation API y almacenamiento SQLite embebido) bajo `/ws?room=<room>`.
- **VR (decisión 14-nov-2026, sustituye a Unity):** WebXR con **three.js puro** dentro del mismo Next.js de `web/` (no `@react-three/xr`, no Unity). Vive en la misma app que Mission Control, se despliega junto con ella, y el Quest la abre directo en su navegador por HTTPS — sin build nativo de Android, sin Meta XR SDK.

```
        ┌─────────────────────────────────────────┐
        │  Pipeline de datos (offline, Python)    │
        │  LOLA DEM → máscara de horizonte        │
        │  LOLA DEM → heightmap recortado (VR/3D) │
        │  JPL Horizons → efemérides Sol/Tierra   │
        └───────────────────┬─────────────────────┘
                            │ JSON / PNG / RAW precalculados
        ┌───────────────────▼─────────────────────┐
        │  Cloudflare Worker (un solo dominio)    │
        │  ├── /*        → Static Assets (Next.js)│
        │  ├── /static/* → Static Assets (terreno)│
        │  ├── /api/*    → API REST (Worker)      │
        │  └── /ws       → Durable Object RoomHub │
        │                  (WebSocket + SQLite)   │
        └───────┬─────────────────────────┬───────┘
                │ REST + WS               │ REST + WS
   ┌────────────▼──────────┐   ┌──────────▼────────────┐
   │ Navegador             │   │ VR (WebXR, three.js)  │
   │ Mission Control       │   │ Inspector de sitio    │
   └───────────────────────┘   └───────────────────────┘
```

### Stack
- **Pipeline de datos:** Python 3.12 (`uv`), NumPy, Pillow, JPL Horizons API y PDS LOLA GDR. Para cada punto del terreno se usa el DEM de mejor resolución que lo cubre: `LDEM_80S_80M` (80 m/px, 80°S–90°S), `LDEM_45S_400M` (400 m/px, 45°S–90°S) y `LDEM_16` (~1.9 km/px, global). Corre offline y genera los JSON y heightmaps en `web/public/data/` y `web/public/static/terrain/`.
- **Web + VR:** **Next.js 15** (App Router, `output: 'export'`) + React 19 + TypeScript strict, en `web/`. 3D/WebXR con **three.js puro** (no react-three-fiber): el motor (`lib/engine/`), las 5 fases de la experiencia (`lib/phases/`) y la capa de datos (`lib/mission/`) consumen `@touchdown/core` y los JSON precalculados directamente — funciona como sitio 100% estático sin depender del Worker para la demo.
- **API REST:** **Cloudflare Worker** (`worker/src/index.ts`) en `/api/*`. Sirve catálogo, máscaras, efemérides, metadatos de terreno y `/api/scenario` en el mismo dominio (sin CORS).
- **Lógica compartida:** `core/` (`@touchdown/core`): tipos TypeScript del contrato §7 y el motor de escenario (`computeScenario`, `positionAt`, `horizonAt`) — lo importan el Worker **y** la web.
- **Tiempo real:** **Cloudflare Durable Object** (`RoomHub`) en `/ws?room=<room>` con persistencia SQLite por sala.
- **Infraestructura y CI/CD:** `worker/wrangler.jsonc` + GitHub Actions. **Desplegado (14-nov-2026):** `https://touchdown.villabruno2.workers.dev` — cada push a `main` corre CI y despliega solo (`.github/workflows/deploy.yml`, gateado por la variable de repo `CLOUDFLARE_DEPLOY`). Probado end-to-end contra la URL real: `/api/health`, `/api/sites`, `/api/scenario`, `/data/*`, `/static/terrain/*` y `/ws` (WebSocket) responden correctamente.
- **Datos pesados:** heightmaps RAW16/PNG y texturas en `web/public/static/terrain/`, servidos en `/static/terrain/*`.

### Por qué Durable Objects (y no otro servicio)
- **WebSockets nativos con estado fuerte por sala** dentro del mismo Worker y dominio, sin tablas externas ni APIs adicionales.
- Habla **WebSocket estándar con JSON plano**, compatible directamente con el cliente WebSocket nativo del navegador (Quest incluido).
- Con la WebSocket Hibernation API (`ctx.acceptWebSocket`) el objeto sale de memoria entre mensajes sin cortar las conexiones y no cobra duración mientras hiberna. Al despertar pierde la memoria, por eso el estado de la sala vive en SQLite.

### Limitaciones del export estático de Next.js
- **Sin route handlers dinámicos, server actions, middleware ni SSR.** Todo lo dinámico va al Worker en `/api/*` o se resuelve en el cliente (como hace hoy `web/lib/mission/sites.ts`, que lee directo los JSON estáticos).
- **Rutas dinámicas** usan query strings o `generateStaticParams`.
- **`next/image`** usa `images: { unoptimized: true }`.
- **Desarrollo local:** `pnpm dev` compila la web y levanta Worker + Static Assets + Durable Object en `http://localhost:8787`. `pnpm dev:web` corre solo el front con `next dev` (sirve para probar la VR/web contra los JSON estáticos sin el Worker).

### Riesgos y mitigaciones
- **Depende de internet en el evento.** Mitigación: el mismo Worker servido a la red local con `pnpm dev:lan` (`wrangler dev --ip 0.0.0.0`); web y Quest apuntan a `ws://<ip-laptop>:8787/ws?room=<room>`.
- **La web debe funcionar sin sincronización** (estado local independiente) si el WebSocket se desconecta durante el demo — hoy la web ya funciona así por defecto, leyendo los JSON estáticos sin WebSocket.
- **Tamaño de assets:** Workers Static Assets admite hasta 25 MiB por archivo y 20 000 archivos por versión (plan Free). Los heightmaps son RAW16 de `513×513` (~0.5 MiB) porque el DEM fuente es de 80 m/px.
- No crear, borrar ni renombrar recursos de Cloudflare (Workers, clases de Durable Object, dominios, tokens) sin confirmarlo con el equipo. **Cada push a `main` despliega solo** (CI/CD ya activo), y una migración que borra una clase de Durable Object elimina para siempre el estado de las salas — pensarlo dos veces antes de tocar `worker/wrangler.jsonc`.

### Principio clave: precalcular
Las efemérides y las máscaras de horizonte se calculan **offline** y se sirven como JSON. Nada de llamadas en vivo a Horizons durante el demo. Las coordenadas personalizadas usan horizonte esférico geométrico como fallback con la etiqueta `"source": "spherical"`.

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

### Catálogo de sitios (ya calculado, no es un borrador)
El pipeline ya generó esto con datos reales — fuente de verdad: `web/public/data/sites.json`. Coordenadas con fuente citada en `coord_source`; `approx: false` cuando ya se verificaron.

| Sitio | Programa | Lat | Lon (E) | Terreno real (LOLA) |
|---|---|---|---|---|
| Malapert A (IM-1 Odysseus) | CLPS, 2024 | −80.13 | 1.44 | ✅ |
| Mons Mouton (IM-2 Athena) | CLPS/Artemis | −84.79 | 29.20 | ✅ |
| Malapert Massif | Artemis III candidato | ver `sites.json` | | ✅ |
| Shackleton–de Gerlache ridge | Artemis / científico | ver `sites.json` | | ✅ |
| Nobile Rim 1 | Artemis III candidato | ver `sites.json` | | ✅ |
| Nobile Rim 2 | Artemis III candidato | ver `sites.json` | | ✅ |
| Chandrayaan-3 (Vikram) | ISRO, 2023 | ver `sites.json` | | — (solo efemérides) |
| Chang'e 4 | CNSA, 2019 | ver `sites.json` | | — (lado oculto: la Tierra **nunca** es visible) |
| Apollo 11 | NASA, 1969 | ver `sites.json` | | — (contraste ecuatorial) |
| Apollo 17 | NASA, 1972 | ver `sites.json` | | — |

**Terreno real (RAW16 513×513, 20 km de extensión) en `web/public/static/terrain/`** para los 6 sitios del polo sur. Los otros 4 solo tienen efemérides + horizonte esférico geométrico (`horizon_source: "spherical"`).

---

## 7. Contrato de datos (v0.1 — ya implementado en `core/`, `worker/` y `web/`)

*Cambios v0 → v0.1: el WebSocket pasa de API Gateway al Durable Object `RoomHub` del Worker — solo cambia la URL (`wss://<worker-host>/ws?room=<room>`), mensajes y endpoints REST no cambian. Los heightmaps se sirven a `513×513` (no 1025; el DEM fuente es de 80 m/px). Nuevo y opcional: `{ "type": "ping" }` → el servidor responde `{ "type": "pong" }` (latido para no perder la conexión).*

Formato compartido entre `pipeline/`, `core/` (`@touchdown/core`), `worker/` y `web/`. **No cambiarlo sin avisar al equipo.** Los endpoints REST los sirve el Worker en el mismo dominio que la web. Tiempos en UTC ISO 8601 y ángulos en grados. Azimut desde el norte (0°) en sentido horario hacia el este (90°).

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
  "source": "LOLA LDEM_80S_80M + LDEM_45S_400M",
  "max_range_km": 300
}
```
*`source: "spherical"` para sitios sin DEM local (horizonte geométrico, sin terreno).*

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
*`status`: `"viable"`, `"marginal"` o `"not_viable"` — fórmula exacta en `core/src/scenario.ts` (`computeScenario`): `score = 100 * (0.5 * fracción_sol + 0.5 * fracción_tierra)`.*

### Terreno para VR/3D: `GET /api/sites/{id}/terrain`
```json
{
  "site_id": "malapert-a",
  "heightmap_url": "/static/terrain/malapert-a.raw",
  "format": "RAW16 little-endian",
  "size_px": 513,
  "extent_m": 20000,
  "min_height_m": 1782.38,
  "max_height_m": 2962.85,
  "texture_url": "/static/terrain/malapert-a.png",
  "site_px": [256, 256]
}
```
*(513 = 2ⁿ+1. Leer `size_px`/`site_px` del JSON, no fijarlos en código — ver el loader real en `web/lib/mission/sites.ts`.)*

### WebSocket (Durable Object `RoomHub`) — estado compartido
**Conexión:** `wss://<worker-host>/ws?room=<room>`
- La sala va como query string, enrutada hacia el Durable Object correspondiente (`idFromName(room)`).
- La URL se configura por variable de entorno (`NEXT_PUBLIC_WS_URL`), con fallback al Worker en la laptop (`ws://<ip-laptop>:8787/ws?room=<room>`, vía `pnpm dev:lan`). Como VR y web comparten la misma app Next.js, ambos leen la misma variable.

Mensajes en JSON con `type`:
```json
{ "type": "hello" }
{ "type": "state", "site_id": "malapert-a", "t": "2027-01-10T00:00:00Z", "playing": false, "speed": 1, "markers": [] }
{ "type": "set_site", "site_id": "mons-mouton" }
{ "type": "set_time", "t": "2027-01-31T00:00:00Z" }
{ "type": "marker_add", "id": "m1", "site_id": "malapert-a", "x_m": 120.5, "y_m": -40.2, "kind": "rock", "note": "roca ~2 m" }
{ "type": "marker_remove", "id": "m1" }
{ "type": "ping" }
{ "type": "pong" }
```
- **`hello`:** cada cliente, al abrir la conexión, manda `{ "type": "hello" }`, y el Durable Object le responde **solo a él** con el `state` actual de la sala (marcadores incluidos). Así se cubre a quien se conecta tarde.
- **`markers` dentro de `state`:** lista con los marcadores vigentes de la sala.
- Coordenadas de marcadores: metros locales relativos al sitio (este = +x, norte = +y).
- **Sincronizar solo esto:** sitio, tiempo, reproducción y marcadores. Nada más.
- El servidor reenvía (broadcast) cada cambio a los demás clientes de la sala y persiste el estado en SQLite del Durable Object.
- **Los clientes deben reconectar solos y volver a mandar `hello`.** Mandar `ping` cada ~30 s para que la red no cierre conexiones inactivas.
- El respaldo local (`pnpm dev:lan`) implementa exactamente este mismo protocolo.

---

## 8. División del equipo (6 personas)

| Rol | Personas | Responsabilidades |
|---|---|---|
| Datos | 1 | Pipeline LOLA → horizonte y heightmap; efemérides precalculadas |
| Web | 1 | Mission Control en Next.js: catálogo, comparador, diagrama polar, línea de tiempo, cuentas regresivas |
| API + tiempo real + integración | 1 | Cloudflare Worker (`/api/*`, Static Assets, Durable Object WebSocket); respaldo local con `pnpm dev:lan`; despliegue CI/CD; reporte en la web; dueño del contrato de datos |
| VR (WebXR, dentro de `web/`) | 2 | Una persona: terreno, Sol y Tierra, iluminación (`lib/engine`, `lib/phases/surface-world.ts`). Otra: interacción, panel flotante, marcadores y cliente WebSocket |
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
- [ ] VR: modo desarrollador del Quest, prototipo WebXR "hola mundo" corriendo en el headset (pendiente: emparejamiento Bluetooth con la app Meta Horizon)
- [ ] VR: importar un heightmap de LOLA de prueba y medir el rendimiento en el visor
- [x] VR: decisión de stack → WebXR + three.js dentro de `web/`, Unity descartado (14 nov)
- [x] Web: decidir el stack → Next.js + serverless (4 nov)
- [ ] Web: prototipar el diagrama polar
- [x] Infra: hosting del front → Next.js estático en S3 + CloudFront; `/api/*` en una Lambda detrás del mismo CloudFront (4 nov, **obsoleto, ver abajo**)
- [x] Infra: decisión final → **Cloudflare Workers + Durable Objects** en vez de AWS (14 nov); ningún recurso AWS llegó a crearse, no hay nada que desmantelar
- [x] Infra/Datos: pipeline real (`pipeline/`), `core/` (`@touchdown/core`) y `worker/` (API REST + Durable Object `RoomHub`) ya integrados en el repo, con tests pasando (14 nov)
- [x] Infra: GitHub Actions (CI en PRs + deploy a Cloudflare en `main`) configurado y verificado (14 nov)
- [x] Infra: desplegado a Cloudflare — `https://touchdown.villabruno2.workers.dev` (14 nov). Los tokens siguen en la cuenta personal de quien construyó `worker/`; pendiente pasarlos a una cuenta de equipo si se quiere seguir usando después del hackathon.
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
- **Edge serverless:** el front es un export estático de Next.js; no uses SSR, server actions, middleware ni route handlers dinámicos. Lo dinámico va en el Cloudflare Worker (`/api/*`) o se resuelve en el cliente leyendo los JSON estáticos directo (como ya hace `web/lib/mission/sites.ts`). El estado compartido vive en el Durable Object `RoomHub` (o en el mismo Worker con `pnpm dev:lan` para el respaldo local). Las URLs de la API y del WebSocket siempre van por variables de entorno.
- No crear, borrar ni renombrar recursos de Cloudflare (Workers, clases de Durable Object, dominios, tokens) sin confirmarlo con el equipo.
- Marca con claridad cualquier dato aproximado o simulado (por ejemplo, el campo `"source": "approx"` o `"spherical"`). Nunca presentes datos inventados como reales de NASA.
- Valida los cálculos contra una fuente independiente (Moon Trek, Quickmap o Horizons) antes de confiar en ellos.
- Prioridad: **web funcional > datos correctos > VR > extras.** La web tiene que funcionar sola en el video.
- El VR vive dentro de `web/` (Next.js + three.js + WebXR), no en un proyecto Unity separado — ver `web/README.md` para correrlo y probarlo en el Quest.
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
