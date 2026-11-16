import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLang, setLang } from '@/lib/i18n'
import LangToggle from './LangToggle'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('LangToggle', () => {
  it('is a labelled group of ES and EN buttons with aria-pressed on the current one', () => {
    render(<LangToggle />)
    const group = screen.getByRole('group', { name: 'Idioma' })
    const es = screen.getByRole('button', { name: 'ES' })
    const en = screen.getByRole('button', { name: 'EN' })
    expect(group.contains(es) && group.contains(en)).toBe(true)
    expect(es.getAttribute('aria-pressed')).toBe('true')
    expect(en.getAttribute('aria-pressed')).toBe('false')
    expect(es.getAttribute('lang')).toBe('es')
    expect(en.getAttribute('lang')).toBe('en')
    expect(en.getAttribute('title')).toBe('English')
  })

  it('changes the language, saves it and tells the caller', () => {
    const onChange = vi.fn()
    render(<LangToggle onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(getLang()).toBe('en')
    expect(window.localStorage.getItem('touchdown.lang')).toBe('en')
    expect(onChange).toHaveBeenCalledWith('en')
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy()
  })

  it('does not call back when the pressed language is chosen again', () => {
    const onChange = vi.fn()
    render(<LangToggle onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'ES' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('follows a language set elsewhere', () => {
    render(<LangToggle />)
    act(() => setLang('en'))
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('uses real buttons, so Tab, Enter and Space already work', () => {
    render(<LangToggle />)
    for (const b of screen.getAllByRole('button')) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.getAttribute('type')).toBe('button')
    }
  })
})
