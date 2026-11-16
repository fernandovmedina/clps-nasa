import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { CAPCOM_ACCESS_EXPIRES_AT } from '../lib/capcom/config'

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

const planner = (page: Page) => page.getByRole('dialog', { name: 'Planifica tu lanzamiento' })
const followDialog = (page: Page) => page.getByRole('dialog', { name: 'Seguir una misión' })

/** The crew's first screen: confirms the plan as it is once the mission data is in, so the launch can begin. */
async function confirmPlan(page: Page) {
  const dialog = planner(page)
  await expect(dialog).toBeVisible()
  const confirm = dialog.getByRole('button', { name: 'Confirmar lanzamiento' })
  await expect(confirm).toBeEnabled({ timeout: 60_000 })
  await confirm.click()
  await expect(dialog).toHaveCount(0)
}

/**
 * The Burrito espacial's welcome gate, shown on every full load of `/` unless `?phase=` skips it. It greets by voice
 * first (or waits for a tap when the browser blocks audio); Saltar, there until the question is up, goes straight to it.
 * The headless browser has no immersive-vr, so the main action is «Explorar la misión», the desktop route.
 */
async function chooseRole(page: Page, role: 'vr' | 'monitor' = 'vr') {
  const target = page.getByRole('button', { name: role === 'vr' ? 'Explorar la misión' : 'Seguir la misión de alguien (con código)' })
  const skip = page.getByRole('button', { name: 'Saltar' })
  await expect(skip.or(target).first()).toBeVisible({ timeout: 30_000 })
  await skip.click({ timeout: 2000 }).catch(() => {})
  await target.click()
}

async function openLaunch(page: Page, query = '', role: 'vr' | 'monitor' = 'vr') {
  await page.goto(`/${query}`)
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  if (!query.includes('phase=')) await chooseRole(page, role)
  await expect(page.getByRole('list', { name: 'Fases de la misión' })).toBeVisible()
  await confirmPlan(page)
  await expect(start(page)).toBeEnabled({ timeout: 30_000 })
}

async function reachOrbit(page: Page) {
  await start(page).click()
  await expect(currentStep(page)).toContainText('Órbita y ranking', { timeout: 150_000 })
  await expect(page.getByRole('button', { name: 'Preconfirmar punto' })).toBeEnabled({ timeout: 120_000 })
}

test('the team experience mounts its canvas at / without console errors and offers the site analysis and following a mission', async ({ page }) => {
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
  await chooseRole(page, 'vr')
  const webgl = await hasWebGL(page)
  test.info().annotations.push({ type: 'webgl', description: webgl ? 'available' : 'unavailable' })

  if (webgl) {
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Fases de la misión' })).toBeVisible()
    await expect(currentStep(page)).toContainText('Despegue')
    await expect(page.getByRole('button', { name: 'Seguir la misión', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Seguir la misión', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'TOUCHDOWN' })).toHaveCount(1)
    await expect(page.getByText('La misión, paso a paso')).toHaveCount(0)
    await page.waitForTimeout(1500)
    await expect(shownError).toHaveCount(0)
    expect(errors).toEqual([])
  } else {
    await expect(shownError).toContainText(/webgl/i)
  }
  expect(failed.filter((path) => !OPTIONAL_TEXTURES.includes(path))).toEqual([])

  const link = planner(page).getByRole('link', { name: 'Análisis detallado de sitios y fechas' })
  await expect(link).toHaveAttribute('href', '/mission-control/?s=malapert-a~2027-01-10T00:00Z~14&s=mons-mouton~2027-01-10T00:00Z~14')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await page.goto('/mission-control/')
  await expect(page).toHaveURL(/\/mission-control\/(\?.*)?$/)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
})

test('a judge alone on desktop, without XR, reaches the orbit with one obvious click and no code', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => { Object.defineProperty(navigator, 'xr', { configurable: true, value: undefined }) })
  await page.goto('/?speed=20')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')

  const explore = page.getByRole('button', { name: 'Explorar la misión', exact: true })
  const skip = page.getByRole('button', { name: 'Saltar' })
  await expect(skip.or(explore).first()).toBeVisible({ timeout: 30_000 })
  await skip.click({ timeout: 2000 }).catch(() => {})
  const welcome = page.getByRole('dialog', { name: 'Bienvenido a TOUCHDOWN' })
  await expect(explore).toBeVisible()
  await expect(welcome.getByText('Compara sitios y fechas de alunizaje en el polo sur con datos reales de NASA')).toBeVisible()
  await expect(welcome.getByText('Para VR, ábrelo en el navegador del Meta Quest')).toBeVisible()
  await expect(welcome.getByRole('button', { name: 'Entrar en VR' })).toHaveCount(0)
  await expect(welcome.getByRole('link', { name: 'Análisis de sitios y fechas' })).toHaveAttribute('href', '/mission-control/')
  await expect(welcome.getByRole('textbox')).toHaveCount(0)
  await explore.click()

  await confirmPlan(page)
  await expect(start(page)).toBeEnabled({ timeout: 30_000 })
  await reachOrbit(page)
  await expect(followDialog(page)).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
})

test('the follow dialog opened from the welcome sends someone without a code to the planner with «Explora la misión tú mismo»', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await chooseRole(page, 'monitor')
  const dialog = followDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Lo muestra la pantalla de quien despega, en el panel de su misión, como «Código de seguimiento».')).toBeVisible()
  await dialog.getByRole('button', { name: 'Explora la misión tú mismo' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(planner(page)).toBeVisible()
})

test('?vr=preview shows the VR interface without the DOM control layer and without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    const text = m.text()
    const expected = text.startsWith('Failed to load resource') || text.startsWith('WebSocket connection to')
    if (m.type() === 'error' && !expected) errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?phase=landing&vr=preview&speed=2')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.waitForTimeout(3000)
  await expect(page.locator(LAYER)).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Fases de la misión' })).toHaveCount(0)
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('without ?vr=preview the landing keeps the DOM control layer', async ({ page }) => {
  await page.goto('/?phase=landing&speed=2')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.locator(LAYER)).toHaveCount(1)
  await expect(currentStep(page)).toContainText('Alunizaje', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeEnabled()
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
  test.setTimeout(300_000)
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
  test.setTimeout(300_000)
  await openLaunch(page, '?speed=4&landing=2027-01-24T12:00:00Z&site=malapert-a')
  await expect(page.getByText('Llegada 24 ene 2027 · 12:00 UTC')).toBeVisible()
  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })

  await page.getByRole('button', { name: 'Detener' }).click()
  await expect(page.getByRole('heading', { name: 'Misión detenida' })).toBeVisible()
  await expect(currentStep(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Misión detenida' }).getByRole('link', { name: 'Análisis de sitios y fechas' })).toHaveAttribute(
    'href',
    '/mission-control/?s=malapert-a~2027-01-24T12:00Z~14&s=mons-mouton~2027-01-24T12:00Z~14',
  )
  const restart = page.getByRole('button', { name: 'Reiniciar desde el despegue' })
  await expect(restart).toBeFocused()

  await restart.click()
  await expect(page.getByRole('heading', { name: 'Misión detenida' })).toHaveCount(0)
  await expect(currentStep(page)).toContainText('Despegue')
  await expect(start(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeDisabled()
  await expect(page.getByText('Llegada 24 ene 2027 · 12:00 UTC')).toBeVisible()
  await expect(page.getByText('Malapert A (IM-1 Odysseus)', { exact: true })).toBeVisible({ timeout: 60_000 })
})

test('in the orbit, choosing another site in the list changes the big figure and the mission block; axe passes', async ({ page }) => {
  test.setTimeout(300_000)
  await openLaunch(page, '?speed=20')
  await reachOrbit(page)

  const ranking = page.getByRole('list', { name: 'Ranking de sitios' })
  const rows = ranking.getByRole('button')
  // 10 sitios reales + el caso de demostración "NO CAER" (sites.ts).
  await expect(rows).toHaveCount(11)
  const pressed = await rows.evaluateAll((all) => all.findIndex((b) => b.getAttribute('aria-pressed') === 'true'))
  const target = rows.nth(pressed === 0 ? 1 : 0)
  // Fila: rank · [nombre + etiqueta de contraste, si la hay] · (delta) · puntaje. El nombre es el tercer span y el puntaje el último.
  const name = (await target.locator('span').nth(2).textContent()) ?? ''
  const score = (await target.locator('span').last().textContent()) ?? ''
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
  test.setTimeout(300_000)
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
  await expect(page.getByText('Llegada 10 ene 2027 · 00:00 UTC')).toBeVisible({ timeout: 90_000 })
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
    test.setTimeout(300_000)
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

const roomCode = (page: Page) => page.getByTestId('room-code')
const roomInUrl = (page: Page) => new URL(page.url()).searchParams.get('room')
const followPill = (page: Page) => page.getByText(/Mission Control · siguiendo la misión/)

async function openRoom(page: Page, query = '', role: 'vr' | 'monitor' = 'vr') {
  await page.setViewportSize({ width: 640, height: 480 })
  await page.goto(`/${query}`)
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await chooseRole(page, role)
  await expect(roomCode(page)).toHaveText(/^[A-Za-z0-9_-]{4,64}$/, { timeout: 30_000 })
}

async function expectRole(page: Page, role: 'host' | 'monitor') {
  await expect(followPill(page)).toHaveCount(role === 'monitor' ? 1 : 0)
  // The planner (open at first) has its own «Código de seguimiento» heading: the mission block's label is the one that tells the role.
  await expect(page.getByRole('region', { name: 'Misión' }).getByText('Código de seguimiento', { exact: true })).toHaveCount(role === 'host' ? 1 : 0)
  await expect(page.getByRole('region', { name: role === 'host' ? 'Misión' : 'Misión que sigues' })).toBeVisible()
}

async function goThroughMissionControl(page: Page, role: 'vr' | 'monitor' = 'vr') {
  await page.goto('/mission-control/')
  const card = page.getByTestId('scenario-card').first()
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('link', { name: 'Lanzar misión con esta fecha' }).click()
  await expect(page).toHaveURL(/\/\?landing=/)
  expect(new URL(page.url()).searchParams.get('landing')).toBe('2027-01-10T00:00:00Z')
  // The link navigates back to `/` as a fresh load, so the Burrito espacial asks again.
  await chooseRole(page, role)
}

async function followFromDialog(page: Page, code: string) {
  await page.getByRole('button', { name: 'Seguir la misión', exact: true }).click()
  const dialog = followDialog(page)
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Código de seguimiento').fill(code)
  await dialog.getByRole('button', { name: 'Conectar' }).click()
  return dialog
}

test('the host keeps the room and the host role after reloading', async ({ page }) => {
  test.setTimeout(300_000)
  await openRoom(page)
  const code = (await roomCode(page).textContent()) ?? ''
  expect(roomInUrl(page)).toBe(code)
  await expectRole(page, 'host')

  await page.reload()
  await chooseRole(page, 'vr')
  await expect(roomCode(page)).toHaveText(code, { timeout: 30_000 })
  expect(roomInUrl(page)).toBe(code)
  await expectRole(page, 'host')
})

test('the host keeps the room and the host role after going through Mission Control and launching the mission', async ({ page }) => {
  test.setTimeout(180_000)
  await openRoom(page)
  const code = (await roomCode(page).textContent()) ?? ''
  await goThroughMissionControl(page)
  await expect(roomCode(page)).toHaveText(code, { timeout: 30_000 })
  expect(roomInUrl(page)).toBe(code)
  await expectRole(page, 'host')
})

test('a monitor keeps the room and the monitor role after going through Mission Control and launching the mission', async ({ page }) => {
  test.setTimeout(180_000)
  await openRoom(page, '?room=ZZZZ', 'monitor')
  await expect(roomCode(page)).toHaveText('ZZZZ')
  await expectRole(page, 'monitor')
  await goThroughMissionControl(page, 'monitor')
  await expect(roomCode(page)).toHaveText('ZZZZ', { timeout: 30_000 })
  expect(roomInUrl(page)).toBe('ZZZZ')
  await expectRole(page, 'monitor')
})

test('opening a shared link in a fresh browser context makes a monitor of that room, with no planner', async ({ browser }) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'es-MX', colorScheme: 'dark', viewport: { width: 1440, height: 900 } })
  try {
    const page = await context.newPage()
    await openRoom(page, '?room=ZZZZ', 'monitor')
    await expect(roomCode(page)).toHaveText('ZZZZ')
    expect(roomInUrl(page)).toBe('ZZZZ')
    await expectRole(page, 'monitor')
    await expect(planner(page)).toHaveCount(0)
    await expect(page.getByTestId('figure')).toHaveText('En espera')
    await expect(page.getByRole('button', { name: 'Comenzar despegue' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('as host, following an invalid code or the own room shows an error and changes nothing', async ({ page }) => {
  test.setTimeout(360_000)
  await openRoom(page)
  const code = (await roomCode(page).textContent()) ?? ''
  await page.getByRole('button', { name: 'Seguir la misión', exact: true }).click()
  const dialog = followDialog(page)
  const field = dialog.getByLabel('Código de seguimiento')
  const alert = dialog.getByRole('alert')

  for (const [typed, message] of [['AB CD', 'Código no válido'], ['AB.CD', 'Código no válido'], [code, 'Ya estás en esa sala']]) {
    await field.fill(typed!)
    await dialog.getByRole('button', { name: 'Conectar' }).click()
    await expect(alert).toHaveText(message!)
    await expect(field).toBeVisible()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription(message!)
    expect(roomInUrl(page)).toBe(code)
  }

  await field.fill('QRST')
  await expect(alert).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(roomCode(page)).toHaveText(code)
  await expectRole(page, 'host')
})

test('following another room makes a monitor and it stays one after a reload; Salir gives a new code back', async ({ page }) => {
  test.setTimeout(360_000)
  await openRoom(page)
  const own = (await roomCode(page).textContent()) ?? ''
  await followFromDialog(page, 'QRST')
  await expect(followDialog(page)).toHaveCount(0)
  await expect(roomCode(page)).toHaveText('QRST')
  expect(roomInUrl(page)).toBe('QRST')
  await expectRole(page, 'monitor')

  await page.reload()
  await chooseRole(page, 'monitor')
  await expect(roomCode(page)).toHaveText('QRST', { timeout: 30_000 })
  await expectRole(page, 'monitor')

  await page.getByRole('button', { name: 'Salir' }).click()
  await chooseRole(page, 'vr')
  await expect(roomCode(page)).toHaveText(/^[A-Za-z0-9_-]{4,64}$/, { timeout: 30_000 })
  await expect(roomCode(page)).not.toHaveText('QRST')
  expect(roomInUrl(page)).not.toBe('QRST')
  expect(roomInUrl(page)).not.toBe(own)
  await expectRole(page, 'host')
})

test('the planner opens first: pick a date, see the plan change, confirm and begin the launch', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?speed=4')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await chooseRole(page, 'vr')

  const dialog = planner(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Fecha de despegue')).toBeFocused()
  await expect(start(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Entrar en VR' })).toBeDisabled()

  const confirm = dialog.getByRole('button', { name: 'Confirmar lanzamiento' })
  await expect(confirm).toBeEnabled({ timeout: 60_000 })
  await expect(dialog.getByLabel('Fecha de despegue')).toHaveValue('2027-01-05')
  await expect(dialog.getByLabel('Hora de despegue (UTC)')).toHaveValue('12:00')
  await expect(dialog.getByTestId('planner-arrival')).toHaveText('10 ene 2027 · 00:00 UTC')
  const sites = dialog.getByRole('list', { name: 'Mejores sitios para esa llegada' }).getByRole('listitem')
  await expect(sites).toHaveCount(3)
  const before = await sites.allTextContents()

  await dialog.getByLabel('Fecha de despegue').fill('2027-04-20')
  await expect(dialog.getByTestId('planner-arrival')).toHaveText('25 abr 2027 · 00:00 UTC')
  expect(await sites.allTextContents()).not.toEqual(before)

  await dialog.getByLabel('Fecha de despegue').fill('2028-06-01')
  await expect(dialog.getByRole('alert')).toContainText('1 ene 2028 · 00:00 UTC')
  await expect(confirm).toBeDisabled()

  await dialog.getByLabel('Fecha de despegue').fill('2027-01-20')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('landing')).toBe('2027-01-25T00:00:00Z')

  const block = page.getByRole('region', { name: 'Misión' })
  await expect(block.getByText('Despegue 20 ene 2027 · 12:00 UTC')).toBeVisible()
  await expect(block.getByText('Llegada 25 ene 2027 · 00:00 UTC')).toBeVisible()
  await expect(figure(page)).toHaveText('Listo')
  await expect(page.getByText(/Mission Control puede conectarse con el código/)).toBeVisible()
  await expect(block.getByRole('link', { name: 'Análisis de sitios y fechas' })).toHaveCount(0)

  await block.getByRole('button', { name: 'Cambiar lanzamiento' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Fecha de despegue')).toHaveValue('2027-01-20')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('landing')).toBe('2027-01-25T00:00:00Z')

  await start(page).click()
  await expect(figure(page)).toHaveText(/^T/, { timeout: 30_000 })
  await expect(block.getByRole('button', { name: 'Cambiar lanzamiento' })).toHaveCount(0)
  await expect(block.getByRole('link', { name: 'Análisis de sitios y fechas' })).toBeVisible()
})

test('the follow dialog exists, validates the code and cancels with Escape', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  await chooseRole(page, 'vr')
  await expect(planner(page)).toBeVisible()

  await page.getByRole('button', { name: 'Seguir la misión', exact: true }).click()
  const dialog = followDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Seguir una misión' })).toBeVisible()
  const field = dialog.getByLabel('Código de seguimiento')
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('autocomplete', 'off')

  await field.fill('no valido')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('alert')).toHaveText('Código no válido')
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(planner(page)).toBeVisible()
})

const DAY_MS = 24 * 60 * 60 * 1000
/** Un día antes del corte de CAPCOM, derivado de la constante: la prueba no depende del reloj real. */
const BEFORE_CAPCOM_CUTOFF = Date.parse(CAPCOM_ACCESS_EXPIRES_AT) - DAY_MS
const AFTER_CAPCOM_CUTOFF = Date.parse(CAPCOM_ACCESS_EXPIRES_AT) + DAY_MS

test('CAPCOM: the talk button is in the header with its accessible name, hint and keyboard shortcut', async ({ page }) => {
  await page.clock.setFixedTime(BEFORE_CAPCOM_CUTOFF)
  await openLaunch(page, '?speed=4')
  const talk = page.getByRole('button', { name: 'Hablar con CAPCOM' })
  await expect(talk).toBeVisible()
  await expect(talk).toBeEnabled()
  await expect(talk).toHaveAttribute('aria-keyshortcuts', 'V')
  await expect(talk).toHaveAccessibleDescription(/Mantén pulsado para hablar.*tecla V/)
  await expect(page.getByTestId('capcom-caption')).toHaveCount(0)
})

test('CAPCOM: after the access cutoff the button says «CAPCOM no disponible» and is disabled', async ({ page }) => {
  await page.clock.setFixedTime(AFTER_CAPCOM_CUTOFF)
  await page.goto('/?phase=orbit&speed=4')
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
  const talk = page.getByRole('button', { name: 'CAPCOM no disponible' })
  await expect(talk).toBeVisible()
  await expect(talk).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Hablar con CAPCOM' })).toHaveCount(0)
})

test('?capcom=0 hides CAPCOM completely', async ({ page }) => {
  await openLaunch(page, '?speed=4&capcom=0')
  await expect(page.getByRole('button', { name: /CAPCOM/ })).toHaveCount(0)
  await expect(page.getByTestId('capcom-live')).toHaveCount(0)
})

test('the transmission report opens Mission Control with the chosen site as scenario A and the best other site as B', async ({ page }) => {
  test.setTimeout(420_000)
  await openLaunch(page, '?speed=20&landing=2027-01-10T00:00:00Z&site=nobile-rim-2')
  await reachOrbit(page)
  await page.getByRole('button', { name: 'Preconfirmar punto' }).click()
  await expect(currentStep(page)).toContainText('Vista del sitio', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Iniciar descenso' }).click()
  await expect(currentStep(page)).toContainText('Transmisión', { timeout: 240_000 })

  const report = page.getByRole('link', { name: 'Ver reporte en Mission Control' })
  await expect(report).toBeVisible({ timeout: 120_000 })
  const href = (await report.getAttribute('href')) ?? ''
  expect(href).toMatch(/^\/mission-control\/\?s=nobile-rim-2~2027-01-10T00:00Z~14&s=[a-z0-9-]+~2027-01-10T00:00Z~14$/)
  expect(href).not.toContain('no-caer')

  const [control] = await Promise.all([page.context().waitForEvent('page'), report.click()])
  await expect(control).toHaveURL(/\/mission-control\//)
  await expect(control.locator('main')).toHaveAttribute('aria-busy', 'false')
  const titles = control.getByTestId('card-title')
  await expect(titles.first()).toContainText('Nobile Rim 2')
  await expect(titles).toHaveCount(2)
})
