import { describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'
import { detectLang, translate } from './index'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('dictionaries', () => {
  it('define the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(es[key]))
    }
  })

  it('leave no empty strings', () => {
    for (const dict of [es, en]) {
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), key).not.toBe('')
    }
  })
})

describe('translate', () => {
  it('fills placeholders and keeps unknown ones visible', () => {
    expect(translate('es', 'scoreValue', { n: 74 })).toBe('74 / 100')
    expect(translate('en', 'noResults', { q: 'moon' })).toBe('No results for “moon”')
    expect(translate('en', 'scoreValue')).toBe('{n} / 100')
  })
})

describe('language detection', () => {
  it('prefers a saved choice', () => {
    expect(detectLang('en', 'es-MX')).toBe('en')
    expect(detectLang('es', 'en-US')).toBe('es')
  })

  it('maps every Spanish browser language to Spanish and anything else to English', () => {
    for (const lang of ['es', 'es-MX', 'ES-ar', 'es-419']) expect(detectLang(null, lang)).toBe('es')
    for (const lang of ['en-US', 'fr', 'pt-BR', '']) expect(detectLang(null, lang)).toBe('en')
    expect(detectLang(null, undefined)).toBe('en')
  })

  it('ignores an invalid saved value', () => {
    expect(detectLang('fr', 'es-MX')).toBe('es')
  })
})
