import { defineDict } from '../dict'

/**
 * Textos que nacen en lib/mission (sites.ts, launch-plan.ts): rótulos de contraste, nota del caso de demostración,
 * avisos de carga y del plan de lanzamiento. Los nombres de sitio y las notas de sites.json (datos del pipeline) no pasan por aquí.
 */
export const missionDataDict = defineDict({
  es: {
    'contrast.equatorial': 'Contraste · ecuatorial',
    'contrast.midLatitude': 'Contraste · latitud media',
    'contrast.farSide': 'Contraste · lado oculto',
    'demo.crashNote': 'Caso de demostración · falla simulada del motor',
    'demo.siteNote': 'Caso de demostración, no es un sitio real: el descenso termina en impacto.',
    'load.catalog': 'Cargando catálogo de sitios · NASA LOLA + JPL Horizons',
    'load.ephemeris': 'Efemérides y horizonte · {name}',
    'load.terrain': 'Terreno LOLA (heightmap) · {name}',
    'load.ready': 'Datos listos',
    'dev.name': 'Sitio de desarrollo (sin datos reales)',
    'dev.note': 'Fallback de desarrollo — no es un sitio real, solo para ?phase=... sin pasar por loadMissionData.',
    'plan.invalid': 'Elige una fecha y una hora de despegue válidas.',
    'plan.outOfRange':
      'La llegada ({arrival}) queda fuera de los datos de la misión: debe caer entre {start} y {end}. Despega entre {launchStart} y {launchEnd}.',
    'plan.transitHint': 'Tránsito directo de {days} días (supuesto)',
    'plan.transitValue': '{days} días (supuesto)',
  },
  en: {
    'contrast.equatorial': 'Contrast · equatorial',
    'contrast.midLatitude': 'Contrast · mid-latitude',
    'contrast.farSide': 'Contrast · far side',
    'demo.crashNote': 'Demo case · simulated engine failure',
    'demo.siteNote': 'Demo case, not a real site: the descent ends in an impact.',
    'load.catalog': 'Loading site catalog · NASA LOLA + JPL Horizons',
    'load.ephemeris': 'Ephemeris and horizon · {name}',
    'load.terrain': 'LOLA terrain (heightmap) · {name}',
    'load.ready': 'Data ready',
    'dev.name': 'Development site (no real data)',
    'dev.note': 'Development fallback: not a real site, only for ?phase=... without going through loadMissionData.',
    'plan.invalid': 'Pick a valid launch date and time.',
    'plan.outOfRange':
      'The arrival ({arrival}) falls outside the mission data: it must land between {start} and {end}. Launch between {launchStart} and {launchEnd}.',
    'plan.transitHint': 'Direct transit of {days} days (assumed)',
    'plan.transitValue': '{days} days (assumed)',
  },
})
