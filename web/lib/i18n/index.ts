/** Parte sin React: motor, fases, paneles de canvas. Los hooks viven en '@/lib/i18n/react'. */
export { LANGS, detectLang, localeOf, type Lang } from './lang'
export { getLang, locale, setLang, subscribe } from './store'
export { defineDict, interpolate, t, tn, type Dict, type DictKey, type Vars } from './dict'
