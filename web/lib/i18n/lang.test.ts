import { describe, expect, it } from 'vitest'
import { detectLang, localeOf } from './lang'
import { detectLang as fromControl } from '@/control/i18n'

describe('shared language helpers', () => {
  it('detectLang prefers a saved choice and maps any «es*» browser language to es', () => {
    expect(detectLang('en', 'es-MX')).toBe('en')
    expect(detectLang('es', 'en-US')).toBe('es')
    expect(detectLang(null, 'es-419')).toBe('es')
    expect(detectLang('fr', 'fr-FR')).toBe('en')
    expect(detectLang(null, undefined)).toBe('en')
  })

  it('Mission Control re-exports the very same function', () => {
    expect(fromControl).toBe(detectLang)
  })

  it('localeOf gives es-MX or en-US', () => {
    expect(localeOf('es')).toBe('es-MX')
    expect(localeOf('en')).toBe('en-US')
  })
})
