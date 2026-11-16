// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentsDir = fileURLToPath(new URL('..', import.meta.url))
const tokensCss = readFileSync(fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)), 'utf8')
const globalsCss = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sources(full)
    return /\.(css|tsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
  })
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const files = sources(componentsDir)
const tokenNames = new Set([...tokensCss.matchAll(/--([\w-]+):/g)].map((m) => m[1]))

describe('components/** usa solo los tokens del papel', () => {
  it('encuentra los archivos a revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files.map((f) => [f.slice(componentsDir.length), f] as const))('%s no escribe colores a mano', (_rel, file) => {
    const lines = readFileSync(file, 'utf8').split('\n')
    const hits = lines.map((l, i) => (COLOR.test(l) ? `${i + 1}: ${l.trim()}` : '')).filter(Boolean)
    expect(hits).toEqual([])
  })

  it('cada var(--x) de los CSS de la experiencia existe en tokens.css o es una variable de forma (sombra, radio, relleno) definida en components/**', () => {
    const cssFiles = files.filter((f) => f.endsWith('.css'))
    const shape = new Set(cssFiles.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!.slice(2))))
    const missing: string[] = []
    for (const file of cssFiles) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\(--([\w-]+)/g)) {
        if (!tokenNames.has(m[1]!) && !shape.has(m[1]!)) missing.push(`${file.slice(componentsDir.length)}: --${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('los paneles no usan desenfoque ni transparencia de fondo', () => {
    for (const file of files.filter((f) => f.endsWith('.css'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/backdrop-filter/)
    }
  })

  it('globals.css hereda tinta, no papel, como color de texto', () => {
    expect(globalsCss).toMatch(/color:\s*var\(--label\)/)
    expect(globalsCss).not.toMatch(/#FAF9F5/i)
  })
})
