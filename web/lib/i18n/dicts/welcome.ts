import { NARRATION_LINES } from '@/lib/engine/narration-lines'
import { defineDict } from '../dict'

/**
 * Bienvenida del Burrito espacial (components/experience/WelcomeGuide.tsx). El subtítulo en español es la línea que dice
 * la voz grabada; la voz sigue en español en los dos idiomas hasta que el área del motor grabe la versión en inglés.
 */
export const welcomeDict = defineDict({
  es: {
    skip: 'Saltar',
    tap: 'Toca para empezar',
    subtitle: NARRATION_LINES.welcome,
    eyebrow: 'Burrito espacial',
    title: 'Bienvenido a TOUCHDOWN',
    lede: 'Compara sitios y fechas de alunizaje en el polo sur con datos reales de NASA',
    enterVr: 'Entrar en VR',
    explore: 'Explorar la misión',
    vrHint: 'Para VR, ábrelo en el navegador del Meta Quest',
    follow: 'Seguir la misión de alguien (con código)',
    analysis: 'Análisis de sitios y fechas',
  },
  en: {
    skip: 'Skip',
    tap: 'Tap to start',
    subtitle: 'Welcome to TOUCHDOWN. I\'m the Space Donkey, your guide. Together we\'ll pick where and when to land at the Moon\'s south pole.',
    eyebrow: 'Space Donkey',
    title: 'Welcome to TOUCHDOWN',
    lede: 'Compare lunar south pole landing sites and dates with real NASA data',
    enterVr: 'Enter VR',
    explore: 'Explore the mission',
    vrHint: 'For VR, open it in the Meta Quest browser',
    follow: 'Follow someone\'s mission (with a code)',
    analysis: 'Site and date analysis',
  },
})
