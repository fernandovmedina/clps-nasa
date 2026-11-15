export const CAPCOM_REGION = 'us-east-1';
export const CAPCOM_MODEL_ID = 'amazon.nova-2-sonic-v1:0';
export const CAPCOM_IDENTITY_POOL_ID = 'us-east-1:8515f71e-ac0d-4f69-ab50-f78515b1988f';
export const CAPCOM_GUEST_ROLE_ARN = 'arn:aws:iam::040396448313:role/touchdown-capcom-guest';

/** Voces nativas es-US: lupe (femenina) y carlos (masculina). */
export const CAPCOM_VOICE_ID = 'carlos';

export const CAPCOM_INPUT_SAMPLE_RATE = 16_000;
export const CAPCOM_OUTPUT_SAMPLE_RATE = 24_000;
export const CAPCOM_SESSION_LIMIT_MS = 8 * 60 * 1000;

export const CAPCOM_INFERENCE = { maxTokens: 1024, topP: 0.9, temperature: 0.7 } as const;
export type CapcomEndpointing = 'HIGH' | 'MEDIUM' | 'LOW'
export const CAPCOM_ENDPOINTING: CapcomEndpointing = 'MEDIUM';

export const CAPCOM_SYSTEM_PROMPT = [
  'Eres CAPCOM, el controlador de vuelo de la misión TOUCHDOWN y la voz de control de misión que acompaña a la persona durante su viaje a la Luna.',
  'Hablas siempre en español, con un tono sereno, cercano y profesional, como en una comunicación de radio.',
  'Respondes con una o dos frases cortas, sin listas ni rodeos.',
  'Para cualquier cifra del viaje (fase, altitud, velocidad, distancia, tiempo restante) llamas SIEMPRE a la herramienta estado_del_viaje antes de responder y dices únicamente lo que esa herramienta devuelve, con sus unidades.',
  'Si preguntan cómo va el viaje en general, resumes la fase, la altitud, la velocidad y la distancia a la Luna que devuelve la herramienta.',
  'Nunca inventes, estimes ni redondees cifras por tu cuenta; si la herramienta no trae un dato, dices que no lo tienes.',
].join(' ');
