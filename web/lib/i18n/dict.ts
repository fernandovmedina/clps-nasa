import { getLang, locale } from './store'
import type { Lang } from './lang'

/** Mapa clave → texto de un área. `{var}` marca un valor que se rellena con `t(dict, key, { var })`. */
export interface Dict<E extends Record<string, string>> {
  readonly es: Readonly<E>
  readonly en: Readonly<Record<keyof E, string>>
}

/**
 * Declara el diccionario de un área. `es` fija las claves; `en` debe tener exactamente las mismas:
 * una clave faltante o sobrante es un error de compilación.
 */
export function defineDict<E extends Record<string, string>>(dict: {
  es: E
  en: Record<keyof NoInfer<E>, string>
}): Dict<E> {
  return dict
}

export type DictKey<D> = D extends Dict<infer E> ? keyof E & string : never
export type Vars = Record<string, string | number>

/** Rellena `{var}`; un marcador sin valor queda visible para que el hueco se note. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

/** Texto en el idioma actual, para código sin React (motor, fases, paneles de canvas). */
export function t<E extends Record<string, string>>(dict: Dict<E>, key: keyof E & string, vars?: Vars): string {
  return textIn(dict, getLang(), key, vars)
}

export function textIn<E extends Record<string, string>>(dict: Dict<E>, lang: Lang, key: keyof E & string, vars?: Vars): string {
  return interpolate((dict[lang] as Record<string, string>)[key] ?? key, vars)
}

type Base<K extends string> = K extends `${infer B}.one` ? B : never

/**
 * Plural mínimo: busca `<base>.one` o `<base>.other` según la regla del idioma (Intl.PluralRules, sin dependencias).
 * `{n}` ya viene puesto con la cantidad; el resto de variables va en `vars`.
 */
export function tn<E extends Record<string, string>>(dict: Dict<E>, base: Base<keyof E & string>, n: number, vars?: Vars): string {
  const form = new Intl.PluralRules(locale()).select(n) === 'one' ? 'one' : 'other'
  return textIn(dict, getLang(), `${base}.${form}` as keyof E & string, { n, ...vars })
}
