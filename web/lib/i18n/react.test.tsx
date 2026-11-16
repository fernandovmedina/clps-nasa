import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defineDict } from './dict'
import { useLang, useT } from './react'
import { setLang } from './store'

const dict = defineDict({
  es: { title: 'Hola, {name}' },
  en: { title: 'Hello, {name}' },
})

function Probe() {
  const t = useT(dict)
  const lang = useLang()
  return <p data-lang={lang}>{t('title', { name: 'Ana' })}</p>
}

afterEach(cleanup)

describe('useT', () => {
  it('renders in the current language and re-renders when it changes', () => {
    render(<Probe />)
    expect(screen.getByText('Hola, Ana').getAttribute('data-lang')).toBe('es')
    act(() => setLang('en'))
    expect(screen.getByText('Hello, Ana').getAttribute('data-lang')).toBe('en')
    act(() => setLang('es'))
    expect(screen.getByText('Hola, Ana')).toBeTruthy()
  })
})
