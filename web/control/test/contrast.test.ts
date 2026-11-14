// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../styles/globals.css', import.meta.url)), 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1] as string] = (m[2] as string).toLowerCase()
  return out
}

function luminance(hex: string): number {
  const channel = (shift: number) => {
    const c = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi as number) + 0.05) / ((lo as number) + 0.05)
}

const root = tokens(':root')
const themes = { light: root, dark: { ...root, ...tokens(":root[data-theme='dark']") } }

describe.each(Object.entries(themes))('%s theme tokens', (_name, t) => {
  const at = (key: string) => t[key] as string

  it('defines every token the checks rely on', () => {
    for (const key of [
      'bg-base',
      'bg-elevated',
      'bg-raised',
      'bg-field',
      'bg-selected',
      'bg-pressed',
      'bg-toggle-on',
      'label',
      'label-2',
      'control-border',
      'accent',
      'on-accent',
      'accent-text',
      'sun',
      'earth',
      'both',
      'viable',
      'marginal',
      'idle',
      'bad',
      'viable-bg',
      'marginal-bg',
      'bad-bg',
      'on-status',
    ]) {
      expect(t[key], key).toBeDefined()
    }
  })

  it('keeps primary text at 7:1 on every surface', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-toggle-on']) {
      expect(ratio(at('label'), at(bg)), bg).toBeGreaterThanOrEqual(7)
    }
  })

  it('keeps button text at 7:1 on the pressed and selected backgrounds', () => {
    for (const bg of ['bg-pressed', 'bg-selected']) expect(ratio(at('label'), at(bg)), bg).toBeGreaterThanOrEqual(7)
  })

  it('keeps secondary text at 4.5:1 on every surface', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-selected']) {
      expect(ratio(at('label-2'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps control borders at 3:1 against the surfaces they sit on', () => {
    for (const bg of ['bg-base', 'bg-elevated']) {
      expect(ratio(at('control-border'), at(bg)), bg).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps status labels readable on their pale fill', () => {
    for (const status of ['viable-bg', 'marginal-bg', 'bad-bg']) {
      expect(ratio(at('on-status'), at(status)), status).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps chart colours at 3:1 on the card, the field and the track', () => {
    for (const color of ['sun', 'earth', 'both', 'viable', 'marginal', 'idle']) {
      for (const bg of ['bg-field', 'bg-elevated', 'bg-raised']) expect(ratio(at(color), at(bg)), `${color} on ${bg}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the accent visible as a mark on the card and readable as button and link text', () => {
    expect(ratio(at('accent'), at('bg-elevated'))).toBeGreaterThanOrEqual(3)
    expect(ratio(at('on-accent'), at('accent'))).toBeGreaterThanOrEqual(4.5)
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised']) {
      expect(ratio(at('accent-text'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps error text at 4.5:1 on the page and the card', () => {
    for (const bg of ['bg-base', 'bg-elevated']) expect(ratio(at('bad'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
  })

  it('makes elevated surfaces lighter than the base in dark mode only', () => {
    const lift = luminance(at('bg-elevated')) - luminance(at('bg-base'))
    if (_name === 'dark') expect(lift).toBeGreaterThan(0)
    else expect(lift).toBeGreaterThanOrEqual(0)
  })
})

describe.each(Object.entries(themes))('sky panel tokens in the %s theme', (_name, t) => {
  const at = (key: string) => t[key] as string

  it('keeps text at 7:1 and secondary text at 4.5:1 on the slate', () => {
    expect(ratio(at('sky-text'), at('sky-bg'))).toBeGreaterThanOrEqual(7)
    expect(ratio(at('sky-text-2'), at('sky-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the bodies, the horizon line and the accent at 3:1 on the slate', () => {
    for (const color of ['sky-sun', 'sky-earth', 'sky-terrain-line', 'accent']) {
      expect(ratio(at(color), at('sky-bg')), color).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the accent readable as text on the slate', () => {
    expect(ratio(at('accent'), at('sky-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the bodies visible against the terrain they cross', () => {
    for (const color of ['sky-sun', 'sky-earth']) expect(ratio(at(color), at('sky-terrain')), color).toBeGreaterThanOrEqual(3)
  })
})
