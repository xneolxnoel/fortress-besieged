// Verify wall color scheme: placed walls = red, potential-placement ghost = green.
// Avoids move-dots so the "over dot" ghost-suppression doesn't hide the ghost in the test.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://127.0.0.1:5180'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 920, deviceScaleFactor: 2 })
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.menu')
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

  const at = async (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      const unit = r.width / 10
      return { x: r.left + (coord.vx + 0.5) * unit, y: r.top + (coord.vy + 0.5) * unit }
    }, { vx, vy })

  // Place two walls via board clicks (white at 2,4; black at 6,4) — no dots involved.
  for (const [vx, vy] of [[2, 4], [6, 4]]) {
    const p = await at(vx, vy)
    await page.mouse.click(p.x, p.y)
    await sleep(150)
  }

  // Hover a legal intersection (5,4) via pointermove to show the green ghost.
  await page.evaluate((coord) => {
    const svg = document.querySelector('.board')
    const r = svg.getBoundingClientRect()
    const unit = r.width / 10
    const x = r.left + (coord.vx + 0.5) * unit
    const y = r.top + (coord.vy + 0.5) * unit
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
  }, { vx: 5, vy: 4 })
  await sleep(250)
  await page.screenshot({ path: '/tmp/quo-colors.png' })

  const fills = await page.evaluate(() => {
    const placed = document.querySelector('.wall')
    const ghost = [...document.querySelectorAll('rect')].find(
      (r) => r.getAttribute('opacity') === '0.65' && !r.classList.contains('wall'),
    )
    const cs = (el) => (el ? getComputedStyle(el).fill : null)
    return { placed: cs(placed), ghost: cs(ghost) }
  })
  console.log(JSON.stringify(fills, null, 2))
} finally {
  await browser.close()
}
