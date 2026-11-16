import { defineDict } from '../dict'

/** Botón y subtítulos de CAPCOM (components/experience/Capcom.tsx). */
export const capcomDict = defineDict({
  es: {
    connecting: 'Conectando…',
    ready: 'Listo',
    thinking: 'Pensando…',
    speaking: 'Hablando…',
    hearing: 'Escuchando…',
    talk: 'Hablar con CAPCOM',
    unavailable: 'CAPCOM no disponible',
    talkLong: 'Hablar con ',
    unavailableLong: 'no disponible',
    hint: 'Mantén pulsado para hablar. Con el teclado, mantén pulsada la tecla {key}, o Espacio con el foco en el botón.',
    captions: 'Subtítulos de CAPCOM',
    you: 'Tú',
    'error.mic': 'Permite el micrófono para hablar con CAPCOM.',
    'error.lost': 'CAPCOM perdió la conexión · pulsa para reintentar.',
    'error.connect': 'No se pudo conectar con CAPCOM · pulsa para reintentar.',
  },
  en: {
    connecting: 'Connecting…',
    ready: 'Ready',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    hearing: 'Listening…',
    talk: 'Talk to CAPCOM',
    unavailable: 'CAPCOM unavailable',
    talkLong: 'Talk to ',
    unavailableLong: 'unavailable',
    hint: 'Press and hold to talk. With the keyboard, hold the {key} key, or Space while the button has focus.',
    captions: 'CAPCOM captions',
    you: 'You',
    'error.mic': 'Allow the microphone to talk to CAPCOM.',
    'error.lost': 'CAPCOM lost the connection · press to retry.',
    'error.connect': 'Could not connect to CAPCOM · press to retry.',
  },
})
