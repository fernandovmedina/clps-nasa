<div align="center">

# 🌑 TOUCHDOWN

### Evalúa sitios y fechas de aterrizaje lunar en segundos.

**NASA Space Apps Challenge 2026 · Reto: _Lunar Landing Site Navigator_**

*La web decide con datos y el VR valida con los ojos.*

![Space Apps 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=for-the-badge)
![Estado](https://img.shields.io/badge/estado-preparación-orange?style=for-the-badge)
![Hackathon](https://img.shields.io/badge/hackathon-14–15%20nov-FC3D21?style=for-the-badge)

</div>

---

## 🚀 El problema

En el **polo sur lunar** el Sol rasga el horizonte y la Tierra se esconde detrás de los cerros. Un cambio de unos días en la fecha o de unos kilómetros en el sitio puede dejar a una misión **sin energía** o **sin comunicación directa con la Tierra**.

Las herramientas que existen (Quickmap, Moon Trek, JPL Horizons) son potentes, pero no están hechas para comparar escenarios rápido. Cuando una misión se retrasa, el equipo necesita saber **ya** si el sitio sigue siendo viable o cuál es la alternativa.

## 💡 La solución

**TOUCHDOWN** tiene dos caras sincronizadas en tiempo real:

| | 🖥️ **Mission Control** (web) | 🥽 **Inspector de sitio** (Meta Quest 3S) |
|---|---|---|
| **Para quién** | Planeadores de misión | Público, educadores, el "inspector en campo" |
| **Qué hace** | Compara escenarios sitio × fecha con efemérides reales y el horizonte real del terreno | Te para en el sitio, a escala real, para ver *por qué* cambia todo |
| **Clave** | Cuentas regresivas, semáforo de viabilidad, botón de **retraso** | El cerro que tapa la Tierra y las sombras de kilómetros |

### Lo que nos hace diferentes

1. **⛰️ Horizonte real desde LOLA.** No usamos una esfera lisa: calculamos la silueta del terreno en cada azimut con los datos del altímetro láser del LRO.
2. **🔗 VR sincronizado con la web.** Multijugador asimétrico: el planeador manda al inspector a un sitio y le llegan en vivo los riesgos que marca.
3. **⏱️ La narrativa del retraso.** El demo gira en torno a lo que de verdad pasa en las misiones: *"se retrasó tres semanas, ¿y ahora?"*.

## ✨ Funcionalidades

- 📍 **Catálogo curado:** Apollo, CLPS (IM-1, IM-2), candidatos de Artemis III, Chandrayaan-3 y Chang'e 4, más coordenadas personalizadas.
- 🧭 **Diagrama polar del cielo:** trayectorias del Sol y la Tierra contra la silueta real del horizonte.
- 📊 **Línea de tiempo:** bandas de Sol, Tierra y ventana de operación (cuando hay los dos).
- ⏳ **Cuentas regresivas** al atardecer y al Earthset.
- ☀️ **Elevación solar** como métrica principal (potencia de los paneles).
- ⚖️ **Comparación lado a lado** de 2 a 4 escenarios.
- 📅 **Botón de retraso:** mueve la fecha N días y ve qué se rompe.
- 🥽 **VR:** terreno real, Sol y Tierra en su posición real, y marcado de riesgos sincronizado.
- 📝 **Reporte:** sitio recomendado, ventana y riesgos.

## 🏗️ Arquitectura

**100% serverless.** Como todo se precalcula, no hay servidores siempre encendidos.

```
        ┌─────────────────────────────────────────┐
        │  Pipeline de datos (Python, offline)    │
        │  LOLA DEM → máscara de horizonte        │
        │  LOLA DEM → heightmap para VR/3D        │
        │  SPICE / Horizons → efemérides          │
        └───────────────────┬─────────────────────┘
                            │ JSON / RAW precalculados
        ┌───────────────────▼─────────────────────┐
        │  ☁️ CloudFront (un solo dominio)        │
        │  ├── /*     → S3: Next.js estático      │
        │  └── /api/* → Lambda: API REST          │
        └───────┬─────────────────────────┬───────┘
                │ REST                    │ REST
   ┌────────────▼──────────┐   ┌──────────▼────────────┐
   │ 🖥️ Mission Control    │   │ 🥽 WebXR (three.js)   │
   │ (navegador)           │   │ Inspector de sitio    │
   └────────────┬──────────┘   └──────────┬────────────┘
                │        WebSocket        │
        ┌───────▼─────────────────────────▼───────┐
        │  ☁️ AWS API Gateway (WebSocket)         │
        │  → Lambda → DynamoDB                    │
        │  conexiones + estado de cada sala       │
        └─────────────────────────────────────────┘
```

- **Principio clave:** todo lo pesado se **precalcula**. Nada de llamadas en vivo a Horizons durante el demo.
- **Plan de respaldo:** un servidor WebSocket local con el mismo protocolo, por si falla el internet del evento. La web también funciona sin sincronización.

### Stack

| Capa | Tecnologías |
|---|---|
| Datos | Python 3.11+, NumPy, `rasterio`, `spiceypy`, JPL Horizons API |
| Web | **Next.js** (App Router, export estático), TypeScript, D3 / Three.js |
| API REST | **AWS Lambda** (Node.js) detrás de CloudFront en `/api/*` |
| Tiempo real | **AWS API Gateway WebSocket**, Lambda (Node.js), DynamoDB |
| Hosting | **S3 + CloudFront** (front, heightmaps y texturas) |
| Infra | AWS SAM / CDK |
| VR | WebXR con three.js puro, dentro del mismo Next.js de `web/` (decisión 14-nov-2026; Unity descartado) |

## 🔭 La ciencia

**Horizonte real.** Para cada azimut recorremos el DEM desde el sitio hacia afuera y nos quedamos con el ángulo máximo del terreno, corrigiendo por la curvatura lunar:

$$\theta(d) = \arctan\left(\frac{h(d) - h_0 - h_{obs} - \frac{d^2}{2R}}{d}\right), \qquad R = 1737.4\ \text{km}$$

Un cuerpo es visible si su elevación supera `horizon_deg[az]`. Sin atmósfera **no hay refracción**: el horizonte lo definen solo el terreno y la esfera lunar.

**Efemérides.** Azimut y elevación topocéntricos del Sol y la Tierra cada hora, con SPICE o JPL Horizons. La libración de la Tierra ya viene incluida.

**Métricas.** Ventanas de Sol, de Tierra y de ambos; tiempo al siguiente ocaso; horas de energía y de comunicación en la misión; puntaje de viabilidad (50% energía, 50% comunicación).

## 🛰️ Datos de NASA que usamos

- [LOLA (Lunar Orbiter Laser Altimeter)](https://pds-geosciences.wustl.edu/missions/lro/lola.htm): DEMs del polo sur
- [NASA Moon Trek](https://trek.nasa.gov/moon/): recortes de DEM y mosaicos
- [LROC Quickmap](https://quickmap.lroc.asu.edu/): validación visual
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) y [NAIF SPICE](https://naif.jpl.nasa.gov/naif/): efemérides
- [CLPS](https://www.nasa.gov/reference/commercial-lunar-payload-services/) y [regiones de Artemis III](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/): catálogo de sitios

## 📁 Estructura del repo (planeada)

```
clps-nasa/
├── pipeline/   # Python: LOLA → horizonte y heightmap; efemérides
├── web/        # Next.js (export estático): Mission Control + VR WebXR (three.js)
├── api/        # Lambda de la API REST (/api/*)
├── realtime/   # Lambda del WebSocket + servidor local de respaldo
├── infra/      # AWS SAM/CDK: S3, CloudFront, Lambdas, API Gateway, DynamoDB
├── vr/         # Prototipos/sandbox de prueba WebXR (no la app final, ver web/)
├── docs/       # Análisis de fuentes de datos oficiales del reto
├── CLAUDE.md   # Contexto completo del proyecto y contrato de datos
└── README.md
```

> 📜 **El contrato de datos** (formatos JSON, endpoints y mensajes de WebSocket) está en [`CLAUDE.md`](CLAUDE.md#7-contrato-de-datos-borrador-v01). **No se cambia sin avisar al equipo.**

## 👥 Equipo

| Rol | Responsabilidad |
|---|---|
| **Datos** | Pipeline LOLA → horizonte y heightmap; efemérides precalculadas |
| **Web** | Mission Control: catálogo, diagrama polar, línea de tiempo, comparador |
| **API + tiempo real + integración** | Lambda de la API, S3 + CloudFront, WebSocket en AWS, servidor de respaldo, contrato de datos, despliegue |
| **VR: mundo** | Terreno, Sol, Tierra e iluminación en WebXR (three.js, dentro de `web/`) |
| **VR: interacción** | Panel flotante, marcadores, cliente WebSocket |
| **Pitch y diseño** | Narrativa, identidad visual, video y página del proyecto |

## 🗓️ Plan

- [ ] **Antes del 14 de nov:** preparación y prototipos desechables (datos, Quest, wireframes, identidad)
- [ ] **13 nov:** revisar la pestaña *Resources* del reto
- [ ] **14–15 nov:** construcción del producto en 48 h
- [ ] Entrega: video + página del proyecto

> ⚠️ Las coordenadas de los sitios son aproximadas hasta verificarlas contra fuentes oficiales. Cualquier dato simulado se marca de forma explícita en la app.

---

<div align="center">

Hecho con ☕ y regolito para el **NASA International Space Apps Challenge 2026** · *The Next Frontier*

</div>
