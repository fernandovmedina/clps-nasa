import { afterEach, describe, expect, it } from 'vitest'
import * as prefs from './prefs'

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('lang')
})

describe('prefs', () => {
  it('ignores a stored dark theme in the boot script', () => {
    window.localStorage.setItem('touchdown.theme', 'dark')
    window.localStorage.setItem('touchdown.lang', 'en')
    new Function(prefs.BOOT_SCRIPT)()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })

  it('exposes no theme API', () => {
    expect(Object.keys(prefs).sort()).toEqual(['BOOT_SCRIPT', 'readPref', 'writePref'])
  })

  it('persists only the language', () => {
    prefs.writePref('lang', 'en')
    expect(prefs.readPref('lang')).toBe('en')
    expect(window.localStorage.getItem('touchdown.lang')).toBe('en')
    expect(window.localStorage.getItem('touchdown.theme')).toBeNull()
  })
})
