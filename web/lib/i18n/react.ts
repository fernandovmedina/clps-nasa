'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { textIn, type Dict, type Vars } from './dict'
import type { Lang } from './lang'
import { getLang, subscribe } from './store'

/** Idioma actual; el componente se vuelve a renderizar cuando cambia. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'es')
}

/** Como `t(dict, key, vars)`, pero ligado al render: al cambiar el idioma el componente se repinta. */
export function useT<E extends Record<string, string>>(dict: Dict<E>): (key: keyof E & string, vars?: Vars) => string {
  const lang = useLang()
  return useCallback((key, vars) => textIn(dict, lang, key, vars), [dict, lang])
}
