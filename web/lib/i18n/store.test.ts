import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLang, locale, setLang, subscribe } from './store'

beforeEach(() => {
  window.localStorage.clear()
})

describe('language store', () => {
  it('is Spanish in every test: the setup pins it without saving anything', () => {
    expect(getLang()).toBe('es')
    expect(locale()).toBe('es-MX')
    expect(window.localStorage.getItem('touchdown.lang')).toBeNull()
  })

  it('setLang saves the shared preference, sets html lang and gives the locale', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    expect(locale()).toBe('en-US')
    expect(window.localStorage.getItem('touchdown.lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('setLang with persist:false changes the language but leaves the preference alone', () => {
    setLang('en', { persist: false })
    expect(getLang()).toBe('en')
    expect(window.localStorage.getItem('touchdown.lang')).toBeNull()
  })

  it('notifies subscribers once per real change and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = subscribe(cb)
    setLang('en')
    setLang('en')
    expect(cb).toHaveBeenCalledTimes(1)
    setLang('es')
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    setLang('en')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('follows the preference when another tab (Mission Control) changes it', () => {
    const cb = vi.fn()
    const off = subscribe(cb)
    window.localStorage.setItem('touchdown.lang', 'en')
    window.dispatchEvent(new StorageEvent('storage', { key: 'touchdown.lang', newValue: 'en' }))
    expect(getLang()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('ignores storage events about other keys', () => {
    const cb = vi.fn()
    const off = subscribe(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'en' }))
    expect(getLang()).toBe('es')
    expect(cb).not.toHaveBeenCalled()
    off()
  })
})

describe('first read', () => {
  it('starts from the saved preference, else from the browser language', async () => {
    window.localStorage.setItem('touchdown.lang', 'en')
    vi.resetModules()
    const saved = await import('./store')
    expect(saved.getLang()).toBe('en')

    window.localStorage.clear()
    vi.resetModules()
    const fromBrowser = await import('./store')
    expect(fromBrowser.getLang()).toBe('en') // jsdom reports en-US
  })
})
