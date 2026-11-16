import { defineDict } from '../dict'

/**
 * Textos que comparten las fases 3D (lib/phases): estado de un sitio, nombre de cada fase, cuerpos del cielo y las notas
 * de contraste del ranking. Las cifras, las unidades y los nombres de sitio no se traducen.
 */
export const phasesCommonDict = defineDict({
  es: {
    'status.viable': 'Viable',
    'status.marginal': 'Marginal',
    'status.not_viable': 'No viable',
    'phase.launch': 'Despegue',
    'phase.orbit': 'Órbita y ranking',
    'phase.pov': 'Vista del sitio',
    'phase.landing': 'Alunizaje',
    'phase.transmit': 'Transmisión',
    'note.demo': 'Caso de demostración · falla simulada del motor',
    'note.equatorial': 'Contraste · ecuatorial',
    'note.midLatitude': 'Contraste · latitud media',
    'note.farSide': 'Contraste · lado oculto',
    'hz.lola': 'LOLA',
    'hz.geometric': 'geométrico',
    shadow: 'en sombra',
    noLink: 'sin enlace',
    sun: 'Sol',
    earth: 'Tierra',
  },
  en: {
    'status.viable': 'Viable',
    'status.marginal': 'Marginal',
    'status.not_viable': 'Not viable',
    'phase.launch': 'Launch',
    'phase.orbit': 'Orbit and ranking',
    'phase.pov': 'Site view',
    'phase.landing': 'Landing',
    'phase.transmit': 'Transmission',
    'note.demo': 'Demo case · simulated engine failure',
    'note.equatorial': 'Contrast · equatorial',
    'note.midLatitude': 'Contrast · mid-latitude',
    'note.farSide': 'Contrast · far side',
    'hz.lola': 'LOLA',
    'hz.geometric': 'geometric',
    shadow: 'in shadow',
    noLink: 'no link',
    sun: 'Sun',
    earth: 'Earth',
  },
})
