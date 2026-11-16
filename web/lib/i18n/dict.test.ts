import { describe, expect, it } from 'vitest'
import { defineDict, interpolate, t, tn } from './dict'
import { setLang } from './store'

const dict = defineDict({
  es: { hello: 'Hola, {name}', bye: 'Adiós', 'days.one': '{n} día', 'days.other': '{n} días' },
  en: { hello: 'Hello, {name}', bye: 'Goodbye', 'days.one': '{n} day', 'days.other': '{n} days' },
})

describe('defineDict', () => {
  it('rejects at compile time a key that en lacks or that en adds', () => {
    // @ts-expect-error falta «bye» en en
    defineDict({ es: { a: 'a', bye: 'x' }, en: { a: 'a' } })
    // @ts-expect-error sobra «extra» en en
    defineDict({ es: { a: 'a' }, en: { a: 'a', extra: 'x' } })
    // @ts-expect-error la clave de en no es la de es
    defineDict({ es: { a: 'a' }, en: { b: 'b' } })
    expect(true).toBe(true)
  })

  it('keeps both languages and types t keys', () => {
    expect(Object.keys(dict.en)).toEqual(Object.keys(dict.es))
    // @ts-expect-error clave que el diccionario no tiene
    t(dict, 'nope')
  })
})

describe('t', () => {
  it('reads the current language and fills {vars}', () => {
    expect(t(dict, 'hello', { name: 'Ana' })).toBe('Hola, Ana')
    setLang('en')
    expect(t(dict, 'hello', { name: 'Ana' })).toBe('Hello, Ana')
    expect(t(dict, 'bye')).toBe('Goodbye')
  })

  it('leaves an unknown placeholder visible', () => {
    expect(interpolate('Hola {x}', {})).toBe('Hola {x}')
    expect(interpolate('Hola {x}')).toBe('Hola {x}')
    expect(interpolate('{n} / 100', { n: 0 })).toBe('0 / 100')
  })
})

describe('tn', () => {
  it('picks the .one or .other key by the language plural rule', () => {
    expect(tn(dict, 'days', 1)).toBe('1 día')
    expect(tn(dict, 'days', 0)).toBe('0 días')
    expect(tn(dict, 'days', 14)).toBe('14 días')
    setLang('en')
    expect(tn(dict, 'days', 1)).toBe('1 day')
    expect(tn(dict, 'days', 2)).toBe('2 days')
  })
})
