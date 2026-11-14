# Lunar South Pole · Site Planner (Next.js + three.js + WebXR)

Experiencia en 5 fases, en escritorio y en **Meta Quest 3S** (WebXR en el navegador del Quest):

1. **Despegue**: el cohete sale de la plataforma hacia la Luna. El avance está ligado a la carga real de datos.
2. **Órbita y ranking**: una vuelta de escaneo alrededor de la Luna. Los sitios del polo sur se evalúan uno por uno y se ordenan por % de viabilidad. Toca un pin o una fila para ver sus datos y luego **Preconfirmar punto**.
3. **Vista del sitio**: estás de pie en el sitio. Ves la zona de alunizaje (anillo verde), el Sol y la Tierra en su elevación real, el horizonte local y una gráfica de 14 días.
4. **Alunizaje**: descenso motorizado desde la cabina, con HUD, polvo y luz de contacto.
5. **Transmisión**: la luz del Sol llega a los paneles y un haz lleva los datos a la Tierra (o por un satélite de relevo si la Tierra está bajo el horizonte). Al final se confirma el alunizaje exitoso.

## Correr

```bash
npm install
npm run dev            # http://localhost:3000
```

### En el Quest 3S
WebXR exige HTTPS:

```bash
npm run dev:https      # https://<IP-de-tu-PC>:3000
```

Abre esa URL en el navegador del Quest (acepta el certificado de desarrollo) y pulsa **Entrar en VR**.
Puedes seleccionar con el gatillo del control o con pellizco si usas hand tracking.
Para producción basta con desplegar (por ejemplo, en Vercel), que ya sirve por HTTPS.

Para probar sin visor puedes usar la extensión **Immersive Web Emulator** de Meta en Chrome.

### Atajos de desarrollo
- `?phase=orbit|pov|landing|transmit` salta directo a una fase.
- `?speed=4` acelera el reloj de la simulación.

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
- `lib/mission/sites.ts → loadMissionData()`: sustitúyela por tus fetch (JPL Horizons, LOLA, tu API). Reporta el progreso con `onProgress(0..1, mensaje)`.
- `lib/mission/scoring.ts`: el modelo de Sol, Tierra y horizonte es **simplificado** (libración y estaciones como senoides, horizonte por sitio sintético). Cambia `sunDirAt`, `earthDirAt` y `horizonAt` por vectores de Horizons y máscaras de horizonte LOLA. El ranking y la UI no cambian.
- Las coordenadas y los valores de terreno de los sitios son **aproximados** y solo sirven de demo.

## Estructura
```
app/                      Next.js App Router
components/               Wrapper cliente (ssr:false) + botón VR + barra de fases
lib/engine/               app (rig XR, fades, fases), input (mouse + controles/manos), paneles canvas, partículas, Luna tri-textura
lib/phases/               launch · orbit · pov · landing · transmit · surface-world (terreno compartido)
lib/mission/              sitios, scoring, config de texturas
```
