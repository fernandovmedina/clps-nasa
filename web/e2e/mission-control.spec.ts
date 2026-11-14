import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Browser, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ephemerisStartMs, expected } from './oracle'

const SHOTS_DIR = resolve(process.env.TOUCHDOWN_SHOTS_DIR ?? 'test-results/captures')
const DAY_MS = 86_400_000
const CONTROL = '/mission-control/'

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
    },
    { auto: true },
  ],
})

async function openApp(page: Page, query = ''): Promise<void> {
  await page.goto(`${CONTROL}${query}`)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('scenario-card').first()).toBeVisible()
}

async function waitForLoaded(page: Page): Promise<void> {
  const cards = page.getByTestId('scenario-card')
  await expect(cards.first()).toBeVisible()
  const count = await cards.count()
  await expect(page.locator('[data-testid=scenario-card] [data-status]').first()).toBeVisible()
  await expect(page.locator('[data-testid=scenario-card] [data-testid=score]')).toHaveCount(count)
  await expect(page.getByTestId('calendar-strip')).toHaveAttribute('data-ready', 'true')
}

async function tabTo(page: Page, target: Locator, maxPresses = 150): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('element is not reachable with the keyboard')
}

test('initial load shows two scenario cards with site name, status pill and numeric solar elevation and no console errors', async ({ page, errors }) => {
  await openApp(page)
  await waitForLoaded(page)
  const cards = page.getByTestId('scenario-card')
  await expect(cards).toHaveCount(2)
  const cases = [
    { site: 'malapert-a', name: 'Malapert A' },
    { site: 'mons-mouton', name: 'Mons Mouton' },
  ]
  for (const [i, c] of cases.entries()) {
    const card = cards.nth(i)
    const oracle = expected(c.site, '2027-01-10T00:00:00Z', 14)
    await expect(card.getByTestId('card-title')).toContainText(c.name)
    await expect(card.locator('[data-status]').first()).toHaveAttribute('data-status', oracle.status)
    await expect(card.getByTestId('score')).toContainText(`${oracle.score} / 100`)
    expect(await card.getByTestId('sun-elevation').innerText()).toMatch(/^[−-]?\d+\.\d°$/)
  }
  expect(errors).toEqual([])
})

test('mission delay of +21 days changes the visible metrics, shows the differences against the original, writes the delay into the URL and survives a reload', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  const cards = page.getByTestId('scenario-card')
  const before = await cards.first().getByTestId('score').innerText()
  await expect(page.getByTestId('deltas')).toHaveCount(0)

  await page.getByRole('button', { name: 'Retrasar 21 días' }).click()
  await expect(page.getByTestId('delay-value')).toHaveText('+21 d')
  const shifted = expected('malapert-a', '2027-01-31T00:00:00Z', 14)
  await expect(cards.first().getByTestId('score')).toContainText(`${shifted.score} / 100`)
  const after = await cards.first().getByTestId('score').innerText()
  expect(after).not.toBe(before)
  await expect(page.getByTestId('deltas')).toHaveCount(2)
  await expect(cards.first().getByTestId('deltas')).toContainText('Δ puntaje')
  await expect(page).toHaveURL(/delay=21/)

  await page.reload()
  await waitForLoaded(page)
  await expect(page.getByTestId('delay-value')).toHaveText('+21 d')
  await expect(page.getByTestId('deltas')).toHaveCount(2)
  await expect(cards.first().getByTestId('score')).toContainText(`${shifted.score} / 100`)
})

test('scenarios can be added up to four, the add button is then disabled, and one can be removed', async ({ page }) => {
  await openApp(page)
  const add = page.getByRole('button', { name: 'Añadir escenario' })
  const cards = page.getByTestId('scenario-card')
  await add.click()
  await add.click()
  await expect(cards).toHaveCount(4)
  await expect(add).toBeDisabled()
  await expect(page.getByText('Máximo 4 escenarios')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar escenario C' }).click()
  await expect(cards).toHaveCount(3)
  await expect(add).toBeEnabled()
})

test('choosing another site in the catalog updates the card title and the panorama description', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  const card = page.getByTestId('scenario-card').first()
  const panorama = card.locator('svg:has(title)').filter({ hasText: 'Panorama del horizonte en' })
  const descBefore = await panorama.locator('desc').textContent()
  await page.locator('aside [data-site="apollo-11"]').click()
  await expect(card.getByTestId('card-title')).toContainText('Apollo 11')
  await expect(panorama.locator('title')).toContainText('Apollo 11')
  await expect(panorama.locator('desc')).not.toHaveText(descBefore ?? '')
})

test('custom coordinates at latitude -89.9 and longitude 0 show the spherical horizon label', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('custom-lat').fill('-89.9')
  await page.getByTestId('custom-lon').fill('0')
  await page.getByTestId('custom-apply').click()
  await expect(page.getByTestId('scenario-card').first()).toContainText('Horizonte esférico, sin terreno')
  await expect(page).toHaveURL(/s=c:-89\.9,0~/)
})

test('Chang\'e 4 never sees the Earth and is not viable', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  await page.locator('aside [data-site="change-4"]').click()
  const card = page.getByTestId('scenario-card').first()
  await expect(card.getByTestId('card-title')).toContainText("Chang'e 4")
  await expect(card.getByTestId('earth-countdown')).toContainText('Tierra nunca visible')
  await expect(card.locator('[data-status]').first()).toHaveAttribute('data-status', 'not_viable')
  const oracle = expected('change-4', '2027-01-10T00:00:00Z', 14)
  expect(oracle.status).toBe('not_viable')
  expect(oracle.windows.earth).toEqual([])
})

test('theme and language toggles change the interface and persist after a reload', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const light = await background()
  expect(light).toBe('rgb(250, 249, 245)')
  await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await background()).not.toBe(light)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByText('Mission delay')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()

  await page.reload()
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByText('Mission delay')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('touchdown.theme'))).toBe('dark')
  expect(await page.evaluate(() => localStorage.getItem('touchdown.lang'))).toBe('en')
})

test('axe finds no serious or critical violations in the main view in light and dark themes', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    }
    const result = await new AxeBuilder({ page }).analyze()
    const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      `${theme} theme`,
    ).toEqual([])
  }
})

test('clicking a day in the calendar sets the landing date of the selected scenario', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  const landing = page.getByLabel('Aterrizaje (UTC)').first()
  await expect(landing).toHaveValue('2027-01-10T00:00')
  const strip = page.getByTestId('calendar-slider')
  await strip.scrollIntoViewIfNeeded()
  const box = await strip.boundingBox()
  if (!box) throw new Error('calendar strip has no box')
  const count = Number(await strip.getAttribute('aria-valuemax')) + 1
  const fraction = 0.8
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2)
  const index = Math.floor(fraction * count)
  const day = new Date(ephemerisStartMs() + index * DAY_MS).toISOString().slice(0, 10)
  await expect(landing).toHaveValue(`${day}T00:00`)
  await expect(page.getByTestId('landing-utc').first()).toContainText(`${day} 00:00 UTC`)
})

test('the delay and the time cursor can be operated with the keyboard alone', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  const delay = page.getByRole('slider', { name: 'Retraso en días' })
  await tabTo(page, delay)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('delay-value')).toHaveText('+3 d')
  await page.keyboard.press('End')
  await expect(page.getByTestId('delay-value')).toHaveText('+90 d')
  await page.keyboard.press('Home')
  await expect(page.getByTestId('delay-value')).toHaveText('Sin retraso')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('delay-value')).toHaveText('+2 d')
  await expect(page).toHaveURL(/delay=2(&|$)/)

  const cursor = page.getByRole('slider', { name: 'Cursor de tiempo' }).first()
  await tabTo(page, cursor)
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(cursor).toHaveAttribute('aria-valuenow', '5')
  await page.keyboard.press('PageUp')
  await expect(cursor).toHaveAttribute('aria-valuenow', '29')
  await page.keyboard.press('End')
  await expect(cursor).toHaveAttribute('aria-valuenow', await cursor.getAttribute('aria-valuemax') ?? '')
  await page.keyboard.press('Home')
  await expect(cursor).toHaveAttribute('aria-valuenow', '0')
  await expect(page).not.toHaveURL(/cursor=/)
})

test('a link pointing at prototype keys and an unknown site keeps the page alive', async ({ page, errors }) => {
  await page.goto(
    `${CONTROL}?s=constructor~2027-01-10T00:00Z~14&s=no-such-site~2027-01-10T00:00Z~14&__proto__=x&constructor=y&toString=z&delay=7`,
  )
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByText('Sitio desconocido.')).toHaveCount(2)
  await expect(page.getByTestId('boundary-fallback')).toHaveCount(0)
  await expect(page.getByTestId('delay-value')).toHaveText('+7 d')

  await page.getByRole('button', { name: 'Elegir otro sitio' }).first().click()
  await expect(page.locator('aside input[type="search"]')).toBeFocused()
  await page.locator('aside [data-site="apollo-11"]').click()
  await expect(page.getByTestId('scenario-card').first().getByTestId('card-title')).toContainText('Apollo 11')
  expect(errors).toEqual([])
})

test('desktop layout renders the full catalog without clipping and flags solar night risk on Malapert A', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openApp(page)
  await waitForLoaded(page)

  const risksA = page.getByTestId('risks-A')
  await expect(risksA).not.toContainText('Sin riesgos')
  await expect(risksA).toContainText('Sol bajo el horizonte')

  const aside = page.locator('aside')
  await expect(aside).toBeVisible()
  const scrollMetrics = await aside.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1)

  await expect(aside.getByRole('region', { name: 'Lado oculto' })).toBeVisible()
  const apollo17 = aside.locator('[data-site="apollo-17"]')
  const change4 = aside.locator('[data-site="change-4"]')
  await expect(apollo17).toBeVisible()
  await expect(change4).toBeVisible()

  await apollo17.click()
  await expect(page.getByTestId('scenario-card').first().getByTestId('card-title')).toContainText('Apollo 17')
  await change4.click()
  await expect(page.getByTestId('scenario-card').first().getByTestId('card-title')).toContainText("Chang'e 4")
})

test('submitting empty custom coordinates links visible error messages via aria-describedby and passes axe', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  await page.getByTestId('custom-apply').click()

  const lat = page.getByTestId('custom-lat')
  const lon = page.getByTestId('custom-lon')
  await expect(lat).toHaveAttribute('aria-invalid', 'true')
  await expect(lon).toHaveAttribute('aria-invalid', 'true')

  const latDescId = await lat.getAttribute('aria-describedby')
  const lonDescId = await lon.getAttribute('aria-describedby')
  expect(latDescId).toBeTruthy()
  expect(lonDescId).toBeTruthy()
  expect(latDescId).not.toBe(lonDescId)

  const latError = page.locator(`id=${latDescId}`)
  const lonError = page.locator(`id=${lonDescId}`)
  await expect(latError).toBeVisible()
  await expect(lonError).toBeVisible()
  await expect(latError).toContainText('Latitud entre −90 y 90')
  await expect(lonError).toContainText('Longitud entre −180 y 180')

  const result = await new AxeBuilder({ page }).analyze()
  const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})

test('the launch link hands the effective landing date and site to the experience', async ({ page }) => {
  await openApp(page)
  await waitForLoaded(page)
  const card = page.getByTestId('scenario-card').first()
  const report = page.getByTestId('report')
  await expect(card.getByRole('link', { name: 'Lanzar misión con esta fecha' })).toHaveAttribute(
    'href',
    '/?landing=2027-01-10T00:00:00Z&site=malapert-a',
  )

  await page.getByRole('button', { name: 'Retrasar 21 días' }).click()
  await expect(page.getByTestId('delay-value')).toHaveText('+21 d')
  const href = '/?landing=2027-01-31T00:00:00Z&site=malapert-a'
  await expect(card.getByTestId('launch-link')).toHaveAttribute('href', href)
  await expect(report.getByTestId('launch-link-report')).toHaveAttribute('href', href)
  await expect(page.getByTestId('launch-link')).toHaveCount(1)

  await card.getByTestId('launch-link').click()
  await expect(page).toHaveURL(/\/\?landing=/)
  const url = new URL(page.url())
  expect(url.pathname).toBe('/')
  expect(url.searchParams.get('landing')).toBe('2027-01-31T00:00:00Z')
  expect(url.searchParams.get('site')).toBe('malapert-a')
  await expect(page.locator('canvas')).toHaveCount(1)
})

test('the launch link is omitted for custom coordinates and hidden when the date is out of range', async ({ page }) => {
  await page.goto(`${CONTROL}?s=c:-89.9,0~2027-01-10T00:00Z~14`)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('launch-link')).toHaveAttribute('href', '/?landing=2027-01-10T00:00:00Z')
  await expect(page.getByTestId('launch-link-report')).toHaveAttribute('href', '/?landing=2027-01-10T00:00:00Z')

  await page.goto(`${CONTROL}?s=malapert-a~2030-01-01T00:00Z~14`)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByText('Fecha fuera del rango de efemérides')).toBeVisible()
  await expect(page.getByTestId('launch-link')).toHaveCount(0)
  await expect(page.getByTestId('launch-link-report')).toHaveCount(0)
})

async function capture(browser: Browser, file: string, options: { width: number; height: number; theme: 'dark' | 'light'; mobile?: boolean }) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    locale: 'es-MX',
    colorScheme: 'dark',
    isMobile: options.mobile ?? false,
    hasTouch: options.mobile ?? false,
    baseURL: 'http://127.0.0.1:4173',
  })
  await context.addInitScript((theme) => {
    try {
      window.localStorage.setItem('touchdown.theme', theme)
    } catch {
      return
    }
  }, options.theme)
  const page = await context.newPage()
  await page.goto(`${CONTROL}?delay=21`)
  await waitForLoaded(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(SHOTS_DIR, file), fullPage: true })
  await context.close()
}

test.afterAll(async ({ browser }) => {
  mkdirSync(SHOTS_DIR, { recursive: true })
  await capture(browser, 'desktop-light.png', { width: 1440, height: 900, theme: 'light' })
  await capture(browser, 'desktop-dark.png', { width: 1440, height: 900, theme: 'dark' })
  await capture(browser, 'mobile-light.png', { width: 390, height: 844, theme: 'light', mobile: true })
  await capture(browser, 'mobile-dark.png', { width: 390, height: 844, theme: 'dark', mobile: true })
})
