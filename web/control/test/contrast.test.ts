// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)), 'utf8')

function parseTokens(): Record<string, string> {
  const start = css.indexOf(':root {')
  expect(start, ':root').toBeGreaterThanOrEqual(0)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*((?:#[0-9a-fA-F]{6})|(?:rgba\([^)]*\)))\s*;/g)) out[m[1] as string] = (m[2] as string).toLowerCase()
  return out
}

type Rgb = [number, number, number]

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Color final de un token opaco (#rrggbb) o translúcido (rgba) sobre un fondo opaco. */
function flatten(value: string, over: string): string {
  if (value.startsWith('#')) return value
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(value)
  expect(m, value).not.toBeNull()
  const [r, g, b, a] = [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])]
  const base = toRgb(over)
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + (base[i] as number) * (1 - a)))
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const channel = (c8: number) => {
    const c = c8 / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = toRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi as number) + 0.05) / ((lo as number) + 0.05)
}

const t = parseTokens()
const at = (key: string, over?: string): string => {
  const v = t[key]
  expect(v, key).toBeDefined()
  return flatten(v as string, over ?? (t['bg-base'] as string))
}

describe('paper theme tokens', () => {
  it('defines every token the checks rely on', () => {
    for (const key of [
      'bg-base', 'bg-surface', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-selected', 'bg-pressed', 'bg-toggle-on',
      'label', 'label-2', 'label-3', 'line', 'line-strong', 'control-border', 'accent', 'on-accent', 'accent-text',
      'sun', 'earth', 'both', 'viable', 'marginal', 'idle', 'bad', 'viable-bg', 'marginal-bg', 'bad-bg', 'on-status',
      'terrain', 'terrain-line', 'sky-bg', 'sky-text', 'sky-text-2', 'sky-grid', 'sky-grid-strong', 'sky-sun',
      'sky-earth', 'sky-terrain', 'sky-terrain-line',
    ]) {
      expect(t[key], key).toBeDefined()
    }
  })

  it('uses the agreed paper values and no pure white', () => {
    for (const key of ['bg-base', 'bg-surface', 'bg-elevated', 'bg-field', 'bg-toggle-on']) expect(t[key], key).toBe('#faf9f5')
    expect(t['bg-raised']).toBe('#f0eee6')
    expect(t['bg-selected']).toBe('#e8e6dc')
    expect(t['bg-pressed']).toBe('#e8e6dc')
    expect(Object.values(t).filter((v) => v === '#ffffff')).toEqual([])
  })

  it('keeps primary text at 7:1 on every surface and well', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-toggle-on', 'bg-selected', 'bg-pressed']) {
      expect(ratio(at('label'), at(bg)), bg).toBeGreaterThanOrEqual(7)
    }
  })

  it('keeps secondary text at 4.5:1 on paper, on the wells and when selected', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-selected', 'bg-pressed']) {
      expect(ratio(at('label-2'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps tertiary text at 4.5:1 on paper and on the wells', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised']) expect(ratio(at('label-3'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps control borders at 3:1 against paper and the wells', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised']) expect(ratio(at('control-border'), at(bg)), bg).toBeGreaterThanOrEqual(3)
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

  it('keeps the accent visible as a mark and readable as button and link text', () => {
    for (const bg of ['bg-base', 'bg-elevated']) expect(ratio(at('accent'), at(bg)), bg).toBeGreaterThanOrEqual(3)
    expect(ratio(at('on-accent'), at('accent'))).toBeGreaterThanOrEqual(4.5)
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-selected']) {
      expect(ratio(at('accent-text'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps error text at 4.5:1 on paper and on the wells', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised']) expect(ratio(at('bad'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps hairlines visible on paper', () => {
    expect(ratio(at('line'), at('bg-base'))).toBeGreaterThan(1.3)
    expect(ratio(at('line-strong'), at('bg-base'))).toBeGreaterThan(ratio(at('line'), at('bg-base')))
  })

  it('does not lift elevated surfaces above paper', () => {
    expect(luminance(at('bg-elevated'))).toBeLessThanOrEqual(luminance(at('bg-base')))
  })
})

describe('sky and panorama tokens on paper', () => {
  const sky = () => at('sky-bg')
  const relief = () => at('sky-terrain')

  it('keeps text at 7:1 and secondary text at 4.5:1 on the sky and on the relief', () => {
    expect(ratio(at('sky-text'), sky())).toBeGreaterThanOrEqual(7)
    expect(ratio(at('sky-text'), relief())).toBeGreaterThanOrEqual(7)
    expect(ratio(at('sky-text-2'), sky())).toBeGreaterThanOrEqual(4.5)
    expect(ratio(at('sky-text-2'), relief())).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the sky on the paper ink and the accent readable as text on the sky', () => {
    expect(ratio(at('accent-text'), sky())).toBeGreaterThanOrEqual(4.5)
    expect(ratio(at('label'), sky())).toBeGreaterThanOrEqual(7)
  })

  it('keeps the Sun and the Earth at 3:1 on the sky and on the relief', () => {
    for (const color of ['sky-sun', 'sky-earth']) {
      expect(ratio(at(color), sky()), `${color} on sky`).toBeGreaterThanOrEqual(3)
      expect(ratio(at(color), relief()), `${color} on relief`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the relief outline at 3:1 on the sky and on the relief fill', () => {
    expect(ratio(at('sky-terrain-line'), sky())).toBeGreaterThanOrEqual(3)
    expect(ratio(at('sky-terrain-line'), relief())).toBeGreaterThanOrEqual(3)
  })

  it('draws the grid in ink at 10-25 % and keeps it visible against the sky and the relief', () => {
    for (const key of ['sky-grid', 'sky-grid-strong']) {
      const alpha = Number(/,\s*([\d.]+)\)$/.exec(t[key] as string)?.[1])
      expect(alpha, key).toBeGreaterThanOrEqual(0.1)
      expect(alpha, key).toBeLessThanOrEqual(0.25)
      expect(t[key], key).toMatch(/^rgba\(20,\s*20,\s*19,/)
    }
    // La retícula es decorativa (WCAG 1.4.11 la exime del 3:1): se exige que se distinga y que la fuerte pese más.
    for (const over of [sky(), relief()]) {
      expect(ratio(at('sky-grid', over), over)).toBeGreaterThanOrEqual(1.2)
      expect(ratio(at('sky-grid-strong', over), over)).toBeGreaterThan(ratio(at('sky-grid', over), over))
    }
  })

  it('makes the relief a toasted paper tone, darker than the sky and lighter than its outline', () => {
    expect(luminance(relief())).toBeLessThan(luminance(sky()))
    expect(luminance(relief())).toBeGreaterThan(luminance(at('sky-terrain-line')))
  })

  it('keeps the Earth at the agreed blue', () => {
    expect(t['sky-earth']).toBe('#2a78d6')
    expect(t['earth']).toBe('#2a78d6')
  })
})
