# Lunar South Pole · Site Planner (Next.js + three.js + WebXR)

Experiencia en 5 fases, en escritorio y en **Meta Quest 3S** (WebXR en el navegador del Quest). Parte del monorepo pnpm del proyecto (`core/`, `worker/`, `web/`, `pipeline/`) — ver `../CLAUDE.md` para el contexto completo y el contrato de datos.

1. **Despegue**: el cohete sale de la plataforma hacia la Luna. El avance está ligado a la carga real de datos (catálogo, efemérides, horizonte y terreno de cada sitio).
2. **Órbita y ranking**: una vuelta de escaneo alrededor de la Luna. Los sitios del polo sur se evalúan con datos reales de NASA (LOLA + JPL Horizons vía `@touchdown/core`) y se ordenan por score real. Toca un pin o una fila para ver sus datos, usa el **botón de retraso** (+7/+14/+21/+30 d) para ver cómo cambia el ranking, y luego **Preconfirmar punto**.
3. **Vista del sitio**: estás de pie en el sitio. Para los 6 sitios con terreno real (Malapert A, Mons Mouton, Malapert Massif, Shackleton–de Gerlache, Nobile Rim 1/2) caminas sobre el heightmap RAW16 real de LOLA; el resto usa terreno procedural. Ves la zona de alunizaje, el Sol y la Tierra en su posición real, el horizonte real y una gráfica de 14 días.
4. **Alunizaje**: descenso motorizado desde la cabina, con HUD, polvo y luz de contacto.
5. **Transmisión**: la luz del Sol llega a los paneles y un haz lleva los datos a la Tierra (o por un satélite de relevo si la Tierra está bajo el horizonte real en ese momento).

## Correr en desarrollo

Desde la raíz del repo (monorepo pnpm):

```bash
pnpm install
pnpm dev:web            # solo la web, next dev en http://localhost:3000 (sin sincronización)
pnpm dev                # web + Worker (API + WebSocket) juntos en http://localhost:8787
```

`pnpm dev:web` es más rápido para iterar en UI/render, pero sin el Worker no hay `/ws` — la sincronización entre pestañas/Quest simplemente no conecta (la app sigue funcionando normal, solo sin sync, por diseño). Usa `pnpm dev` cuando quieras probar la sincronización de verdad.

### En el Quest 3S
WebXR exige HTTPS (o `localhost`). Con `pnpm dev:web`:

```bash
cd web && npm run dev:https      # https://<IP-de-tu-PC>:3000
```

Abre esa URL en el navegador del Quest (acepta el certificado de desarrollo) y pulsa **Entrar en VR**. Para probar contra el Worker real desde el Quest, despliega primero (ver abajo) y abre la URL de Cloudflare — ahí ya es HTTPS real, sin certificados ni trucos.

Para probar sin visor puedes usar la extensión **Immersive Web Emulator** / **WebXR API Emulator** de Chrome.

### Atajos de desarrollo
- `?phase=orbit|pov|landing|transmit` salta directo a una fase (usa un sitio sintético de relleno, no datos reales — ver `devFallbackMission()` en `lib/mission/sites.ts`).
- `?speed=4` acelera el reloj de la simulación.
- `?room=<nombre>` — sala de sincronización (ver abajo). Por default: `touchdown`.

## Sincronización en tiempo real (Mission Control ↔ VR)

Dos pestañas (o una pestaña + el Quest) con el **mismo `?room=`** quedan sincronizadas: quien cambie el sitio seleccionado o use el botón de retraso en la fase de Órbita, lo ve también la otra persona, en vivo.

- Cliente: `lib/sync/room-client.ts` (`RoomClient`, instanciado una vez en `LunarApp`, vive mientras dure la app, sobrevive a cambios de fase).
- Servidor: Durable Object `RoomHub` en `worker/` (ya con tests) — mismo dominio, mismo protocolo documentado en `../CLAUDE.md` sección 7.
- Quién escucha/transmite: hoy solo `lib/phases/orbit.ts` (`set_site`, `set_time`). El resto de las fases no participan todavía — si cambias de sitio en Órbita mientras alguien más está parado en la fase de Vista del Sitio, esa persona no se mueve hasta que vuelva a Órbita. Ampliar esto (o los mensajes `marker_add`/`marker_remove`, que el protocolo ya soporta pero esta app no usa) es trabajo pendiente.
- Insignia de conexión (🟢 sincronizado / 🟠 conectando / ⚪ sin conexión) visible en la esquina superior del panel de la lista de sitios.
- **Sin servidor, la web sigue funcionando normal** (estado local, sin sincronizar) — nunca es un requisito, solo un extra.
- Verificado con dos clientes WebSocket reales contra `pnpm dev` (no solo tipos): A cambia sitio/fecha, B los recibe en vivo, y un B que se conecta tarde recibe el `state` ya actualizado.

## Despliegue (producción)

Arquitectura del equipo (ver `CLAUDE.md` sección 5, raíz del repo): **Cloudflare Workers + Durable Objects** — un solo Worker sirve la web estática (`Static Assets`), la API (`/api/*`) y el WebSocket (`/ws`) en el mismo dominio. No AWS, no Vercel.

```bash
pnpm --filter @touchdown/worker deploy          # despliega Worker + Static Assets + Durable Object
pnpm --filter @touchdown/worker deploy:dry-run  # para probar sin desplegar de verdad
```

El Quest abre la URL real del Worker (HTTPS de verdad) directo en su navegador, por WiFi normal — sin certificados, túneles ni modo desarrollador/ADB.

- Nada de SSR, server actions, middleware ni route handlers dinámicos — esta app es 100% cliente (`next.config.ts` tiene `output: 'export'`; ver `components/ExperienceClient.tsx`, carga con `dynamic(..., { ssr: false })`).
- Los datos (catálogo, efemérides, horizonte, terreno) se leen directo de los JSON/RAW estáticos en `public/data/` y `public/static/terrain/` — no necesitan el Worker para cargar, solo la sincronización por WebSocket lo necesita.

## Texturas de la Luna
Copia tus 3 imágenes en `public/textures/moon/`:

| Archivo | Proyección |
|---|---|
| `general.jpg` | Equirectangular global (2:1), longitud −180° en el borde izquierdo |
| `south-pole.jpg` | Estereográfica polar centrada en el polo sur |
| `north-pole.jpg` | Estereográfica polar centrada en el polo norte |

Mientras no existan, se usa una Luna procedural.
Ajusta `extentDeg`, `rotationDeg` y `flipX` en `lib/mission/config.ts` según hasta qué latitud llegan tus mosaicos polares y su orientación.

## Datos reales

Ya no es un placeholder — `lib/mission/sites.ts → loadMissionData()` lee los datos reales generados por `pipeline/` desde `public/data/` (catálogo, efemérides JPL Horizons, horizonte LOLA, heightmaps RAW16) y `lib/mission/scoring.ts` calcula el ranking con `@touchdown/core` (`computeScenario`, `positionAt`, `horizonAt` — la misma lógica y fórmula que usa `/api/scenario` del Worker). El terreno real (`lib/mission/terrain.ts`) solo cubre los 6 sitios con `has_terrain: true`; el resto sigue con terreno/horizonte esférico de respaldo, marcado como tal en el propio dato (`horizon_source: "spherical"`).

## Estructura
```
app/                      Next.js App Router
components/               Wrapper cliente (ssr:false) + botón VR + barra de fases
lib/engine/               app (rig XR, fades, fases, cliente WS), input, paneles canvas, partículas, Luna tri-textura
lib/phases/               launch · orbit (ranking + retraso + sync) · pov · landing · transmit · surface-world (terreno compartido)
lib/mission/              sitios reales, scoring (@touchdown/core), terreno RAW16, dirección global Sol/Tierra, config de texturas
lib/sync/                 cliente WebSocket (room-client.ts) para la sincronización Mission Control ↔ VR
```
