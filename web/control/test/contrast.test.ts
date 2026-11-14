// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../styles/globals.css', import.meta.url)), 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
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

const themes = { dark: tokens(':root'), light: tokens(":root[data-theme='light']") }

describe.each(Object.entries(themes))('%s theme tokens', (_name, t) => {
  const at = (key: string) => t[key] as string

  it('defines every token the checks rely on', () => {
    for (const key of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field', 'bg-pressed', 'label', 'label-2', 'line-strong', 'sun', 'earth', 'both', 'viable', 'marginal', 'bad', 'on-status']) {
      expect(t[key], key).toBeDefined()
    }
  })

  it('keeps primary text at 7:1 on every surface', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field']) {
      expect(ratio(at('label'), at(bg)), bg).toBeGreaterThanOrEqual(7)
    }
  })

  it('keeps button text at 7:1 on the pressed background', () => {
    expect(ratio(at('label'), at('bg-pressed'))).toBeGreaterThanOrEqual(7)
  })

  it('keeps secondary text at 4.5:1 on every surface', () => {
    for (const bg of ['bg-base', 'bg-elevated', 'bg-raised', 'bg-field']) {
      expect(ratio(at('label-2'), at(bg)), bg).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps control borders at 3:1 against the surfaces they sit on', () => {
    for (const bg of ['bg-base', 'bg-elevated']) {
      expect(ratio(at('line-strong'), at(bg)), bg).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps status labels readable on their solid fill', () => {
    for (const status of ['viable', 'marginal', 'bad']) {
      expect(ratio(at('on-status'), at(status)), status).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps chart colours at 3:1 on the chart background and card', () => {
    for (const color of ['sun', 'earth', 'both', 'marginal', 'bad']) {
      for (const bg of ['bg-field', 'bg-elevated']) expect(ratio(at(color), at(bg)), `${color} on ${bg}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps error text at 4.5:1 on the page background', () => {
    expect(ratio(at('bad'), at('bg-base'))).toBeGreaterThanOrEqual(4.5)
  })

  it('makes elevated surfaces lighter than the base in dark mode only', () => {
    const lift = luminance(at('bg-elevated')) - luminance(at('bg-base'))
    if (_name === 'dark') expect(lift).toBeGreaterThan(0)
    else expect(lift).toBeGreaterThanOrEqual(0)
  })
})
