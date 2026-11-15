import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const OPTIONAL_TEXTURES = ['/textures/moon/general.jpg', '/textures/moon/north-pole.jpg', '/textures/moon/south-pole.jpg']
const LAYER = '[data-mode]'

async function hasWebGL(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  })
}

const figure = (page: Page) => page.getByTestId('figure')
const currentStep = (page: Page) => page.locator('[aria-current="step"]')
const start = (page: Page) => page.getByRole('button', { name: 'Comenzar despegue' })

async function openLaunch(page: Page, query = '') {
  await page.goto(`/${query}`)
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await expect(page.getByRole('list', { name: 'Fases de la misión' })).toBeVisible()
  await expect(start(page)).toBeVisible()
}

async function reachOrbit(page: Page) {
  await start(page).click()
  await expect(currentStep(page)).toContainText('Órbita y ranking', { timeout: 150_000 })
  await expect(page.getByRole('button', { name: 'Preconfirmar punto' })).toBeEnabled({ timeout: 120_000 })
}

test('the team experience mounts its canvas at / without console errors and links to Mission Control', async ({ page }) => {
  const errors: string[] = []
  const failed: string[] = []
  page.on('console', (m) => {
    const text = m.text()
    const expected = text.startsWith('Failed to load resource') || text.startsWith('WebSocket connection to')
    if (m.type() === 'error' && !expected) errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(new URL(r.url()).pathname)
  })

  const shownError = page.getByRole('alert').filter({ hasText: /\S/ })

  await page.goto('/')
  const webgl = await hasWebGL(page)
  test.info().annotations.push({ type: 'webgl', description: webgl ? 'available' : 'unavailable' })

  if (webgl) {
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Fases de la misión' })).toBeVisible()
    await expect(currentStep(page)).toContainText('Despegue')
    await expect(page.getByRole('link', { name: 'Mission Control' })).toHaveAttribute('href', '/mission-control/')
    await page.waitForTimeout(1500)
    await expect(shownError).toHaveCount(0)
    expect(errors).toEqual([])
  } else {
    await expect(shownError).toContainText(/webgl/i)
  }
  expect(failed.filter((path) => !OPTIONAL_TEXTURES.includes(path))).toEqual([])

  const link = page.getByRole('link', { name: 'Cambiar fecha o sitio' })
  await expect(link).toHaveAttribute('href', '/mission-control/')
  await link.click()
  await expect(page).toHaveURL(/\/mission-control\/(\?.*)?$/)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
})

test('the launch waits for its start button and Pausar has nothing to pause until then', async ({ page }) => {
  await openLaunch(page, '?speed=4')
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeDisabled()
  const before = await figure(page).textContent()
  await page.waitForTimeout(2500)
  expect(await figure(page).textContent()).not.toMatch(/^T/)
  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeEnabled()
  expect(before).toBeTruthy()
})

test('Pausar freezes the big figure for three seconds and Reanudar makes it move again', async ({ page }) => {
  test.setTimeout(120_000)
  await openLaunch(page, '?speed=4')
  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })

  await page.getByRole('button', { name: 'Pausar' }).click()
  await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible()
  await expect(page.getByText('En pausa', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Simulación pausada.')

  const frozen = await figure(page).textContent()
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)
    expect(await figure(page).textContent()).toBe(frozen)
  }

  await page.getByRole('button', { name: 'Reanudar' }).click()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await expect.poll(() => figure(page).textContent(), { timeout: 60_000 }).not.toBe(frozen)
})

test('Detener shows the stopped card and Reiniciar desde el despegue goes back to a waiting launch', async ({ page }) => {
  test.setTimeout(120_000)
  await openLaunch(page, '?speed=4&landing=2027-01-24T12:00:00Z&site=malapert-a')
  await expect(page.getByText('Aterrizaje 24 ene 2027 · 12:00 UTC')).toBeVisible()
  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })

  await page.getByRole('button', { name: 'Detener' }).click()
  await expect(page.getByRole('heading', { name: 'Misión detenida' })).toBeVisible()
  await expect(currentStep(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a Mission Control' })).toHaveAttribute('href', '/mission-control/')
  const restart = page.getByRole('button', { name: 'Reiniciar desde el despegue' })
  await expect(restart).toBeFocused()

  await restart.click()
  await expect(page.getByRole('heading', { name: 'Misión detenida' })).toHaveCount(0)
  await expect(currentStep(page)).toContainText('Despegue')
  await expect(start(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeDisabled()
  await expect(page.getByText('Aterrizaje 24 ene 2027 · 12:00 UTC')).toBeVisible()
  await expect(page.getByText('Malapert A (IM-1 Odysseus)')).toBeVisible({ timeout: 60_000 })
})

test('in the orbit, choosing another site in the list changes the big figure and the mission block; axe passes', async ({ page }) => {
  test.setTimeout(300_000)
  await openLaunch(page, '?speed=20')
  await reachOrbit(page)

  const ranking = page.getByRole('list', { name: 'Ranking de sitios' })
  const rows = ranking.getByRole('button')
  await expect(rows).toHaveCount(10)
  const pressed = await rows.evaluateAll((all) => all.findIndex((b) => b.getAttribute('aria-pressed') === 'true'))
  const target = rows.nth(pressed === 0 ? 1 : 0)
  const name = (await target.locator('span').nth(1).textContent()) ?? ''
  const score = (await target.locator('span').nth(2).textContent()) ?? ''
  const before = await figure(page).textContent()

  await target.click()
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await expect(figure(page)).toHaveText(score)
  expect(score).not.toBe(before)
  await expect(page.getByText(`de 100 · ${name}`)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Misión' }).getByText(name, { exact: true })).toBeVisible()

  const result = await new AxeBuilder({ page }).include(LAYER).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

  await page.getByRole('button', { name: 'Detener' }).click()
  await expect(page.getByRole('heading', { name: 'Misión detenida' })).toBeVisible()
  const stopped = await new AxeBuilder({ page }).include(LAYER).analyze()
  expect(stopped.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})

test('once the data is loaded, a paused mission does not make React render: no commits in five seconds', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
    w.__commits = 0
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onScheduleFiberRoot() {},
      onCommitFiberRoot: () => { w.__commits++ },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    }
  })
  await openLaunch(page, '?speed=4')
  await expect(page.getByText('Aterrizaje 10 ene 2027 · 00:00 UTC')).toBeVisible({ timeout: 90_000 })
  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Pausar' }).click()
  await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible()
  await page.waitForTimeout(1000)
  const commits = () => page.evaluate(() => (window as unknown as { __commits: number }).__commits)
  const before = await commits()
  await page.waitForTimeout(5000)
  const after = await commits()
  test.info().annotations.push({ type: 'commits-in-5s', description: `${after - before} (total ${after})` })
  expect(before).toBeGreaterThan(0)
  expect(after - before).toBe(0)
})

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('there is no horizontal scroll, touch targets are 44 px and the centre of the scene stays free', async ({ page }) => {
    test.setTimeout(120_000)
    await openLaunch(page, '?speed=4')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    const small = await page.evaluate((selector) => {
      const layer = document.querySelector(selector)!
      const bad: string[] = []
      for (const el of layer.querySelectorAll<HTMLElement>('button, a, summary')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        if (box.height < 43.5 || box.width < 43.5) bad.push(`${el.tagName} "${el.textContent?.trim()}" ${Math.round(box.width)}x${Math.round(box.height)}`)
      }
      return bad
    }, LAYER)
    expect(small).toEqual([])

    const overflow = await page.evaluate((selector) => {
      const layer = document.querySelector(selector)!
      const bad: string[] = []
      for (const el of layer.querySelectorAll<HTMLElement>('header, section, ol, dl, div[role="group"]')) {
        const box = el.getBoundingClientRect()
        if (box.width > 0 && (box.left < -0.5 || box.right > window.innerWidth + 0.5)) bad.push(`${el.tagName}.${el.className} ${Math.round(box.left)}..${Math.round(box.right)}`)
      }
      return bad
    }, LAYER)
    expect(overflow).toEqual([])

    const gap = await page.evaluate(() => {
      const rail = document.querySelector('ol[aria-label="Fases de la misión"]')!.parentElement!.getBoundingClientRect()
      const status = document.querySelector('section[aria-label="Estado de la fase"]')!.getBoundingClientRect()
      return { top: rail.bottom, bottom: status.top }
    })
    expect(gap.bottom - gap.top).toBeGreaterThan(250)

    await start(page).click()
    await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Pausar' }).click()
    await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('in the orbit the ranking becomes its own scrolling row, without widening the page', async ({ page }) => {
    test.setTimeout(300_000)
    await openLaunch(page, '?speed=20')
    await reachOrbit(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const ranking = page.getByRole('list', { name: 'Ranking de sitios' })
    const scrolls = await ranking.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(scrolls).toBe(true)
    const box = await ranking.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390.5)
  })
})
