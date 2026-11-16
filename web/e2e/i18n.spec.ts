import { expect, test, type Page } from '@playwright/test'

const KEY = 'touchdown.lang'
const LAYER = '[data-mode]'

/** The welcome gate, in whichever language it is shown: waits for «Skip»/«Saltar» or for the question itself. */
async function welcomeCard(page: Page, title: string) {
  const skip = page.getByRole('button', { name: /^(Skip|Saltar)$/ })
  const card = page.getByRole('dialog', { name: title })
  await expect(skip.or(card).first()).toBeVisible({ timeout: 30_000 })
  await skip.click({ timeout: 2000 }).catch(() => {})
  await expect(card).toBeVisible()
  return card
}

async function hasWebGL(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  })
}

const htmlLang = (page: Page) => page.locator('html')

test('with touchdown.lang=en the welcome is in English and html lang is en', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => localStorage.setItem(key, 'en'), KEY)
  await page.reload()
  await expect(htmlLang(page)).toHaveAttribute('lang', 'en')

  const card = await welcomeCard(page, 'Welcome to TOUCHDOWN')
  await expect(card.getByText('Compare lunar south pole landing sites and dates with real NASA data')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Explore the mission' })).toBeVisible()
  await expect(card.getByRole('button', { name: "Follow someone's mission (with a code)" })).toBeVisible()
  await expect(card.getByText('For VR, open it in the Meta Quest browser')).toBeVisible()
  await expect(page.getByText('Bienvenido a TOUCHDOWN')).toHaveCount(0)
})

test.describe('the selector in the top bar', () => {
  test.use({ locale: 'en-US' })

  test('switches to ES, is usable by keyboard, is at least 44 px and persists after a reload', async ({ page }) => {
    await page.goto('/?phase=launch')
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
    await expect(page.locator(LAYER)).toBeVisible()
    await expect(htmlLang(page)).toHaveAttribute('lang', 'en')

    const group = page.getByRole('group', { name: 'Language' })
    await expect(group.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    const es = group.getByRole('button', { name: 'ES' })
    const box = await es.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)

    await es.focus()
    await page.keyboard.press('Enter')
    await expect(htmlLang(page)).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'ES' })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('es')

    await page.reload()
    await expect(htmlLang(page)).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'ES' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('the welcome follows the choice too: ES chosen in the bar, English browser, welcome in Spanish after a reload', async ({ page }) => {
    await page.goto('/?phase=launch')
    test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'ES' }).click()
    await page.goto('/')
    await welcomeCard(page, 'Bienvenido a TOUCHDOWN')
  })
})

test('choosing EN in Mission Control makes the experience open in English', async ({ page }) => {
  await page.goto('/mission-control/')
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(htmlLang(page)).toHaveAttribute('lang', 'en')

  await page.goto('/')
  await expect(htmlLang(page)).toHaveAttribute('lang', 'en')
  await welcomeCard(page, 'Welcome to TOUCHDOWN')
})

/** Opens `url` with the language preference already saved, so the page boots in that language. */
async function openIn(page: Page, lang: 'es' | 'en', url: string) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, lang] as const)
  await page.goto(url)
  test.skip(!(await hasWebGL(page)), 'WebGL unavailable in this browser')
}

test.describe('the experience screens in English', () => {
  test('the launch planner and the top bar speak English', async ({ page }) => {
    await openIn(page, 'en', '/?phase=launch')
    await page.getByRole('button', { name: 'Change launch' }).click()
    const dialog = page.getByRole('dialog', { name: 'Plan your launch' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Launch date')).toBeVisible()
    await expect(dialog.getByLabel('Launch time (UTC)')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Confirm launch' })).toBeEnabled({ timeout: 60_000 })
    await expect(dialog.getByTestId('planner-arrival')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{2}:\d{2} UTC$/)
    await expect(dialog.getByText('Estimated arrival at the south pole')).toBeVisible()
    await expect(dialog.getByText('Direct transit of 4.5 days (assumed)')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Best landing sites for that arrival' })).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Detailed site and date analysis' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Follow the mission' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sound' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Mission phases' })).toBeVisible()
    await expect(page.getByText('Planifica tu lanzamiento')).toHaveCount(0)
    await expect(page.getByText('Seguir la misión')).toHaveCount(0)
  })

  test('the control room of a follower speaks English', async ({ page }) => {
    await openIn(page, 'en', '/?room=ZZZZ')
    await welcomeCard(page, 'Welcome to TOUCHDOWN')
    await page.getByRole('button', { name: "Follow someone's mission (with a code)" }).click()
    await expect(page.getByText(/Tracking · following mission/)).toBeVisible()
    for (const name of ['Mission status', 'Mission you’re following', 'Live telemetry', 'Landing site', 'Landing site ranking', 'Event log']) {
      await expect(page.locator(`section[aria-label="${name}"]`).first()).toBeVisible()
    }
    await expect(page.getByRole('list', { name: 'Mission phases' })).toBeVisible()
    await expect(page.getByText('Data: NASA LOLA · JPL Horizons')).toBeVisible()
    await expect(page.getByText('Estado de la misión')).toHaveCount(0)
    await expect(page.getByText('Telemetría en vivo')).toHaveCount(0)
  })
})

test.describe('the top bar at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /** Every control of the header lies inside the viewport, and the page does not scroll sideways. */
  async function expectBarInside(page: Page) {
    const outside = await page.evaluate(() => {
      const width = document.documentElement.clientWidth
      const bar = document.querySelector('[data-mode] header')
      if (!bar) return ['no header']
      const bad: string[] = []
      for (const el of [bar, ...bar.querySelectorAll('button, a, [role="group"], p')]) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.left < -0.5 || r.right > width + 0.5) {
          bad.push(`${el.tagName} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}» ${Math.round(r.left)}..${Math.round(r.right)}`)
        }
      }
      if (document.documentElement.scrollWidth > width) bad.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${width}`)
      return bad
    })
    expect(outside).toEqual([])
  }

  for (const lang of ['es', 'en'] as const) {
    test(`the crew's bar fits (${lang})`, async ({ page }) => {
      await openIn(page, lang, '/?phase=launch')
      await expect(page.getByRole('group', { name: lang === 'es' ? 'Idioma' : 'Language' })).toBeVisible()
      await expect(page.getByRole('button', { name: lang === 'es' ? 'Sonido' : 'Sound' })).toBeVisible()
      await expectBarInside(page)
      const talk = page.getByRole('button', { name: /CAPCOM/ })
      await expect(talk).toBeVisible()
      const box = await talk.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    })

    test(`the follower's control room bar fits (${lang})`, async ({ page }) => {
      await openIn(page, lang, '/?room=ZZZZ')
      await welcomeCard(page, lang === 'es' ? 'Bienvenido a TOUCHDOWN' : 'Welcome to TOUCHDOWN')
      await page.getByRole('button', { name: lang === 'es' ? 'Seguir la misión de alguien (con código)' : "Follow someone's mission (with a code)" }).click()
      await expect(page.getByRole('button', { name: lang === 'es' ? 'Sonido' : 'Sound' })).toBeVisible()
      await expectBarInside(page)
    })
  }
})
