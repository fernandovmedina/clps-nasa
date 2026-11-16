import { describe, expect, it } from 'vitest';
import type { PhaseHud, RunMode } from '../engine/hud';
import type { PhaseName } from '../engine/app';
import type { SiteMetrics } from '../mission/scoring';
import { createMissionTools, type MissionSource } from './mission-tools';

const NBSP = String.fromCharCode(160);

function metrics(id: string, name: string, rank: number, score: number, over: Partial<SiteMetrics> = {}): SiteMetrics {
  return {
    site: { id, name, horizonSource: 'lola', hasTerrain: true } as SiteMetrics['site'],
    score, rank, status: score >= 75 ? 'viable' : score >= 50 ? 'marginal' : 'not_viable',
    sun: { elevation: 1.834, azimuth: 123.4, aboveHorizon: 0.9, local: undefined as never },
    earth: { elevation: 4.5, azimuth: 3.2, aboveHorizon: 2.1, local: undefined as never },
    illumPct: 62.4, earthPct: 40.2, hoursToSunset: 120.4, hoursToEarthset: 336,
    longestDarkH: 48.2, maxSunElev: 6, tempC: -20, powerPct: 71,
    breakdown: { energy: 0, comms: 0, ops: 0, continuity: 0 },
    ...over,
  };
}

const RANKING = [
  metrics('malapert-massif', 'Malapert Massif', 1, 82),
  metrics('mons-mouton', 'Mons Mouton (IM-2 Athena)', 2, 70),
  metrics('malapert-a', 'Malapert A (IM-1 Odysseus)', 3, 61.4),
  metrics('nobile-rim-1', 'Nobile Rim 1', 4, 40, { sun: { elevation: -2, azimuth: 10, aboveHorizon: -3, local: undefined as never } }),
];

function source(over: Partial<{ phase: PhaseName; mode: RunMode; hud: PhaseHud | undefined; waiting: boolean; selected: SiteMetrics | null; ranking: SiteMetrics[] }> = {}): MissionSource {
  const phase = over.phase ?? 'orbit';
  return {
    phase: { name: phase, controlHud: () => over.hud as PhaseHud } as unknown as MissionSource['phase'],
    selected: over.selected === undefined ? RANKING[2]! : over.selected,
    ranking: over.ranking ?? RANKING,
    data: { landingDate: new Date('2027-01-10T00:00:00Z') } as MissionSource['data'],
    run: { mode: over.mode ?? 'running' } as MissionSource['run'],
    awaitingStart: over.waiting ?? false,
  };
}

const NO_CAER = metrics('no-caer', 'NO CAER', 2, 0, {
  site: { id: 'no-caer', name: 'NO CAER', horizonSource: 'lola', hasTerrain: true, crash: true } as SiteMetrics['site'],
  status: 'not_viable',
});
// NO CAER va en medio a propósito: si una herramienta lo deja pasar, se nota en el puesto y en el conteo.
const WITH_DEMO = [RANKING[0]!, NO_CAER, RANKING[1]!, RANKING[2]!, RANKING[3]!];

const tool = (src: MissionSource, name: string) => createMissionTools(src).find((t) => t.name === name)!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool outputs are free-form JSON
const call = async (src: MissionSource, name: string, input: unknown = {}) => (await tool(src, name).run(input)) as Record<string, any>;

const launchHud: PhaseHud = {
  figure: { value: 'T − 3', caption: 'segundos para la ignición' },
  detail: 'Cuenta regresiva',
  progress: { value: 0.64, label: 'Carga de datos', text: '64 %' },
  side: {
    kind: 'readouts',
    items: [
      { label: 'Altitud', value: '169.3 km' },
      { label: 'Distancia a la Luna', value: `384${NBSP}120 km` },
      { label: 'Combustible', value: '88 %', meter: { value: 0.88, label: 'Combustible al 88 %' } },
    ],
  },
};

describe('mission tools', () => {
  it('exposes the four tools and none of them takes required parameters', () => {
    const tools = createMissionTools(source());
    expect(tools.map((t) => t.name)).toEqual(['estado_del_viaje', 'analisis_del_sitio', 'comparar_sitios', 'datos_de_mision']);
    for (const t of tools) expect(t.inputSchema.required).toEqual([]);
  });

  it('estado_del_viaje reports the phase step, the figure and the readouts painted on screen', async () => {
    const out = await call(source({ phase: 'launch', hud: launchHud }), 'estado_del_viaje');
    expect(out).toMatchObject({ fase: 'Despegue', paso: 1, de: 5, estado_de_la_mision: 'en_curso' });
    expect(out.cifra_principal).toEqual({ valor: 'T − 3', descripcion: 'segundos para la ignición' });
    expect(out.avance).toEqual({ etiqueta: 'Carga de datos', porcentaje: 64 });
    expect(out.lecturas).toContainEqual({ etiqueta: 'Altitud', valor: '169.3 km' });
    expect(out.lecturas).toContainEqual({ etiqueta: 'Distancia a la Luna', valor: '384 120 km' });
    expect(out.lecturas).toContainEqual({ etiqueta: 'Combustible', valor: '88 %', medidor: 'Combustible al 88 %' });
  });

  it('estado_del_viaje says whether the mission is waiting, paused or stopped instead of inventing readings', async () => {
    expect((await call(source({ phase: 'launch', hud: launchHud, waiting: true }), 'estado_del_viaje')).estado_de_la_mision).toBe('esperando_despegue');
    expect((await call(source({ phase: 'launch', hud: launchHud, mode: 'paused' }), 'estado_del_viaje')).estado_de_la_mision).toBe('en_pausa');
    const stopped = await call(source({ phase: 'landing', hud: launchHud, mode: 'stopped' }), 'estado_del_viaje');
    expect(stopped).toMatchObject({ fase: 'Alunizaje', paso: 4, estado_de_la_mision: 'detenida' });
    expect(stopped).not.toHaveProperty('lecturas');
  });

  it('analisis_del_sitio analyses the chosen site by default and any site by name or id', async () => {
    const chosen = await call(source(), 'analisis_del_sitio');
    expect(chosen).toMatchObject({ sitio: 'Malapert A (IM-1 Odysseus)', puntaje_de_100: 61, estado: 'Marginal', es_el_sitio_elegido: true });
    expect(chosen.resumen).toBe('Malapert A (IM-1 Odysseus): puntaje 61 de 100, estado Marginal. Sol visible el 62 % de la misión y Tierra visible el 40 %.');
    expect(chosen.sol).toMatchObject({ elevacion_grados: 1.83, azimut_grados: 123, visible_porcentaje_de_la_mision: 62, horas_de_sol_en_la_mision: 210 });
    expect(chosen.sol.proximo_atardecer).toBe('120.4 h después del aterrizaje');
    expect(chosen.tierra.proxima_puesta_de_la_tierra).toBe('no se oculta en los 14 días evaluados');
    expect(chosen.horizonte).toMatch(/LOLA/);

    expect((await call(source(), 'analisis_del_sitio', { sitio: 'malapert a' })).id).toBe('malapert-a');
    expect((await call(source(), 'analisis_del_sitio', { sitio: 'Mons Mouton' })).id).toBe('mons-mouton');
    expect((await call(source(), 'analisis_del_sitio', { sitio: 'nobile-rim-1' })).sol.sobre_el_horizonte_local_al_aterrizar).toBe(false);
  });

  it('analisis_del_sitio reports what is missing instead of guessing', async () => {
    expect(await call(source({ ranking: [] }), 'analisis_del_sitio')).toMatchObject({ disponible: false });
    const none = await call(source({ selected: null }), 'analisis_del_sitio');
    expect(none.disponible).toBe(false);
    expect(none.sitios_del_catalogo).toContain('Nobile Rim 1');
    expect(await call(source(), 'analisis_del_sitio', { sitio: 'Atlantis' })).toMatchObject({ disponible: false });
    const ambiguous = await call(source(), 'analisis_del_sitio', { sitio: 'malapert' });
    expect(ambiguous.sitios_posibles).toEqual(['Malapert Massif', 'Malapert A (IM-1 Odysseus)']);
  });

  it('comparar_sitios returns the best three by default, up to five, with the reason', async () => {
    const three = await call(source(), 'comparar_sitios');
    expect(three.mejores_sitios.map((s: { sitio: string }) => s.sitio)).toEqual(['Malapert Massif', 'Mons Mouton (IM-2 Athena)', 'Malapert A (IM-1 Odysseus)']);
    expect(three.mejores_sitios[0]).toMatchObject({ puesto: 1, puntaje_de_100: 82, estado: 'Viable' });
    expect(three.mejores_sitios[0].por_que).toMatch(/Sol visible el 62 %.*Tierra visible el 40 %.*comunicación directa/);
    expect((await call(source(), 'comparar_sitios', { cantidad: 9 })).mejores_sitios).toHaveLength(4);
    expect((await call(source(), 'comparar_sitios', { cantidad: 1 })).mejores_sitios).toHaveLength(3);
    expect(await call(source({ ranking: [] }), 'comparar_sitios')).toMatchObject({ disponible: false });
  });

  it('datos_de_mision gives the landing date and the score change caused by the applied delay', async () => {
    const hud: PhaseHud = {
      figure: { value: '61', caption: 'de 100' },
      toggles: { label: 'Simular retraso', options: [
        { id: 'delay-7', label: '+7 d', pressed: true }, { id: 'delay-14', label: '+14 d', pressed: false }, { id: 'delay-reset', label: 'Original', pressed: false },
      ] },
      side: { kind: 'ranking', title: 'Sitios', rows: [{ id: 'site-malapert-a', rank: 3, name: 'Malapert A', score: 61, status: 'marginal', selected: true, delta: -9 }] },
    };
    const out = await call(source({ hud }), 'datos_de_mision');
    expect(out).toMatchObject({
      sitio_elegido: 'Malapert A (IM-1 Odysseus)', fecha_de_aterrizaje: '2027-01-10T00:00:00.000Z', duracion_de_la_mision_dias: 14,
      retraso_aplicado_dias: 7, puntaje_actual: 61, puntaje_con_la_fecha_original: 70, cambio_de_puntaje: -9,
    });
  });

  it('datos_de_mision does not invent the delay outside the orbit phase', async () => {
    const out = await call(source({ phase: 'pov', hud: launchHud }), 'datos_de_mision');
    expect(out.retraso_aplicado_dias).toBeNull();
    expect(out.cambio_de_puntaje).toBeNull();
    expect(out.nota_retraso).toMatch(/órbita/);
    expect(await call({ ...source(), data: null }, 'datos_de_mision')).toMatchObject({ disponible: false });
  });

  describe('NO CAER is a simulated engine failure, never a real site', () => {
    it('comparar_sitios skips it and sitios_evaluados counts only the real sites', async () => {
      const out = await call(source({ ranking: WITH_DEMO }), 'comparar_sitios', { cantidad: 5 });
      expect(out.mejores_sitios.map((s: { sitio: string }) => s.sitio)).not.toContain('NO CAER');
      expect(out.mejores_sitios).toHaveLength(4);
      expect(out.sitios_evaluados).toBe(4);
    });

    it('analisis_del_sitio by name says it is a demonstration case and lends no figures', async () => {
      for (const sitio of ['NO CAER', 'no caer', 'no-caer']) {
        const out = await call(source({ ranking: WITH_DEMO }), 'analisis_del_sitio', { sitio });
        expect(out).toMatchObject({ sitio: 'NO CAER', es_caso_de_demostracion: true, es_sitio_real: false });
        expect(out.resumen).toMatch(/demostración.*falla simulada del motor/);
        for (const borrowed of ['puntaje_de_100', 'puesto_en_el_ranking', 'estado', 'sol', 'tierra', 'horizonte', 'temperatura_estimada_c']) expect(out).not.toHaveProperty(borrowed);
      }
    });

    it('analisis_del_sitio with no parameter gives the same answer when NO CAER is the chosen one', async () => {
      const out = await call(source({ ranking: WITH_DEMO, selected: NO_CAER }), 'analisis_del_sitio');
      expect(out).toMatchObject({ es_caso_de_demostracion: true, es_el_sitio_elegido: true });
      expect(out).not.toHaveProperty('sol');
    });

    it('the lists of possible sites never offer it', async () => {
      const none = await call(source({ ranking: WITH_DEMO, selected: null }), 'analisis_del_sitio');
      expect(none.sitios_del_catalogo).not.toContain('NO CAER');
      const unknown = await call(source({ ranking: WITH_DEMO }), 'analisis_del_sitio', { sitio: 'Atlantis' });
      expect(unknown.sitios_del_catalogo).toHaveLength(4);
    });

    it('datos_de_mision gives no score for it', async () => {
      const out = await call(source({ ranking: WITH_DEMO, selected: NO_CAER }), 'datos_de_mision');
      expect(out).toMatchObject({ puntaje_actual: null, cambio_de_puntaje: null });
      expect(out.nota_sitio).toMatch(/demostración/);
    });

    it('estado_del_viaje counts only the real rows on screen', async () => {
      const rows = [
        { id: 'site-malapert-massif', rank: 1, name: 'Malapert Massif', score: 82, status: 'viable' as const, selected: false },
        { id: 'site-no-caer', rank: 2, name: 'NO CAER', score: 0, status: 'not_viable' as const, selected: false, demo: true },
      ];
      const hud: PhaseHud = { figure: { value: '1', caption: 'x' }, side: { kind: 'ranking', title: 'Sitios evaluados', rows } };
      expect((await call(source({ hud }), 'estado_del_viaje')).sitios_evaluados_en_pantalla).toBe(1);
    });
  });

  it('never writes to the app', async () => {
    const src = source({ phase: 'launch', hud: launchHud });
    const frozen = Object.freeze({ ...src, ranking: Object.freeze([...src.ranking]) as SiteMetrics[] });
    for (const t of createMissionTools(frozen as MissionSource)) await expect(Promise.resolve(t.run({}))).resolves.toBeDefined();
  });
});
