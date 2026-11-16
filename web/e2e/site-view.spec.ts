import { expect, test, type Page } from '@playwright/test'

const SITE = 'nobile-rim-2'
const LAYER = '[data-mode]'

/** Luminance (0..1, Rec. 709 over the sRGB values) of the bottom half of the page, from the screenshot pixels. */
async function lowerHalfLuminance(page: Page) {
  await page.addStyleTag({ content: `${LAYER} { visibility: hidden !important; }` })
  const { width, height } = page.viewportSize()!
  const shot = await page.screenshot({ clip: { x: 0, y: height / 2, width, height: height / 2 } })
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width; canvas.height = bmp.height
    const g = canvas.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const px = g.getImageData(0, 0, bmp.width, bmp.height).data
    const lum: number[] = []
    for (let i = 0; i < px.length; i += 4) lum.push((0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255)
    lum.sort((a, b) => a - b)
    const at = (p: number) => lum[Math.min(lum.length - 1, Math.floor(p * lum.length))]!
    return { median: at(0.5), p90: at(0.9) }
  }, shot.toString('base64'))
}

test('standing on Nobile Rim 2 the real terrain reads: the lower half of the view is not black', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('console', (m) => {
    const text = m.text()
    const expected = text.startsWith('Failed to load resource') || text.startsWith('WebSocket connection to')
    if (m.type() === 'error' && !expected) errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/?speed=20&landing=2027-01-10T00:00:00Z&site=${SITE}`)
  test.skip(!(await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))), 'WebGL unavailable in this browser')

  const skip = page.getByRole('button', { name: 'Saltar' })
  const vr = page.getByRole('button', { name: 'Voy en VR' })
  await expect(skip.or(vr).first()).toBeVisible({ timeout: 30_000 })
  await skip.click({ timeout: 2000 }).catch(() => {})
  await vr.click()

  const confirm = page.getByRole('dialog', { name: 'Planifica tu lanzamiento' }).getByRole('button', { name: 'Confirmar lanzamiento' })
  await expect(confirm).toBeEnabled({ timeout: 60_000 })
  await confirm.click()
  await page.getByRole('button', { name: 'Comenzar despegue' }).click({ timeout: 60_000 })
  const preconfirm = page.getByRole('button', { name: 'Preconfirmar punto' })
  await expect(preconfirm).toBeEnabled({ timeout: 150_000 })
  await preconfirm.click()
  await expect(page.locator('[aria-current="step"]')).toContainText('Vista del sitio', { timeout: 60_000 })
  await page.waitForTimeout(6000)

  await expect(page.getByText('Arrastra para mirar alrededor')).toBeVisible()
  await expect(page.getByText('Disco solar visible')).toBeVisible()
  await expect(page.getByText(/5\.69° bajo el horizonte LOLA/)).toBeVisible()
  await expect(page.getByText(/oculta desde la superficie · requiere relevo/)).toBeVisible()
  await expect(page.getByText('Temperatura aprox.')).toBeVisible()
  await expect(page.getByText('58/100 · Marginal')).toBeVisible()
  // El DEM es dato real; los cráteres menores y la textura del suelo no, y la pantalla lo dice.
  await expect(page.getByText(/Relieve: LOLA 80 m\/px · cráteres menores y textura del suelo ilustrativos/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mirar al Sol' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Mirar a la Tierra' })).toBeEnabled()

  // Medido sobre el render anterior (ACES a 1.05, Lambert, N·L): mediana 0.0034 y percentil 90 0.0468. Con Lommel-Seeliger
  // y la exposición de la fase: mediana 0.063 y percentil 90 0.58. Los umbrales quedan entre ambos, con margen a los dos lados.
  const { median, p90 } = await lowerHalfLuminance(page)
  test.info().annotations.push({ type: 'luminance', description: `median ${median.toFixed(4)} · p90 ${p90.toFixed(4)}` })
  expect(p90).toBeGreaterThan(0.25)
  expect(median).toBeGreaterThan(0.02)
  expect(errors).toEqual([])
})
