/**
 * Guion fijo del narrador. Cada línea tiene un audio pregrabado con la voz de CAPCOM
 * (Nova 2 Sonic, voz `carlos`) en /audio/narration/<id>.wav, generado por
 * `web/scripts/generate-narration.mjs`. Si cambias un texto, vuelve a correr el script:
 * el manifiesto guarda el texto con el que se grabó cada audio, y si no coincide el
 * narrador usa la voz del navegador en lugar de un audio que dice otra cosa.
 */
export const NARRATION_LINES = {
  launchStart: 'Secuencia de despegue iniciada. Destino: polo sur lunar.',
  liftoff: 'Despegue confirmado.',
  leftAtmosphere: 'Hemos salido de la atmósfera. Rumbo a la Luna.',
  lunarApproach: 'Aproximándonos a la Luna. Preparando inserción orbital.',
  siteCriteria:
    'Estoy comparando cada sitio por tres cosas: cuánto sol reciben sus paneles solares, '
    + 'si tienen línea directa con la Tierra para comunicarse, y qué tan inclinado es el terreno para alunizar seguro.',
  welcome: 'Bienvenido a touchdown. Soy el burrito espacial, tu guía. ¿Vas en VR, o sigues la misión en Mission Control?',
} as const;

export type NarrationId = keyof typeof NARRATION_LINES;

export const NARRATION_AUDIO_DIR = '/audio/narration';
export const NARRATION_MANIFEST_URL = `${NARRATION_AUDIO_DIR}/manifest.json`;

/** Lo que escribe el script: por cada id, el archivo y el texto exacto que se grabó. */
export interface NarrationManifest {
  voiceId: string;
  modelId: string;
  clips: Partial<Record<NarrationId, { file: string; text: string; durationMs: number }>>;
}
