// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { palette } from './palette'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tokensCss = read('../../styles/tokens.css')

function rootTokens(css: string): Record<string, string> {
  const start = css.indexOf(':root {')
  expect(start, ':root block').toBeGreaterThanOrEqual(0)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).replace(/\s+/g, '').toLowerCase()
  return out
}

const normalize = (v: string) => v.replace(/\s+/g, '').toLowerCase()

describe('palette.ts', () => {
  const css = rootTokens(tokensCss)

  it('has the same keys as the :root block of tokens.css', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(css).sort())
  })

  it('matches tokens.css value for value', () => {
    for (const [key, value] of Object.entries(palette)) expect(normalize(value), key).toBe(css[key])
  })

  it('declares a light colour scheme and no pure white', () => {
    expect(tokensCss).toMatch(/color-scheme:\s*light\s*;/)
    expect(tokensCss.toLowerCase()).not.toContain('#ffffff')
    expect(tokensCss.toLowerCase()).not.toContain('#fff;')
  })

  it('leaves no dark theme selector in the stylesheets', () => {
    for (const rel of ['../../styles/tokens.css', '../../control/styles/globals.css', '../../app/globals.css']) {
      expect(read(rel), rel).not.toMatch(/data-theme/)
    }
  })
})
