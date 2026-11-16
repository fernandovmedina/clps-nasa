import { readPref, writePref } from '@/control/lib/prefs'
import { detectLang, localeOf, type Lang } from './lang'

/**
 * Idioma actual de la experiencia, fuera de React: lo leen el motor 3D, las fases y los paneles de canvas.
 * Comparte la preferencia `touchdown.lang` con Mission Control (control/lib/prefs.ts).
 */
let current: Lang | null = null
const listeners = new Set<() => void>()
let watching = false

function initial(): Lang {
  return detectLang(readPref('lang'), typeof navigator === 'undefined' ? undefined : navigator.language)
}

function apply(next: Lang): boolean {
  const changed = next !== getLang()
  current = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (changed) for (const cb of [...listeners]) cb()
  return changed
}

/** Lectura perezosa: el export estático evalúa los módulos sin `window`. */
export function getLang(): Lang {
  current ??= initial()
  return current
}

export function locale(): 'es-MX' | 'en-US' {
  return localeOf(getLang())
}

/** Guarda la preferencia (salvo `persist: false`), pone `html lang` y avisa a los suscriptores si cambió. */
export function setLang(next: Lang, opts: { persist?: boolean } = {}): void {
  if (opts.persist !== false) writePref('lang', next)
  apply(next)
}

/** Devuelve la función que cancela la suscripción. */
export function subscribe(cb: () => void): () => void {
  watchOtherTabs()
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Si Mission Control (otra pestaña) cambia el idioma mientras la experiencia está abierta, la experiencia lo sigue. */
function watchOtherTabs(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== 'touchdown.lang') return
    apply(initial())
  })
}
