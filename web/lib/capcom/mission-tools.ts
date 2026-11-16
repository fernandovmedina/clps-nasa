import type { LunarApp } from '../engine/app';
import { PHASE_LABELS, PHASE_ORDER, STATUS_LABELS, type HudRankRow, type PhaseHud } from '../engine/hud';
import type { SiteMetrics } from '../mission/scoring';
import { DEMO_CRASH_NOTE, type RankRowExtras } from '../mission/sites';
import type { CapcomTool } from './types';

/** Ventana de evaluación de `evaluateSites` (lib/mission/scoring.ts): 14 días desde el aterrizaje. */
export const MISSION_WINDOW_DAYS = 14;
const WINDOW_HOURS = MISSION_WINDOW_DAYS * 24;
const SUN_HALF_DISK = 0.27;

/** Lo único que las herramientas leen de la aplicación: ninguna escribe. */
export type MissionSource = Pick<LunarApp, 'phase' | 'selected' | 'ranking' | 'data' | 'run' | 'awaitingStart'>;

const tidy = (text: string) => text.replace(/ /g, ' ');
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function missing(reason: string, extra: Record<string, unknown> = {}) {
  return { disponible: false, motivo: reason, ...extra };
}

function missionState(app: MissionSource): 'detenida' | 'en_pausa' | 'esperando_despegue' | 'en_curso' {
  if (app.run.mode === 'stopped') return 'detenida';
  if (app.run.mode === 'paused') return 'en_pausa';
  return app.awaitingStart ? 'esperando_despegue' : 'en_curso';
}

function describeSide(side: PhaseHud['side']): Record<string, unknown> {
  if (side.kind === 'readouts') {
    return {
      lecturas: side.items.map((i) => ({ etiqueta: i.label, valor: tidy(i.value), ...(i.meter ? { medidor: i.meter.label } : {}) })),
      ...(side.note ? { nota_lecturas: side.note } : {}),
    };
  }
  if (side.kind === 'sky') {
    return {
      cielo: side.blocks.map((b) => ({
        astro: b.kind === 'sun' ? 'Sol' : 'Tierra',
        etiqueta: b.label,
        valor: tidy(b.value),
        detalle: tidy(b.detail),
        visible_en_la_ventana: tidy(b.shareLabel),
      })),
      lecturas: (side.extras ?? []).map((e) => ({ etiqueta: e.label, valor: tidy(e.value) })),
    };
  }
  return { sitios_evaluados_en_pantalla: side.rows.filter((r) => !(r as RankRowExtras).demo).length };
}

function estadoDelViaje(app: MissionSource) {
  const phase = app.phase;
  if (!phase) return missing('La experiencia todavía no ha cargado ninguna fase.');
  const state = missionState(app);
  const base = {
    fase: PHASE_LABELS[phase.name],
    paso: PHASE_ORDER.indexOf(phase.name) + 1,
    de: PHASE_ORDER.length,
    estado_de_la_mision: state,
  };
  if (state === 'detenida') return { ...base, nota: 'La misión está detenida: no hay lecturas en vivo hasta que se reinicie desde el despegue.' };
  const hud = phase.controlHud?.();
  if (!hud) return { ...base, nota: 'Esta fase no muestra lecturas en pantalla.' };
  return {
    ...base,
    ...(app.selected?.site.crash
      ? {
          es_caso_de_demostracion: true,
          nota_sitio: `${DEMO_CRASH_NOTE}. Las lecturas en pantalla (cifras, Sol, Tierra, iluminación) están prestadas de Malapert Massif y no son del sitio.`,
        }
      : {}),
    ...(state === 'esperando_despegue' ? { nota: 'El despegue no ha comenzado: la persona aún no pulsa «Comenzar despegue», no hay cuenta regresiva.' } : {}),
    cifra_principal: {
      valor: tidy(hud.figure.value),
      descripcion: hud.figure.caption,
      ...(hud.figure.badge ? { insignia: hud.figure.badge.label } : {}),
    },
    ...(hud.detail ? { detalle: tidy(hud.detail) } : {}),
    ...(hud.progress ? { avance: { etiqueta: hud.progress.label, porcentaje: Math.round(hud.progress.value * 100) } } : {}),
    ...(hud.facts?.length ? { datos: hud.facts.map((f) => ({ etiqueta: f.label, valor: tidy(f.value) })) } : {}),
    ...describeSide(hud.side),
  };
}

const isReal = (m: SiteMetrics) => !m.site.crash;

/** NO CAER lends its terrain and ephemeris from Malapert Massif: none of those figures is its own, so none is given. */
function demoCase(m: SiteMetrics, app: MissionSource) {
  return {
    sitio: m.site.name,
    id: m.site.id,
    es_caso_de_demostracion: true,
    es_sitio_real: false,
    resumen: `${m.site.name} no es un sitio real: es un caso de demostración de falla simulada del motor, el descenso termina en impacto. No tiene puntaje, estado ni lecturas propias.`,
    nota: DEMO_CRASH_NOTE,
    es_el_sitio_elegido: app.selected?.site.id === m.site.id,
  };
}

function findSite(ranking: SiteMetrics[], query: string): SiteMetrics[] {
  const q = normalize(query);
  if (!q) return [];
  const byId = ranking.filter((m) => m.site.id === q.replace(/ /g, '-'));
  if (byId.length) return byId;
  const names = ranking.map((m) => ({ m, name: normalize(m.site.name) }));
  const exact = names.filter((n) => n.name === q);
  if (exact.length) return exact.map((n) => n.m);
  const contains = names.filter((n) => n.name.includes(q) || q.includes(n.name));
  if (contains.length) return contains.map((n) => n.m);
  const tokens = q.split(' ');
  return names.filter((n) => tokens.every((t) => n.name.split(' ').includes(t) || n.name.includes(t))).map((n) => n.m);
}

function untilHours(hours: number, aboveNow: boolean, what: string) {
  if (!aboveNow) return `${what} ya estaba bajo el horizonte al aterrizar`;
  if (hours >= WINDOW_HOURS - 0.5) return `no se oculta en los ${MISSION_WINDOW_DAYS} días evaluados`;
  return `${round(hours)} h después del aterrizaje`;
}

function siteReading(m: SiteMetrics) {
  const sunUp = m.sun.aboveHorizon > -SUN_HALF_DISK;
  const earthUp = m.earth.aboveHorizon > 0;
  return {
    resumen: `${m.site.name}: puntaje ${Math.round(m.score)} de 100, estado ${STATUS_LABELS[m.status]}. Sol visible el ${Math.round(m.illumPct)} % de la misión y Tierra visible el ${Math.round(m.earthPct)} %.`,
    sitio: m.site.name,
    id: m.site.id,
    puesto_en_el_ranking: m.rank,
    puntaje_de_100: Math.round(m.score),
    estado: STATUS_LABELS[m.status],
    sol: {
      elevacion_grados: round(m.sun.elevation, 2),
      azimut_grados: Math.round(m.sun.azimuth),
      sobre_el_horizonte_local_al_aterrizar: sunUp,
      visible_porcentaje_de_la_mision: Math.round(m.illumPct),
      horas_de_sol_en_la_mision: Math.round((m.illumPct / 100) * WINDOW_HOURS),
      proximo_atardecer: untilHours(m.hoursToSunset, sunUp, 'El Sol'),
      noche_mas_larga_horas: round(m.longestDarkH),
      potencia_solar_porcentaje: m.powerPct,
    },
    tierra: {
      elevacion_grados: round(m.earth.elevation, 2),
      azimut_grados: Math.round(m.earth.azimuth),
      visible_al_aterrizar: earthUp,
      visible_porcentaje_de_la_mision: Math.round(m.earthPct),
      horas_de_tierra_en_la_mision: Math.round((m.earthPct / 100) * WINDOW_HOURS),
      proxima_puesta_de_la_tierra: untilHours(m.hoursToEarthset, earthUp, 'La Tierra'),
    },
    horizonte: m.site.horizonSource === 'lola' ? 'real, calculado con el relieve de LOLA' : 'esférico, sin relieve (aproximado)',
    temperatura_estimada_c: Math.round(m.tempC),
  };
}

function analisisDelSitio(app: MissionSource, input: unknown) {
  const ranking = app.ranking;
  if (!ranking.length) return missing('Todavía no se han evaluado los sitios: el ranking aparece en la fase de órbita.');
  const realSites = ranking.filter(isReal);
  const query = typeof (input as { sitio?: unknown } | null)?.sitio === 'string' ? ((input as { sitio: string }).sitio).trim() : '';
  let chosen: SiteMetrics | null = null;
  if (query) {
    const found = findSite(ranking, query);
    const real = found.filter(isReal);
    const candidates = real.length ? real : found;
    if (candidates.length > 1) return missing(`«${query}» coincide con varios sitios.`, { sitios_posibles: candidates.map((m) => m.site.name) });
    chosen = candidates[0] ?? null;
    if (!chosen) return missing(`No hay un sitio llamado «${query}» en el catálogo.`, { sitios_del_catalogo: realSites.map((m) => m.site.name) });
  } else if (app.selected) {
    chosen = ranking.find((m) => m.site.id === app.selected?.site.id) ?? app.selected;
  } else {
    return missing('Todavía no hay un sitio elegido; indica uno por su nombre.', { sitios_del_catalogo: realSites.map((m) => m.site.name) });
  }
  if (!isReal(chosen)) return demoCase(chosen, app);
  return {
    ...siteReading(chosen),
    es_el_sitio_elegido: app.selected?.site.id === chosen.site.id,
    ventana_de_mision_dias: MISSION_WINDOW_DAYS,
    fecha_de_aterrizaje: app.data?.landingDate.toISOString() ?? null,
  };
}

function weakestLink(m: SiteMetrics): string {
  return m.illumPct <= m.earthPct ? 'lo que más lo limita es la energía solar' : 'lo que más lo limita es la comunicación directa con la Tierra';
}

function compararSitios(app: MissionSource, input: unknown) {
  const ranking = app.ranking;
  if (!ranking.length) return missing('Todavía no se han evaluado los sitios: el ranking aparece en la fase de órbita.');
  const asked = Number((input as { cantidad?: unknown } | null)?.cantidad);
  const count = Number.isFinite(asked) ? Math.min(5, Math.max(3, Math.round(asked))) : 3;
  const real = ranking.filter(isReal);
  const best = [...real].sort((a, b) => a.rank - b.rank).slice(0, count);
  return {
    mejores_sitios: best.map((m) => ({
      puesto: m.rank,
      sitio: m.site.name,
      puntaje_de_100: Math.round(m.score),
      estado: STATUS_LABELS[m.status],
      por_que: `Sol visible el ${Math.round(m.illumPct)} % y Tierra visible el ${Math.round(m.earthPct)} % de los ${MISSION_WINDOW_DAYS} días; ${weakestLink(m)}. Noche más larga: ${round(m.longestDarkH)} h.`,
      es_el_sitio_elegido: app.selected?.site.id === m.site.id,
    })),
    sitios_evaluados: real.length,
    fecha_de_aterrizaje: app.data?.landingDate.toISOString() ?? null,
  };
}

function appliedDelay(hud: PhaseHud | undefined): number | null {
  const options = hud?.toggles?.options;
  if (!options) return null;
  const pressed = options.find((o) => o.pressed);
  if (!pressed) return null;
  if (pressed.id === 'delay-reset') return 0;
  const days = Number(/^delay-(\d+)$/.exec(pressed.id)?.[1]);
  return Number.isFinite(days) ? days : null;
}

function datosDeMision(app: MissionSource) {
  const data = app.data;
  if (!data) return missing('Los datos de la misión todavía se están cargando.');
  const phase = app.phase;
  const hud = phase?.name === 'orbit' ? phase.controlHud?.() : undefined;
  const delay = appliedDelay(hud);
  const chosen = app.selected ? app.ranking.find((m) => m.site.id === app.selected?.site.id) ?? app.selected : null;
  const row: HudRankRow | undefined = hud?.side.kind === 'ranking' ? hud.side.rows.find((r) => r.selected) : undefined;
  const now = chosen && isReal(chosen) ? Math.round(chosen.score) : null;
  const before = now !== null && delay !== null ? (delay === 0 ? now : row?.delta !== undefined ? now - row.delta : null) : null;
  return {
    sitio_elegido: chosen?.site.name ?? null,
    fecha_de_aterrizaje: data.landingDate.toISOString(),
    duracion_de_la_mision_dias: MISSION_WINDOW_DAYS,
    retraso_aplicado_dias: delay,
    ...(delay === null ? { nota_retraso: 'El retraso aplicado solo se conoce en la fase de órbita; la fecha de aterrizaje de arriba ya lo incluye.' } : {}),
    puntaje_actual: now,
    puntaje_con_la_fecha_original: before,
    cambio_de_puntaje: now !== null && before !== null ? now - before : null,
    ...(!chosen ? { nota_sitio: 'Todavía no hay un sitio elegido.' } : {}),
    ...(chosen?.site.crash ? { nota_sitio: `${chosen.site.name} es un caso de demostración (falla simulada del motor), no un sitio real: no tiene puntaje.` } : {}),
  };
}

const NO_PARAMS = { type: 'object', properties: {}, required: [] };

export function createMissionTools(app: MissionSource): CapcomTool[] {
  return [
    {
      name: 'estado_del_viaje',
      description:
        'Estado actual del viaje: fase y paso de 5, si la misión está en curso, en pausa, detenida o esperando el despegue, la cifra principal de la pantalla y las lecturas de esa fase (altitud, velocidad, combustible, distancia a la Luna, tiempo al contacto, etc.). Úsala para cualquier pregunta sobre cómo va el viaje.',
      inputSchema: NO_PARAMS,
      run: () => estadoDelViaje(app),
    },
    {
      name: 'analisis_del_sitio',
      description:
        'Análisis de un sitio de aterrizaje: puntaje y estado, elevación y azimut del Sol, visibilidad de la Tierra, horas de Sol y de Tierra en la misión, próximo atardecer y próxima puesta de la Tierra, y si el horizonte es real de LOLA o esférico. Sin parámetro analiza el sitio elegido; con «sitio» (nombre o id) analiza ese.',
      inputSchema: { type: 'object', properties: { sitio: { type: 'string', description: 'Nombre o id del sitio, por ejemplo «Malapert A». Opcional.' } }, required: [] },
      run: (input) => analisisDelSitio(app, input),
    },
    {
      name: 'comparar_sitios',
      description:
        'Los mejores sitios del ranking (3 a 5) con su puntaje, su estado y el porqué. Úsala para preguntas como «¿hay un sitio mejor?» o «¿cuál conviene más?».',
      inputSchema: { type: 'object', properties: { cantidad: { type: 'number', description: 'Cuántos sitios, de 3 a 5. Opcional, por defecto 3.' } }, required: [] },
      run: (input) => compararSitios(app, input),
    },
    {
      name: 'datos_de_mision',
      description:
        'Datos de la misión: sitio elegido, fecha de aterrizaje, duración, retraso aplicado y cómo cambió el puntaje respecto a la fecha original, si ese dato existe.',
      inputSchema: NO_PARAMS,
      run: () => datosDeMision(app),
    },
  ];
}
