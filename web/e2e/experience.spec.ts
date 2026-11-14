import { expect, test } from '@playwright/test'

const OPTIONAL_TEXTURES = ['/textures/moon/general.jpg', '/textures/moon/north-pole.jpg', '/textures/moon/south-pole.jpg']

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
  const webgl = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  })
  test.info().annotations.push({ type: 'webgl', description: webgl ? 'available' : 'unavailable' })

  if (webgl) {
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Fases de la misión' })).toBeVisible()
    await expect(page.locator('li[class*="active"]')).toContainText('Despegue')
    await page.waitForTimeout(1500)
    await expect(shownError).toHaveCount(0)
    expect(errors).toEqual([])
  } else {
    await expect(shownError).toContainText(/webgl/i)
  }
  expect(failed.filter((path) => !OPTIONAL_TEXTURES.includes(path))).toEqual([])

  const link = page.getByRole('link', { name: 'Elegir fecha de la misión' })
  await expect(link).toHaveAttribute('href', '/mission-control/')
  await link.click()
  await expect(page).toHaveURL(/\/mission-control\/(\?.*)?$/)
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
})
