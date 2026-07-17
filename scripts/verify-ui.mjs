// Verify: menu has no description text under choices; walls are darker; sound wiring runs
// without console errors when moves are made.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://127.0.0.1:5180'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 920, deviceScaleFactor: 2 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.menu')
  await page.screenshot({ path: '/tmp/quo-menu.png' })

  // Menu choices should have titles but NO description sub-text.
  const menuChoices = await page.evaluate(() =>
    [...document.querySelectorAll('.choice')].map((b) => ({
      title: b.querySelector('.choice-title')?.textContent.trim(),
      hasSub: !!b.querySelector('.choice-sub'),
    })),
  )

  // Start hot-seat, make a move + place a wall (exercises the sound cues).
  const choose = async (t) => {
    const h = await page.evaluateHandle(
      (x) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(x)) || null,
      t,
    )
    await h.asElement().click()
  }
  await choose('Two players')
  await choose('Start game')
  await page.waitForSelector('.board')
  await page.click('.move-dot') // pawn move -> playMoveSound
  await sleep(150)
  await page.evaluate(() => {
    const svg = document.querySelector('.board')
    const r = svg.getBoundingClientRect()
    const unit = r.width / 10
    const x = r.left + (2 + 0.5) * unit
    const y = r.top + (4 + 0.5) * unit
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
    svg.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
  })
  await sleep(200)

  const wallFill = await page.evaluate(() => getComputedStyle(document.querySelector('.wall')).fill)
  await page.screenshot({ path: '/tmp/quo-walls-dark.png' })

  console.log(JSON.stringify({ menuChoices, wallFill, consoleErrors: errors }, null, 2))

  const allClean = menuChoices.every((c) => !c.hasSub) && errors.length === 0
  if (!allClean) {
    console.error('FAIL: menu subs present or console errors occurred')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
