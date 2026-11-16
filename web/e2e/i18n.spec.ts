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
