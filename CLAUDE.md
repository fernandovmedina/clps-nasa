# TOUCHDOWN — NASA Space Apps Challenge 2026

Full project context for Claude Code. Read it in its entirety before proposing or writing code.

---

## 1. General information

- **Event:** NASA International Space Apps Challenge 2026, theme "The Next Frontier"
- **Hackathon dates:** November 14–15, 2026 (48 hours)
- **Team:** 6 people
- **Selected challenge:** **Lunar Landing Site Navigator** (referred to as "CLPS Lunar Mission Browser" in earlier summaries)
- **Difficulty:** Advanced / Intermediate
- **Topics:** Human Exploration, Moon, Software, Space Exploration
- **Available hardware:** Meta Quest 3S
- **Official challenge resources:** the "Resources" tab is published on November 13. Until then, public sources are used (section 6).

### Important rule about prior work
Space Apps normally requires the project to be built **during** the hackathon. Before the 14th, only preparation is allowed: research, learning, environment setup, data testing and throwaway prototypes. **The final product code is written on the 14th–15th.** Any request made before that date should be treated as a prototype or proof of concept unless the team says otherwise. The exact rules of the local event must be confirmed.

---

## 2. The challenge (full official text)

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

## 3. The idea: TOUCHDOWN

**In one line:** a tool to evaluate lunar landing sites and dates in seconds. A web app (Mission Control) compares scenarios using real ephemerides and the real terrain horizon, and a VR experience (Quest 3S) places the user on the site to show why a small change in date or location changes everything.

**Pitch line:** *The web decides with data; VR validates with your own eyes.*

### How it addresses the challenge
| What the challenge asks for | How TOUCHDOWN covers it |
|---|---|
| An **intuitive** tool (the problem is complicated interfaces) | Decision-focused web app: countdowns, traffic-light status, side-by-side comparison |
| Compare sites **and dates** quickly | Scenario comparator (site × date) and a "the mission was delayed" scenario |
| Sun and Earth **relative to the horizon** | Polar diagram with the real horizon mask, plus 3D/VR view |
| Time remaining before sunset / Earthset | Large, prominent countdowns in both web and VR |
| Prominent solar elevation | Primary metric on every site card |
| Real topography (LOLA), no refraction | Per-azimuth horizon mask computed from the LOLA DEM plus lunar curvature |
| 3D and "creative formats" | VR on Quest 3S |
| Make Moon vs. Earth differences apparent | Standing at the south pole with the Sun grazing the horizon and kilometer-long shadows |
| Planners, educators and the public | Web for planners; VR for the public and education |
| Coordination between science and engineering | Mission Control (web) plus field inspector (VR), synchronized |
| Earth libration | Included in the ephemeris (SPICE/Horizons); mentioned in the pitch |

### Differentiators against the competition
There are already public repositories from other teams working on this challenge (search GitHub for "CLPS Lunar Mission Browser"). Nearly all of them build **only a web app** with Horizons/SPICE ephemerides and charts, and several treat the horizon as a **smooth sphere**; one of them acknowledges that the major improvement would be a LOLA horizon mask. Our differentiators are:
1. **Real horizon from LOLA** (what makes a ridge hide Earth).
2. **VR synchronized with the web** (asymmetric multi-user; almost nobody does this).
3. **Mission-delay narrative** (the core of the challenge background) as the backbone of the demo.

### Known risks (from the initial analysis)
- The global jury mainly evaluates the **video and the project page**, not the headset. **The web app has to win on its own**; VR is the extra layer.
- The 48-hour scope is the number-one risk: two apps, synchronization and a real data pipeline. Keep synchronization minimal.
- If VR does not show something the web cannot, it is decoration. Its job is to show the **real horizon**: the ridge that hides Earth or the shadow that covers the area.

---

## 4. Roles and user experience

### Mission Control (web): the planner
- Chooses sites from a **curated catalog** (Apollo, CLPS, other countries, Artemis III) or enters **custom coordinates**.
- Chooses the landing date and time and the mission duration.
- Sees, per site: **Sun elevation** and azimuth, **Earth visibility**, **countdown to sunset and Earthset**, hours of sunlight and communication within the mission window, and a **viability traffic light**.
- **Polar diagram** (the sky as seen from the site): the path of the Sun and Earth against the real horizon silhouette.
- Multi-day **timeline**: bands for Sun, Earth and the operating window (when both coincide).
- **Side-by-side comparison** of 2 to 4 scenarios (site × date).
- **"Delay" button:** shifts the date by N days and shows what changes.
- Sends the VR inspector to a site and receives the risks they flag, live.
- Final **report**: recommended site, window and risks.

### Site Inspector (VR, Quest 3S)
- Appears standing on the site at true scale (LOLA terrain).
- Sees the **Sun and Earth in their real positions** for the chosen date, and how the terrain occludes them.
- **Floating panel:** solar elevation, Earth status and countdowns.
- **Flags risks** (rocks, slopes, shadow) by pointing with the controller; they reach the web instantly.
- "Look at the Sun" and "Look at Earth" buttons.
- Flexible framing: can be the **site inspector for a CLPS lander** or an **astronaut** (the challenge includes Human Exploration).

### Demo script (~90 s)
1. Planner: "The mission lands on January 10 at Malapert." The web shows Sun elevation, countdowns and the communication window.
2. "It slipped three weeks." The date moves: the window collapses and Earth sets before the mission ends.
3. Side-by-side comparison against Mons Mouton: there, a window exists.
4. In VR, someone stands at Malapert and sees the ridge that hides Earth. That is the *why*.
5. The report is generated with the recommendation.

*(Dates and results in the script are illustrative; they will be replaced with whatever the real data shows.)*

---

## 5. Architecture

**Unified serverless architecture on Cloudflare Workers** (decision made on Nov 14, 2026, around hour 5; replaces the AWS S3/CloudFront/Lambda/API Gateway/DynamoDB topology documented earlier — none of those resources were ever created). Since the lunar data is precomputed, there are no heavy servers or external databases to maintain.
- **Front end:** **Next.js as a static site** (`output: 'export'`) served by **Cloudflare Workers Static Assets**.
- **REST API:** **Cloudflare Worker** on the same domain under `/api/*`.
- **Real time:** **Cloudflare Durable Objects** (`RoomHub` with the WebSocket Hibernation API and embedded SQLite storage) under `/ws?room=<room>`.
- **VR (decision Nov 14, 2026, replaces Unity):** WebXR with **plain three.js** inside the same Next.js app in `web/` (not `@react-three/xr`, not Unity). It lives in the same app as Mission Control, is deployed with it, and the Quest opens it directly in its browser over HTTPS — no native Android build, no Meta XR SDK.

```
        ┌─────────────────────────────────────────┐
        │  Data pipeline (offline, Python)        │
        │  LOLA DEM -> horizon mask               │
        │  LOLA DEM -> cropped heightmap (VR/3D)  │
        │  JPL Horizons -> Sun/Earth ephemerides  │
        └───────────────────┬─────────────────────┘
                            │ precomputed JSON / PNG / RAW
        ┌───────────────────▼─────────────────────┐
        │  Cloudflare Worker (single domain)      │
        │  ├── /*        -> Static Assets (Next.js)│
        │  ├── /static/* -> Static Assets (terrain)│
        │  ├── /api/*    -> REST API (Worker)     │
        │  └── /ws       -> Durable Object RoomHub│
        │                   (WebSocket + SQLite)  │
        └───────┬─────────────────────────┬───────┘
                │ REST + WS               │ REST + WS
   ┌────────────▼──────────┐   ┌──────────▼────────────┐
   │ Browser               │   │ VR (WebXR, three.js)  │
   │ Mission Control       │   │ Site Inspector        │
   └───────────────────────┘   └───────────────────────┘
```

### Stack
- **Data pipeline:** Python 3.12 (`uv`), NumPy, Pillow, JPL Horizons API and PDS LOLA GDR. For each terrain point, the best-resolution DEM covering it is used: `LDEM_80S_80M` (80 m/px, 80°S–90°S), `LDEM_45S_400M` (400 m/px, 45°S–90°S) and `LDEM_16` (~1.9 km/px, global). Runs offline and writes JSON and heightmaps to `web/public/data/` and `web/public/static/terrain/`.
- **Web + VR:** **Next.js** (App Router, `output: 'export'`; see `web/package.json` for the exact version) + React 19 + strict TypeScript, in `web/`. 3D/WebXR with **plain three.js** (no react-three-fiber): the engine (`lib/engine/`), the 5 experience phases (`lib/phases/`) and the data layer (`lib/mission/`) consume `@touchdown/core` and the precomputed JSON directly — it works as a 100% static site without depending on the Worker for the demo.
- **REST API:** **Cloudflare Worker** (`worker/src/index.ts`) under `/api/*`. Serves the catalog, masks, ephemerides, terrain metadata and `/api/scenario` on the same domain (no CORS).
- **Shared logic:** `core/` (`@touchdown/core`): TypeScript types for the section 7 contract and the scenario engine (`computeScenario`, `positionAt`, `horizonAt`) — imported by both the Worker **and** the web app.
- **Real time:** **Cloudflare Durable Object** (`RoomHub`) at `/ws?room=<room>` with per-room SQLite persistence.
- **Mascot (no voice assistant):** the CAPCOM voice assistant (Amazon Nova Sonic on Bedrock + Cognito) was removed on Nov 16, 2026, so the project has **no AWS dependency**. What remains is the Burro Pardo donkey (`web/lib/donkey/`): it hops beside the viewer in VR (`vr-donkey.ts`, driven by `LunarApp`) and in the welcome guide (`donkey-stage.ts`). The launch narration plays the pre-recorded clips in `web/public/audio/narration/` (falling back to browser TTS); the script that generated them with Bedrock was removed too.
- **Infrastructure and CI/CD:** `worker/wrangler.jsonc` + GitHub Actions (CI on pull requests only). **Deployment is manual** (Nov 16, 2026: the auto-deploy on push to `main` was removed) — build the web app and run `pnpm --filter @touchdown/worker run deploy` against the Cloudflare account Wrangler is logged into. Originally deployed (Nov 14, 2026) at `https://touchdown.villabruno2.workers.dev`. Tested end to end against the real URL: `/api/health`, `/api/sites`, `/api/scenario`, `/data/*`, `/static/terrain/*` and `/ws` (WebSocket) all respond correctly.
- **Heavy data:** RAW16/PNG heightmaps and textures in `web/public/static/terrain/`, served at `/static/terrain/*`.

### Why Durable Objects (and not another service)
- **Native WebSockets with strong per-room state** inside the same Worker and domain, with no external tables or additional APIs.
- Speaks **standard WebSocket with plain JSON**, directly compatible with the browser's native WebSocket client (Quest included).
- With the WebSocket Hibernation API (`ctx.acceptWebSocket`) the object is evicted from memory between messages without dropping connections and is not billed for duration while hibernating. On wake-up it loses its in-memory state, which is why room state lives in SQLite.

### Limitations of the Next.js static export
- **No dynamic route handlers, server actions, middleware or SSR.** Everything dynamic goes to the Worker under `/api/*` or is resolved on the client (as `web/lib/mission/sites.ts` does today, reading the static JSON directly).
- **Dynamic routes** use query strings or `generateStaticParams`.
- **`next/image`** uses `images: { unoptimized: true }`.
- **Local development:** `pnpm dev` builds the web app and runs Worker + Static Assets + Durable Object at `http://localhost:8787`. `pnpm dev:web` runs only the front end with `next dev` (useful for testing VR/web against the static JSON without the Worker).

### Risks and mitigations
- **Depends on internet access at the event.** Mitigation: the same Worker served on the local network with `pnpm dev:lan` (`wrangler dev --ip 0.0.0.0`); web and Quest point to `ws://<laptop-ip>:8787/ws?room=<room>`.
- **The web app must work without synchronization** (independent local state) if the WebSocket disconnects during the demo — the web app already behaves this way by default, reading the static JSON without a WebSocket.
- **Asset size:** Workers Static Assets supports up to 25 MiB per file and 20,000 files per version (Free plan). Heightmaps are `513×513` RAW16 (~0.5 MiB) because the source DEM is 80 m/px.
- Do not create, delete or rename Cloudflare resources (Workers, Durable Object classes, domains, tokens) without confirming with the team. Deployment is manual, but a migration that deletes a Durable Object class permanently destroys room state — think twice before touching `worker/wrangler.jsonc`.

### Key principle: precompute
Ephemerides and horizon masks are computed **offline** and served as JSON. No live calls to Horizons during the demo. Custom coordinates use a geometric spherical horizon as a fallback, labeled `"source": "spherical"`.

---

## 6. Data and science

### Sources
- **LOLA (Lunar Orbiter Laser Altimeter)**, PDS Geosciences Node: south pole DEMs in polar stereographic projection (~5–20 m/pixel products near the pole; coarser resolutions for wider areas).
- **NASA Moon Trek** (trek.nasa.gov/moon): an easy way to crop and download DEMs and mosaics of an area.
- **NASA Quickmap** (quickmap.lroc.asu.edu): exploration and visual validation.
- **LROC** (image mosaics) for terrain textures in 3D/VR.
- **JPL Horizons** (API): azimuth and elevation of the Sun (`10`) and Earth (`399`) as seen from a point on the lunar surface (`coord@301`).
- **NAIF SPICE** with `spiceypy`: local alternative to Horizons (kernels: `de440`/`de441` planetary, lunar PCK `moon_pa_de440`, lunar FK, LSK).
- **NASA SVS:** south pole illumination visualizations, useful for validation and for the pitch.

### Calculations

**1. Sun and Earth position (topocentric alt-az)**
- For each site (lat, lon, height) and each time step (suggested: 1 h), compute the azimuth and elevation of the Sun and Earth relative to the local **geometric** horizon (tangent plane).
- No atmosphere, **no refraction**.
- Libration and orbital variations are already included in the ephemeris.
- Optional: model the Sun as a disk (angular radius ≈ 0.27°) and Earth (≈ 0.95°) to handle partial illumination or visibility.

**2. Horizon mask from LOLA**
- For each azimuth (suggested step 0.5°–1°), walk the DEM outward from the site and keep the **maximum elevation angle** of the terrain:
  `ang(d) = atan2( h(d) − h0 − h_obs − d² / (2R), d )`
  where `R = 1737.4 km` (lunar radius), `h0` is the site height, `h_obs` the observer or panel height (e.g. 2 m) and `d²/(2R)` the curvature drop.
- Suggested range: 50–150 km (distant ridges at the south pole do matter).
- Result: an array `horizon_deg[az]`. A body is visible if `elev > horizon_deg[az]`.
- This is exactly what the challenge asks for with "local terrain and the edge of the lunar sphere".

**3. Derived metrics**
- `sun_visible`, `earth_visible` per time step.
- **Windows:** continuous intervals of Sun, Earth and both.
- **Countdown:** time until the next sunset (the Sun crosses the real horizon downward) and until the next Earthset.
- Total hours of Sun and Earth within the mission window.
- Minimum, maximum and average solar elevation.
- **Viability score** (energy, communication, combined operations and continuity; exact weights in section 7) and traffic light: viable / marginal / not viable.

### Site catalog (already computed, not a draft)
The pipeline has already generated this with real data — source of truth: `web/public/data/sites.json`. Coordinates cite their source in `coord_source`; `approx: false` once verified.

| Site | Program | Lat | Lon (E) | Real terrain (LOLA) |
|---|---|---|---|---|
| Malapert A (IM-1 Odysseus) | CLPS, 2024 | −80.13 | 1.44 | Yes |
| Mons Mouton (IM-2 Athena) | CLPS/Artemis | −84.79 | 29.20 | Yes |
| Malapert Massif | Artemis III candidate | see `sites.json` | | Yes |
| Shackleton–de Gerlache ridge | Artemis / science | see `sites.json` | | Yes |
| Nobile Rim 1 | Artemis III candidate | see `sites.json` | | Yes |
| Nobile Rim 2 | Artemis III candidate | see `sites.json` | | Yes |
| Chandrayaan-3 (Vikram) | ISRO, 2023 | see `sites.json` | | No (ephemerides only) |
| Chang'e 4 | CNSA, 2019 | see `sites.json` | | No (far side: Earth is **never** visible) |
| Apollo 11 | NASA, 1969 | see `sites.json` | | No (equatorial contrast) |
| Apollo 17 | NASA, 1972 | see `sites.json` | | No |

**Real terrain (RAW16 513×513, 20 km extent) in `web/public/static/terrain/`** for the 6 south pole sites. The other 4 have only ephemerides plus a geometric spherical horizon (`horizon_source: "spherical"`).

---

## 7. Data contract (v0.1 — implemented in `core/`, `worker/` and `web/`)

*Changes v0 → v0.1: the WebSocket moves from API Gateway to the Worker's `RoomHub` Durable Object — only the URL changes (`wss://<worker-host>/ws?room=<room>`); messages and REST endpoints are unchanged. Heightmaps are served at `513×513` (not 1025; the source DEM is 80 m/px). New and optional: `{ "type": "ping" }` → the server responds `{ "type": "pong" }` (heartbeat to keep the connection alive).*

Format shared by `pipeline/`, `core/` (`@touchdown/core`), `worker/` and `web/`. **Do not change it without notifying the team.** REST endpoints are served by the Worker on the same domain as the web app. Times are UTC ISO 8601 and angles are in degrees. Azimuth is measured from north (0°) clockwise toward east (90°).

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
*`source: "spherical"` for sites without a local DEM (geometric horizon, no terrain).*

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
*`status`: `"viable"`, `"marginal"` or `"not_viable"` — exact formula in `core/src/scenario.ts` (`computeScenario`):*

```
score = 100 × (0.30·energy + 0.25·comms + 0.30·ops + 0.15·continuity)
```
- *`energy`: mean fraction of the **solar disk** (radius 0.2666°) above the LOLA horizon in the direction of the Sun. A grazing Sun counts less than a clear one.*
- *`comms`: fraction of the mission with Earth above the horizon (= `fractions.earth`).*
- *`ops`: fraction with the Sun **and** Earth visible at the same time (= `fractions.both`).*
- *`continuity`: `1 − longest night / mission duration`.*
- *Status: `not_viable` if score < 40, energy < 0.1 or Earth < 0.1; `viable` if score ≥ 70 and ops ≥ 0.5; otherwise `marginal`.*
- *Ranking (`compareScenarios`): status first (a not-viable site never outranks a marginal one), then score, then ops, then energy.*
- *New, additive field in the response: `metrics: { energy, comms, ops, continuity, longest_dark_h }`.*

### Terrain for VR/3D: `GET /api/sites/{id}/terrain`
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
*(513 = 2ⁿ+1. Read `size_px`/`site_px` from the JSON; do not hard-code them — see the actual loader in `web/lib/mission/sites.ts`.)*

### WebSocket (`RoomHub` Durable Object) — shared state
**Connection:** `wss://<worker-host>/ws?room=<room>`
- The room is passed as a query string and routed to the corresponding Durable Object (`idFromName(room)`).
- The URL is configured through an environment variable (`NEXT_PUBLIC_WS_URL`), falling back to the Worker on the laptop (`ws://<laptop-ip>:8787/ws?room=<room>`, via `pnpm dev:lan`). Since VR and web share the same Next.js app, both read the same variable.

JSON messages with a `type` field:
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
- **`hello`:** every client sends `{ "type": "hello" }` when the connection opens, and the Durable Object replies **only to that client** with the room's current `state` (markers included). This covers late joiners.
- **`markers` inside `state`:** list of the room's current markers.
- Marker coordinates: local meters relative to the site (east = +x, north = +y).
- **Synchronize only this:** site, time, playback and markers. Nothing else.
- The server broadcasts every change to the other clients in the room and persists state in the Durable Object's SQLite storage.
- **Clients must reconnect on their own and resend `hello`.** Send `ping` every ~30 s so the network does not close idle connections.
- The local fallback (`pnpm dev:lan`) implements exactly the same protocol.

---

## 8. Team breakdown (6 people)

| Role | People | Responsibilities |
|---|---|---|
| Data | 1 | LOLA pipeline → horizon and heightmap; precomputed ephemerides |
| Web | 1 | Mission Control in Next.js: catalog, comparator, polar diagram, timeline, countdowns |
| API + real time + integration | 1 | Cloudflare Worker (`/api/*`, Static Assets, Durable Object WebSocket); local fallback with `pnpm dev:lan`; CI/CD deployment; web report; owner of the data contract |
| VR (WebXR, inside `web/`) | 2 | One person: terrain, Sun and Earth, lighting (`lib/engine`, `lib/phases/surface-world.ts`). The other: interaction, floating panel, markers and WebSocket client |
| Pitch / video / design | 1 | Narrative, visual identity, video, project page; record from day 1 |
| Integrator / floater | (shared) | Data contract, Quest testing, firefighting |

---

## 9. Work plan

### Before the 14th (preparation and throwaway prototypes)
- [ ] Review the local event rules on prior work
- [ ] Data: download LOLA DEMs for 3 sites and test opening them with `rasterio`
- [ ] Data: horizon mask prototype for 1 site; validate against Moon Trek/Quickmap
- [ ] Data: test Horizons or SPICE and get Sun and Earth elevation for 1 site
- [ ] Data: list of official site coordinates
- [ ] VR: Quest developer mode, WebXR "hello world" prototype running on the headset (pending: Bluetooth pairing with the Meta Horizon app)
- [ ] VR: import a test LOLA heightmap and measure performance on the headset
- [x] VR: stack decision → WebXR + three.js inside `web/`, Unity discarded (Nov 14)
- [x] Web: decide the stack → Next.js + serverless (Nov 4)
- [ ] Web: prototype the polar diagram
- [x] Infra: front-end hosting → static Next.js on S3 + CloudFront; `/api/*` on a Lambda behind the same CloudFront (Nov 4, **obsolete, see below**)
- [x] Infra: final decision → **Cloudflare Workers + Durable Objects** instead of AWS (Nov 14); no AWS resources were ever created, nothing to tear down
- [x] Infra/Data: real pipeline (`pipeline/`), `core/` (`@touchdown/core`) and `worker/` (REST API + `RoomHub` Durable Object) integrated into the repo, with tests passing (Nov 14)
- [x] Infra: GitHub Actions (CI on PRs + Cloudflare deploy on `main`) configured and verified (Nov 14)
- [x] Infra: deployed to Cloudflare — `https://touchdown.villabruno2.workers.dev` (Nov 14). Tokens still live in the personal account of whoever built `worker/`; they should be moved to a team account if the project continues after the hackathon.
- [ ] Web: wireframes for comparator, timeline, countdowns and report
- [ ] Pitch: final name, logo, palette, demo script, review past winners
- [ ] Everyone: **private** repo, environments installed, this data contract agreed upon
- [ ] Nov 13: review the challenge Resources tab and adjust

### During the hackathon (Nov 14–15)
- **Hours 0–1:** confirm the data contract and roles; empty build running on the Quest.
- **Hours 1–12:** pipeline with real data for 3 sites; web with contract test data; VR with real terrain.
- **Hours 12–24:** integration (web + API + VR + WebSocket). Develop against the local WebSocket server and deploy to Cloudflare for integration.
- **Hours 24–36:** comparator, delay scenario, report and polish.
- **Hours 36–44:** video, project page, demo rehearsal.
- **Hours 44–48:** buffer and submission.

### Scope
- **Minimum to present:** 3 sites with real terrain, ephemerides, polar diagram, timeline, countdowns, comparison of 2 scenarios, VR with terrain and Sun/Earth, site and time synchronization.
- **If time allows:** full catalog with custom coordinates, synchronized markers, exportable report, educational mode, voice assistant in VR, Sun and Earth as disks.

---

## 10. Conventions for Claude Code

- Respond and write comments in **Spanish**; code (variable and function names) in **English**.
- Respect the **data contract** in section 7. If a change requires modifying it, propose it first and explain the impact on web and VR.
- **Precompute** everything heavy. No live calls to Horizons during the demo; cache to JSON.
- **Edge serverless:** the front end is a Next.js static export; do not use SSR, server actions, middleware or dynamic route handlers. Dynamic logic goes in the Cloudflare Worker (`/api/*`) or is resolved on the client by reading the static JSON directly (as `web/lib/mission/sites.ts` already does). Shared state lives in the `RoomHub` Durable Object (or in the same Worker via `pnpm dev:lan` for the local fallback). API and WebSocket URLs always come from environment variables.
- Do not create, delete or rename Cloudflare resources (Workers, Durable Object classes, domains, tokens) without confirming with the team.
- Clearly label any approximated or simulated data (for example, the field `"source": "approx"` or `"spherical"`). Never present invented data as real NASA data.
- Validate calculations against an independent source (Moon Trek, Quickmap or Horizons) before relying on them.
- Priority: **working web app > correct data > VR > extras.** The web app must work on its own in the video.
- VR lives inside `web/` (Next.js + three.js + WebXR), not in a separate Unity project — see `web/README.md` to run it and test it on the Quest.
- Before November 14, everything is a prototype. Confirm with the team before treating code as final.

---

## 11. References
- Challenge: https://www.spaceappschallenge.org/2026/challenges/ (Lunar Landing Site Navigator)
- CLPS (NASA): https://www.nasa.gov/reference/commercial-lunar-payload-services/
- Artemis III candidate regions: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- JPL Horizons: https://ssd.jpl.nasa.gov/horizons/
- NAIF SPICE: https://naif.jpl.nasa.gov/naif/
- PDS Geosciences – LOLA: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- Moon Trek: https://trek.nasa.gov/moon/
- Quickmap: https://quickmap.lroc.asu.edu/
- Unity MCP (official): https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.17/manual/integration/unity-mcp-get-started.html
- Unity-MCP (IvanMurzak): https://github.com/IvanMurzak/Unity-MCP
- Repositories from other teams working on this challenge (competition):
  - https://github.com/shrestha-droid/clps-lunar-mission-browser
  - https://github.com/0Aaheed0/SeleneSight
  - https://github.com/rafaa-sf/lunar-horizon-clps-browser
  - https://github.com/partofcosmos-site/lunarsite-compass
- Conceptual simulation (private, share from its Share menu): https://claude.ai/artifact/W4W8wGqhXURQnvehta4UMU
