/**
 * Guion fijo del narrador. Cada línea tiene un audio pregrabado con la voz de CAPCOM
 * (Nova 2 Sonic, voz `carlos`) en /audio/narration/<id>.wav, generado por
 * `web/scripts/generate-narration.mjs`. Si cambias un texto, vuelve a correr el script:
 * el manifiesto guarda el texto con el que se grabó cada audio, y si no coincide el
 * narrador usa la voz del navegador en lugar de un audio que dice otra cosa.
 *
 * Hay una versión en inglés (`NARRATION_LINES_EN`, voz `matthew`, /audio/narration/en/): el narrador elige por idioma
 * (`getLang()`). El texto en español no se toca. Las líneas en inglés van entre comillas dobles porque llevan apóstrofos:
 * el script las lee con el mismo analizador.
 */
export const NARRATION_LINES = {
  launchStart: 'Secuencia de despegue iniciada. Destino: polo sur lunar.',
  liftoff: 'Despegue confirmado.',
  leftAtmosphere: 'Hemos salido de la atmósfera. Rumbo a la Luna.',
  lunarApproach: 'Aproximándonos a la Luna. Preparando inserción orbital.',
  siteCriteria:
    'Estoy comparando cada sitio por dos cosas: cuántas horas de sol reciben sus paneles '
    + 'y cuántas horas tienen la Tierra a la vista para comunicarse directo. El relieve real del polo decide las dos.',
  welcome: 'Bienvenido a TOUCHDOWN. Soy el burrito espacial, tu guía. Vamos a elegir dónde y cuándo alunizar en el polo sur de la Luna.',
} as const;

export type NarrationId = keyof typeof NARRATION_LINES;

/** Mismas líneas, mismo orden y mismo tono, en inglés para un jurado internacional. */
export const NARRATION_LINES_EN = {
  launchStart: "Launch sequence started. Destination: the lunar south pole.",
  liftoff: "Liftoff confirmed.",
  leftAtmosphere: "We've cleared the atmosphere. Heading for the Moon.",
  lunarApproach: "Approaching the Moon. Preparing for orbital insertion.",
  siteCriteria:
    "I'm comparing each site on two things: how many hours of sunlight its panels receive, "
    + "and how many hours it has Earth in view for a direct-to-Earth link. The real terrain at the pole decides both.",
  welcome: "Welcome to TOUCHDOWN. I'm Burrito, your space donkey guide. Let's choose where and when to land at the Moon's south pole.",
} as const satisfies Record<NarrationId, string>;

export type NarrationLang = 'es' | 'en';

export const NARRATION_LINES_BY_LANG: Record<NarrationLang, Record<NarrationId, string>> = {
  es: NARRATION_LINES,
  en: NARRATION_LINES_EN,
};

/** El texto de una línea en un idioma. */
export const narrationText = (id: NarrationId, lang: NarrationLang): string => NARRATION_LINES_BY_LANG[lang][id];

/** El español vive en la raíz (los WAV ya grabados); el inglés, en /en/ con su propio manifiesto. */
export const NARRATION_AUDIO_DIR = '/audio/narration';
export const NARRATION_AUDIO_DIR_EN = `${NARRATION_AUDIO_DIR}/en`;
export const NARRATION_MANIFEST_URL = `${NARRATION_AUDIO_DIR}/manifest.json`;
export const NARRATION_MANIFEST_URL_EN = `${NARRATION_AUDIO_DIR_EN}/manifest.json`;

export const narrationAudioDir = (lang: NarrationLang): string => (lang === 'en' ? NARRATION_AUDIO_DIR_EN : NARRATION_AUDIO_DIR);
export const narrationManifestUrl = (lang: NarrationLang): string => (lang === 'en' ? NARRATION_MANIFEST_URL_EN : NARRATION_MANIFEST_URL);

/** Lo que escribe el script: por cada id, el archivo y el texto exacto que se grabó. */
export interface NarrationManifest {
  voiceId: string;
  modelId: string;
  clips: Partial<Record<NarrationId, { file: string; text: string; durationMs: number }>>;
}
