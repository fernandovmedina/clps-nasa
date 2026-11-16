import { expect, test, type Page } from '@playwright/test'

const SITE = 'nobile-rim-2'

/**
 * Spanish words of the interface. Site names and the data of sites.json are not in the list, and text painted on a
 * canvas never reaches innerText, so neither counts. A word only matches as a whole word (letters on both sides do not).
 */
const SPANISH_UI_WORDS = [
  'Despegue', 'Despegar', 'Órbita', 'Orbita', 'Sitio', 'Sitios', 'Misión', 'Mision', 'Tierra', 'Pausar', 'Reanudar', 'Detener',
  'Iniciar', 'Elegir', 'Explorar', 'Conectando', 'Listo', 'Seguimiento', 'Seguir', 'Retraso', 'Puntaje', 'Alunizaje', 'Aterrizaje',
  'Transmisión', 'Comenzar', 'Confirmar', 'Lanzamiento', 'Planifica', 'Fases', 'Hablar', 'Subtítulos', 'Idioma', 'Saltar',
  'Bienvenido', 'Arrastra', 'Mirar', 'Descenso', 'Horizonte', 'Iluminación', 'Altitud', 'Velocidad', 'Distancia', 'Ruta',
  'Pensando', 'Escuchando', 'Hablando', 'Tránsito', 'supuesto', 'Llegada', 'Tripulación', 'Cuenta regresiva', 'de la misión',
  'Elegir otro sitio', 'Sol visible', 'Tierra visible', 'Escenario', 'Comparar', 'Reporte', 'Cargando', 'Cerrar', 'Volver',
]
const SPANISH = new RegExp(`(?<![\\p{L}])(?:${SPANISH_UI_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}])`, 'giu')

const found: string[] = []

async function sweep(page: Page, screen: string) {
  const text = await page.evaluate(() => document.body.innerText)
  const hits = [...new Set([...text.matchAll(SPANISH)].map((m) => m[0]))]
  if (hits.length) found.push(`${screen}: ${hits.join(', ')}`)
}

test('the whole mission in English shows no Spanish interface text on any screen', async ({ page }) => {
  test.setTimeout(480_000)
  await page.addInitScript(() => localStorage.setItem('touchdown.lang', 'en'))
  await page.goto(`/?speed=20&landing=2027-01-10T00:00:00Z&site=${SITE}`)
  test.skip(!(await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))), 'WebGL unavailable in this browser')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  const skip = page.getByRole('button', { name: 'Skip' })
  const explore = page.getByRole('button', { name: 'Explore the mission' })
  await expect(skip.or(explore).first()).toBeVisible({ timeout: 30_000 })
  await skip.click({ timeout: 2000 }).catch(() => {})
  await expect(explore).toBeVisible()
  await sweep(page, 'welcome')
  await explore.click()

  const planner = page.getByRole('dialog', { name: 'Plan your launch' })
  const confirm = planner.getByRole('button', { name: 'Confirm launch' })
  await expect(confirm).toBeEnabled({ timeout: 60_000 })
  await sweep(page, 'planner')
  await confirm.click()

  const start = page.getByRole('button', { name: 'Start launch' })
  await expect(start).toBeEnabled({ timeout: 60_000 })
  await sweep(page, 'launch (before liftoff)')
  await start.click()
  await page.waitForTimeout(3000)
  await sweep(page, 'launch (ascent)')

  const preconfirm = page.getByRole('button', { name: 'Preconfirm site' })
  await expect(preconfirm).toBeEnabled({ timeout: 150_000 })
  await sweep(page, 'orbit')
  await expect(page.getByText('Nobile Rim 2').first()).toBeVisible()
  await preconfirm.click()

  const step = page.locator('[aria-current="step"]')
  await expect(step).toContainText('Site view', { timeout: 60_000 })
  await page.waitForTimeout(4000)
  await sweep(page, 'site view')

  await page.getByRole('button', { name: 'Begin descent' }).click()
  await expect(step).toContainText('Landing', { timeout: 120_000 })
  await page.waitForTimeout(2000)
  await sweep(page, 'landing')

  await expect(step).toContainText('Transmission', { timeout: 240_000 })
  const report = page.getByRole('link', { name: 'View report in Mission Control' })
  await expect(report).toBeVisible({ timeout: 120_000 })
  await sweep(page, 'transmission')

  const [control] = await Promise.all([page.context().waitForEvent('page'), report.click()])
  await expect(control).toHaveURL(/\/mission-control\//)
  await expect(control.locator('main')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 })
  await expect(control.getByTestId('card-title').first()).toContainText('Nobile Rim 2')
  await sweep(control, 'mission control')

  expect(found, 'Spanish interface words in English mode').toEqual([])
})
