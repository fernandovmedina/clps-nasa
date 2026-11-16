// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HudRankRow } from '@/lib/engine/hud'
import SidePanel from './SidePanel'

afterEach(cleanup)

type Row = HudRankRow & { note?: string; demo?: boolean }

const row = (over: Partial<Row>): Row => ({ id: 'a', rank: 1, name: 'Sitio', score: 80, status: 'viable', selected: false, ...over })

function renderRanking(rows: Row[]) {
  render(<SidePanel side={{ kind: 'ranking', title: 'Sitios candidatos', rows }} frozen={false} onAct={vi.fn()} />)
  return within(screen.getByRole('list', { name: 'Ranking de sitios' })).getAllByRole('listitem')
}

describe('SidePanel: ranking', () => {
  it('la fila de NO CAER muestra «Demo · falla simulada del motor» en vez del puntaje 0 y del icono de no viable', () => {
    const [item] = renderRanking([row({ id: 'no-caer', name: 'NO CAER', score: 0, status: 'not_viable', demo: true, note: 'Caso de demostración · falla simulada del motor' })])
    expect(within(item!).getByText('Demo · falla simulada del motor')).toBeTruthy()
    expect(within(item!).queryByText('0')).toBeNull()
    expect(within(item!).queryByRole('img', { name: 'No viable' })).toBeNull()
  })

  it('un sitio de contraste muestra su etiqueta y conserva puntaje e icono', () => {
    const [item] = renderRanking([row({ name: 'Ecuador', score: 41, status: 'marginal', note: 'Contraste · ecuatorial' })])
    expect(within(item!).getByText('Contraste · ecuatorial')).toBeTruthy()
    expect(within(item!).getByText('41')).toBeTruthy()
    expect(within(item!).getByRole('img', { name: 'Marginal' })).toBeTruthy()
  })

  it('un sitio normal no muestra ninguna etiqueta extra', () => {
    const [item] = renderRanking([row({ name: 'Shackleton', score: 95 })])
    expect(item!.textContent).not.toMatch(/Demo|Contraste/)
    expect(within(item!).getByText('95')).toBeTruthy()
  })
})

describe('SidePanel: datos de la fase', () => {
  const css = readFileSync(join(process.cwd(), 'components/experience/MissionLayer.module.css'), 'utf8')
  const rule = (selector: string) => css.split('\n').find((l) => l.trimStart().startsWith(selector)) ?? ''

  it('cada valor va en una sola línea (sin partirse), por ejemplo «−149 °C»', () => {
    render(<SidePanel side={{ kind: 'readouts', items: [{ label: 'Temperatura', value: '−149 °C' }] }} frozen={false} onAct={vi.fn()} />)
    expect(screen.getByText('−149 °C').tagName).toBe('DD')
    expect(rule('.readout dd {')).toMatch(/white-space:\s*nowrap/)
  })

  it('en las lecturas extra del sitio el valor no parte línea y la etiqueta ocupa el resto de la fila', () => {
    render(<SidePanel side={{ kind: 'sky', blocks: [], extras: [{ label: 'Temperatura (estimación simplificada)', value: '−149 °C' }] }} frozen={false} onAct={vi.fn()} />)
    expect(screen.getByText('−149 °C').tagName).toBe('DD')
    expect(rule('.extras dd {')).toMatch(/white-space:\s*nowrap/)
    expect(rule('.extras dt {')).toMatch(/flex:\s*1 1 auto/)
  })

  it('la etiqueta ocupa una sola columna, también sin partirse', () => {
    expect(rule('.readout dt {')).toMatch(/white-space:\s*nowrap/)
  })
})
