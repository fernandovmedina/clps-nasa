import { defineDict } from '../dict'

/** Diálogo «Seguir una misión» (components/experience/FollowMissionDialog.tsx). */
export const followDict = defineDict({
  es: {
    eyebrow: 'Seguimiento',
    title: 'Seguir una misión',
    ledeCode: 'Escribe el código de seguimiento de quien va a despegar. Verás su misión en vivo: el despegue, la órbita, el alunizaje y la transmisión.',
    ledeWhere: 'Lo muestra la pantalla de quien despega, en el panel de su misión, como «{label}».',
    field: 'Código de seguimiento',
    same: 'Ya estás en esa sala',
    invalid: 'Código no válido',
    cancel: 'Cancelar',
    connect: 'Conectar',
    noCode: '¿No tienes código?',
    explore: 'Explora la misión tú mismo',
  },
  en: {
    eyebrow: 'Tracking',
    title: 'Follow a mission',
    ledeCode: 'Enter the tracking code of whoever is about to launch. You will see their mission live: launch, orbit, landing and transmission.',
    ledeWhere: 'It appears on the launching crew’s screen, in their mission panel, as “{label}”.',
    field: 'Tracking code',
    same: 'You are already in that room',
    invalid: 'Invalid code',
    cancel: 'Cancel',
    connect: 'Connect',
    noCode: 'No code?',
    explore: 'Explore the mission yourself',
  },
})
