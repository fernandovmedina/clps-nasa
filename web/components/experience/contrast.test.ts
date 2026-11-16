// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { palette, type PaletteKey } from '@/lib/ui/palette'

/** Luminancia relativa WCAG 2.x de un color #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(fg: PaletteKey, bg: PaletteKey): number {
  const [hi, lo] = [luminance(palette[fg]), luminance(palette[bg])].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('contraste de la experiencia en papel (WCAG AA)', () => {
  // Texto: 4.5:1. Cada par es un uso real en components/experience/*.module.css.
  const text: Array<[string, PaletteKey, PaletteKey]> = [
    ['texto de paneles y diálogos', 'label', 'bg-surface'],
    ['texto secundario de paneles', 'label-2', 'bg-surface'],
    ['texto terciario de paneles', 'label-3', 'bg-surface'],
    ['texto secundario sobre el pozo', 'label-2', 'bg-raised'],
    ['texto terciario sobre el pozo', 'label-3', 'bg-raised'],
    ['texto secundario sobre la fila seleccionada', 'label-2', 'bg-selected'],
    ['texto de la fila seleccionada', 'label', 'bg-selected'],
    ['texto de campos', 'label', 'bg-field'],
    ['etiqueta de ejemplo y código en arcilla sobre papel', 'accent-text', 'bg-surface'],
    ['arcilla sobre el pozo', 'accent-text', 'bg-raised'],
    ['arcilla sobre la fila seleccionada', 'accent-text', 'bg-selected'],
    ['error sobre papel', 'bad', 'bg-surface'],
    ['Sol (marcador y texto) sobre papel', 'sun', 'bg-surface'],
    ['botón arcilla (CTA): tinta sobre arcilla', 'on-accent', 'accent'],
    ['botón primario: papel sobre tinta', 'bg-surface', 'label'],
    ['chip viable', 'on-status', 'viable-bg'],
    ['chip marginal', 'on-status', 'marginal-bg'],
    ['chip no viable', 'on-status', 'bad-bg'],
  ]
  it.each(text)('%s llega a 4.5:1', (_name, fg, bg) => {
    expect(ratio(fg, bg), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5)
  })

  // Gráficos y bordes de control: 3:1.
  const graphics: Array<[string, PaletteKey, PaletteKey]> = [
    ['borde de botones y campos', 'control-border', 'bg-field'],
    ['icono viable', 'viable', 'bg-surface'],
    ['icono marginal', 'marginal', 'bg-surface'],
    ['icono no viable', 'bad', 'bg-surface'],
    ['marcador de la Tierra', 'earth', 'bg-surface'],
    ['punto de estado sin conexión', 'idle', 'bg-surface'],
  ]
  it.each(graphics)('%s llega a 3:1', (_name, fg, bg) => {
    expect(ratio(fg, bg), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(3)
  })

  // Los iconos de estado se pintan sobre papel, sobre el pozo y sobre la fila seleccionada del ranking: 3:1 en los tres.
  const iconSource = readFileSync(fileURLToPath(new URL('./icons.tsx', import.meta.url)), 'utf8')
  const iconColors = [...iconSource.matchAll(/(viable|marginal|not_viable): 'var\(--([\w-]+)\)'/g)].map((m) => [m[1]!, m[2] as PaletteKey] as const)

  it('lee los tres colores de estado de icons.tsx', () => {
    expect(iconColors.map(([status]) => status)).toEqual(['viable', 'marginal', 'not_viable'])
  })
  it.each(iconColors.flatMap(([status, key]) => (['bg-surface', 'bg-raised', 'bg-selected'] as const).map((bg) => [status, key, bg] as const)))(
    'el icono %s (%s) sobre %s llega a 3:1',
    (_status, key, bg) => {
      expect(ratio(key, bg), `${key} sobre ${bg}`).toBeGreaterThanOrEqual(3)
    },
  )

  it('los paneles son opacos: papel sin transparencia', () => {
    for (const key of ['bg-base', 'bg-surface', 'bg-elevated', 'bg-field'] as const) expect(palette[key]).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
