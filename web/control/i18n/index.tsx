'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { en } from './en'
import { es, type Dict } from './es'
import { detectLang, type Lang } from '@/lib/i18n/lang'

export { detectLang, type Lang }
export type Key = keyof Dict
export type Translate = (key: Key, vars?: Record<string, string | number>) => string

const dictionaries: Record<Lang, Dict> = { es, en }

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang][key]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

interface I18n {
  lang: Lang
  locale: string
  t: Translate
}

const Context = createContext<I18n>({ lang: 'es', locale: 'es', t: (key, vars) => translate('es', key, vars) })

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = useCallback<Translate>((key, vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, locale: lang === 'es' ? 'es-MX' : 'en-US', t }), [lang, t])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useI18n(): I18n {
  return useContext(Context)
}
