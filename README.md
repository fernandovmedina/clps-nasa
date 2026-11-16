<div align="center">

# TOUCHDOWN

**Evaluate lunar landing sites and dates in seconds.**

NASA International Space Apps Challenge 2026 · Challenge: *Lunar Landing Site Navigator*

![Space Apps 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-0B3D91?style=flat-square)
![Status](https://img.shields.io/badge/status-deployed-2ea44f?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20WebXR-555555?style=flat-square)

**Live demo:** https://touchdown.villabruno2.workers.dev

</div>

---

## Overview

At the lunar south pole the Sun skims the horizon and Earth disappears behind ridges and crater rims. Shifting a landing by a few days, or a few kilometers, can leave a mission without solar power or without a direct-to-Earth communication link.

Existing tools such as LROC Quickmap, NASA Moon Trek and JPL Horizons are powerful, but they are built for detailed analysis rather than rapid scenario comparison. When a mission slips, planners need to know immediately whether the site is still viable and, if not, what the best alternative is.

TOUCHDOWN combines real JPL Horizons ephemerides with terrain horizons derived from LOLA elevation data to answer that question quickly, through two synchronized interfaces:

| | Mission Control (web) | Site Inspector (WebXR, Meta Quest 3S) |
|---|---|---|
| **Audience** | Mission planners | Educators, the public, field inspection |
| **Purpose** | Compare site × date scenarios with real ephemerides and real terrain horizons | Stand on the site at true scale and see *why* conditions change |
| **Key features** | Countdowns, viability status, mission-delay simulation | The ridge that hides Earth, kilometer-long shadows |

## Key differentiators

1. **Real terrain horizons from LOLA.** Instead of a smooth sphere, the horizon elevation is computed at every azimuth from Lunar Orbiter Laser Altimeter DEMs, corrected for lunar curvature.
2. **Web and VR synchronized in real time.** An asymmetric multi-user setup: the planner and the VR inspector share the same site, time and playback state through a WebSocket room.
3. **Mission-delay workflow.** The product is built around the situation the challenge describes: "the launch slipped three weeks, what now?"

## Features

- **Curated site catalog:** CLPS (IM-1, IM-2), Artemis III candidate regions, Chandrayaan-3, Chang'e 4 and Apollo 11/17, plus custom coordinates.
- **Sky diagram:** Sun and Earth trajectories plotted against the real horizon profile of the site.
- **Timeline:** sunlight, Earth visibility and combined operating windows over the mission.
- **Countdowns** to the next sunset and Earthset.
- **Solar elevation** as the headline power metric.
- **Side-by-side comparison** of multiple site × date scenarios.
- **Delay simulation:** shift the landing date by N days and see what changes.
- **Mission report:** recommended site, operating windows and risks.
- **Immersive experience (WebXR):** launch, orbital site ranking, surface view on real LOLA terrain, powered descent and data transmission, playable on desktop or Meta Quest 3S.
- **Burro Pardo mascot:** a small donkey in a space suit that hops beside the viewer in VR and in the welcome guide (decoration only, no external services).

## Architecture

The system is fully serverless. All heavy computation is done offline, so no long-running servers are required.

```
        ┌─────────────────────────────────────────┐
        │  Data pipeline (Python, offline)        │
        │  LOLA DEM      -> horizon masks         │
        │  LOLA DEM      -> heightmaps (3D/VR)    │
        │  JPL Horizons  -> Sun/Earth ephemerides │
        └───────────────────┬─────────────────────┘
                            │ precomputed JSON / RAW16
        ┌───────────────────▼─────────────────────┐
        │  Cloudflare Worker (single domain)      │
        │  ├── /*        -> Static Assets (web)   │
        │  ├── /static/* -> Static Assets (terrain)│
        │  ├── /api/*    -> REST API              │
        │  └── /ws       -> Durable Object RoomHub│
        │                   (WebSocket + SQLite)  │
        └───────┬─────────────────────────┬───────┘
                │ REST + WS               │ REST + WS
   ┌────────────▼──────────┐   ┌──────────▼────────────┐
   │ Mission Control       │   │ Site Inspector        │
   │ (browser)             │   │ (WebXR, three.js)     │
   └───────────────────────┘   └───────────────────────┘
```

- **Precompute everything.** Ephemerides and horizon masks are generated offline and served as static JSON. There are no live calls to Horizons at runtime.
- **Works offline from the sync layer.** The web app reads the static JSON directly and remains fully functional if the WebSocket is unavailable.
- **Local fallback.** The same Worker can be served on a local network with `pnpm dev:lan`.

### Technology stack

| Layer | Technologies |
|---|---|
| Data pipeline | Python 3.12 (`uv`), NumPy, Pillow, LOLA GDR products, JPL Horizons API |
| Web and VR | Next.js (App Router, static export), React 19, TypeScript, three.js, WebXR |
| Shared logic | `@touchdown/core`: data contract types and scenario engine, used by both `worker/` and `web/` |
| REST API | Cloudflare Worker under `/api/*`, same origin as the web app |
| Real-time sync | Cloudflare Durable Objects (`RoomHub`, WebSocket Hibernation API, SQLite storage) |
| Hosting | Cloudflare Workers Static Assets (front end, heightmaps, textures) |
| CI/CD | GitHub Actions: CI on pull requests, automatic deployment on `main` |

## Methodology

**Terrain horizon.** For each azimuth (0.5° step), the DEM is sampled outward from the site and the maximum terrain elevation angle is kept, corrected for lunar curvature:

$$\theta(d) = \arctan\left(\frac{h(d) - h_0 - h_{obs} - \frac{d^2}{2R}}{d}\right), \qquad R = 1737.4\ \text{km}$$

A body is visible when its elevation exceeds `horizon_deg[az]`. The Moon has no atmosphere, so there is no refraction: the horizon is defined solely by terrain and the curvature of the lunar sphere. For each point, the highest-resolution DEM available is used: `LDEM_80S_80M` (80 m/px), `LDEM_45S_400M` (400 m/px) and `LDEM_16` (~1.9 km/px, global).

**Ephemerides.** Topocentric azimuth and elevation of the Sun and Earth at hourly resolution, computed with JPL Horizons from a surface observer (`coord@301`). Earth libration is included in the ephemeris.

**Metrics.** Sunlight, Earth-visibility and combined windows; time to next sunset and Earthset; hours of power and communication within the mission window; and a viability score:

```
score = 100 × (0.30 × energy + 0.25 × comms + 0.30 × operations + 0.15 × continuity)
```

- **Energy:** mean fraction of the solar disk above the real LOLA horizon (a grazing Sun counts less than a clear one).
- **Comms:** fraction of the mission with Earth above the horizon.
- **Operations:** fraction of the mission with both the Sun and Earth visible.
- **Continuity:** `1 − longest night / mission duration`.

Each scenario is classified as `viable`, `marginal` or `not_viable`, and sites are ranked first by status, then by score. The reference implementation is `computeScenario` in `core/src/scenario.ts`.

## Site catalog

| Site | Program | Lat | Lon (E) | LOLA terrain |
|---|---|---|---|---|
| Malapert A (IM-1 Odysseus) | CLPS | -80.13 | 1.44 | Yes |
| Mons Mouton (IM-2 Athena) | CLPS / Artemis | -84.79 | 29.20 | Yes |
| Malapert Massif | Artemis III | -85.97 | -2.50 | Yes |
| Shackleton Connecting Ridge | Artemis III | -89.45 | -137.40 | Yes |
| Nobile Rim 1 | Artemis III | -85.30 | 36.92 | Yes |
| Nobile Rim 2 | Artemis III | -84.20 | 60.70 | Yes |
| Statio Shiv Shakti (Chandrayaan-3) | ISRO | -69.37 | 32.32 | No |
| Von Kármán Crater (Chang'e 4) | CNSA | -45.46 | 177.59 | No |
| Mare Tranquillitatis (Apollo 11) | NASA Apollo | 0.67 | 23.47 | No |
| Taurus-Littrow (Apollo 17) | NASA Apollo | 20.19 | 30.77 | No |

Sites without local terrain use a geometric spherical horizon and are labeled `"source": "spherical"` in the data. The source of truth for the catalog is `web/public/data/sites.json`.

## Repository structure

```
clps-nasa/
├── pipeline/   Python (uv): LOLA and JPL Horizons ingestion, horizon masks, heightmaps
├── core/       @touchdown/core: data contract types and scenario engine (TypeScript)
├── worker/     Cloudflare Worker (/api/*), Durable Object (/ws), wrangler.jsonc
├── web/        Next.js static export: Mission Control and the WebXR experience
├── vr/         WebXR sandboxes and prototypes (not the production app)
├── docs/       Notes on the challenge's official data sources
├── CLAUDE.md   Full project context and data contract
└── README.md
```

## Getting started

**Prerequisites:** Node.js with `pnpm` 10, and Python 3.12 with `uv` (only needed to regenerate data).

```bash
pnpm install

pnpm dev:web     # Front end only (next dev, http://localhost:3000), no real-time sync
pnpm dev         # Builds the web app and runs Worker + API + WebSocket at http://localhost:8787
pnpm dev:lan     # Same as dev, exposed on the local network (0.0.0.0)
```

Quality checks:

```bash
pnpm test        # core, worker and web unit tests
pnpm typecheck
pnpm lint
```

Regenerating data (writes to `web/public/data/` and `web/public/static/terrain/`):

```bash
cd pipeline
uv sync
uv run touchdown-build
```

### Running on Meta Quest 3S

WebXR requires HTTPS. Open the deployed URL directly in the Quest browser, or run the development server over HTTPS on the local network:

```bash
cd web && pnpm dev:https   # https://<your-ip>:3000
```

See [`web/README.md`](web/README.md) for development shortcuts (`?phase=`, `?speed=`, `?room=`) and details on synchronization.

## Deployment

Deployment is manual; pushing to `main` does not deploy anything (CI only runs on pull requests). `worker/wrangler.jsonc` has no `account_id`, so Wrangler deploys to whichever Cloudflare account you are logged into:

```bash
pnpm --filter @touchdown/worker exec wrangler login   # once
pnpm --filter @touchdown/web build
pnpm --filter @touchdown/worker run deploy
pnpm --filter @touchdown/worker deploy:dry-run   # validate without deploying
```

## Data contract

The JSON formats, REST endpoints and WebSocket messages shared by `pipeline/`, `core/`, `worker/` and `web/` are documented in [`CLAUDE.md`, section 7](CLAUDE.md#7-data-contract-v01--implemented-in-core-worker-and-web). Changes to the contract must be agreed with the team, since they affect both the web app and the VR client.

## Data sources

- [LOLA (Lunar Orbiter Laser Altimeter)](https://pds-geosciences.wustl.edu/missions/lro/lola.htm): south pole digital elevation models
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [NAIF SPICE](https://naif.jpl.nasa.gov/naif/): ephemerides
- [NASA Moon Trek](https://trek.nasa.gov/moon/) and [LROC Quickmap](https://quickmap.lroc.asu.edu/): visual validation
- [CLPS](https://www.nasa.gov/reference/commercial-lunar-payload-services/) and [Artemis III candidate regions](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/): site catalog

Any approximated or simulated value is explicitly labeled in the data and in the application. No simulated data is presented as official NASA data.

## Team

| Role | Responsibilities |
|---|---|
| Data | LOLA pipeline (horizon masks, heightmaps) and precomputed ephemerides |
| Web | Mission Control: catalog, sky diagram, timeline, comparison |
| API, real-time and integration | Cloudflare Worker, Durable Object, local fallback, data contract, deployment |
| VR: world | Terrain, Sun, Earth and lighting in WebXR |
| VR: interaction | Floating panels, markers, WebSocket client |
| Pitch and design | Narrative, visual identity, video and project page |

---

<div align="center">

Built for the NASA International Space Apps Challenge 2026 · *The Next Frontier*

</div>
