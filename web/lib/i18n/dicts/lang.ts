import { defineDict } from '../dict'

/** Selector de idioma de la experiencia. Los códigos ES y EN no se traducen: son el nombre del botón. */
export const langDict = defineDict({
  es: { group: 'Idioma', es: 'Español', en: 'English' },
  en: { group: 'Language', es: 'Español', en: 'English' },
})
