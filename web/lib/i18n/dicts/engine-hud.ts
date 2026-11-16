import { defineDict } from '../dict'

/**
 * Etiquetas compartidas del motor (lib/engine/hud.ts): nombres de fase, estados de sitio, cuenta atrás del despegue
 * y el formato de fecha. Las leen HUD, centro de control, CAPCOM y las fases, siempre a través de hud.ts.
 */
export const engineHudDict = defineDict({
  es: {
    'phase.launch': 'Despegue',
    'phase.orbit': 'Órbita y ranking',
    'phase.pov': 'Vista del sitio',
    'phase.landing': 'Alunizaje',
    'phase.transmit': 'Transmisión',
    'status.viable': 'Viable',
    'status.marginal': 'Marginal',
    'status.not_viable': 'No viable',
    'countdown.tickValue': 'T − {n}',
    'countdown.tickCaption': 'segundos para la ignición',
    'countdown.ignitionValue': 'Ignición',
    'countdown.ignitionCaption': 'encendido de motores',
    'countdown.liftoffValue': 'Despegue',
    'countdown.liftoffCaption': 'rumbo a la Luna',
    percent: '{n} %',
  },
  en: {
    'phase.launch': 'Launch',
    'phase.orbit': 'Orbit and ranking',
    'phase.pov': 'Site view',
    'phase.landing': 'Landing',
    'phase.transmit': 'Transmission',
    'status.viable': 'Viable',
    'status.marginal': 'Marginal',
    'status.not_viable': 'Not viable',
    'countdown.tickValue': 'T − {n}',
    'countdown.tickCaption': 'seconds to ignition',
    'countdown.ignitionValue': 'Ignition',
    'countdown.ignitionCaption': 'engine start',
    'countdown.liftoffValue': 'Liftoff',
    'countdown.liftoffCaption': 'bound for the Moon',
    percent: '{n}%',
  },
});
