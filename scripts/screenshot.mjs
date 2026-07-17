// Capture screenshots of the new board look (grooves, home rows) and an auto-oriented wall.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://127.0.0.1:5180'
const OUT = '/tmp/quo-look'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 920, deviceScaleFactor: 2 })
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.menu')
  const choose = async (t) => {
    const h = await page.evaluateHandle(
      (txt) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(txt)) || null,
      t,
    )
    await h.asElement().click()
  }
  await choose('Two players')
  await choose('Start game')
  await page.waitForSelector('.board')
  await sleep(300)
  await page.screenshot({ path: `${OUT}-1-empty.png` })

  // Place a horizontal wall (click on a horizontal groove: offset along x) and a vertical wall.
  const clickAt = async (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      const unit = r.width / 10
      const x = r.left + (coord.vx + 0.5) * unit
      const y = r.top + (coord.vy + 0.5) * unit
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
      svg.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
    }, { vx, vy })

  await clickAt(3.4, 4.0) // horizontal-ish offset from intersection (3,4) -> H wall
  await sleep(150)
  await clickAt(5.0, 3.6) // vertical-ish offset from intersection (5,4) -> V wall
  await sleep(200)
  await page.screenshot({ path: `${OUT}-2-walls.png` })
  console.log('screenshots written')
} finally {
  await browser.close()
}
