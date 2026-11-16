/** Idioma de la interfaz. Módulo puro (sin React ni DOM): lo comparten Mission Control y la experiencia. */
export type Lang = 'es' | 'en'

export const LANGS: readonly Lang[] = ['es', 'en']

/** La preferencia guardada manda; sin ella, cualquier idioma del navegador «es*» da es y lo demás en. */
export function detectLang(saved: string | null, navigatorLang: string | undefined): Lang {
  if (saved === 'es' || saved === 'en') return saved
  return navigatorLang?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function localeOf(lang: Lang): 'es-MX' | 'en-US' {
  return lang === 'es' ? 'es-MX' : 'en-US'
}
