// Verify the wall-placement ghost reliably appears when hovering the board, including right
// after the cursor passes over a move-dot (the previously stuck case).
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

  const ghostVisible = async () =>
    page.evaluate(() =>
      !!document.querySelector('rect[opacity="0.65"]:not(.wall)'),
    )

  const hover = (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      const unit = r.width / 10
      const x = r.left + (coord.vx + 0.5) * unit
      const y = r.top + (coord.vy + 0.5) * unit
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
    }, { vx, vy })

  const results = {}
  // Several plain intersections — ghost should appear at every one.
  for (const [name, vx, vy] of [
    ['(3,3)', 3, 3],
    ['(5,5)', 5, 5],
    ['(6,3)', 6, 3],
    ['(2,6)', 2, 6],
    ['(7,7)', 7, 7],
  ]) {
    await hover(vx, vy)
    await sleep(60)
    results[`intersection ${name}`] = await ghostVisible()
  }
  // Directly over the white pawn's "up" move-dot at cell (4,1) -> center (4.5, 7.5).
  await hover(4.0, 7.0) // viewBox point (4.0,7.0) -> nearest dot center (4.5,7.5)? use the dot center directly
  await page.evaluate(() => {
    const svg = document.querySelector('.board')
    const r = svg.getBoundingClientRect()
    const unit = r.width / 10
    // dot at cell (4,1): center viewBox (4.5, 7.5)
    const x = r.left + (4.5 + 0.5) * unit
    const y = r.top + (7.5 + 0.5) * unit
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
  })
  await sleep(60)
  results['over a move-dot'] = await ghostVisible()
  // Move back to an intersection — ghost must reappear (the previously stuck case).
  await hover(5, 4)
  await sleep(60)
  results['intersection after dot'] = await ghostVisible()

  console.log(JSON.stringify(results, null, 2))

  const ok =
    Object.entries(results)
      .filter(([k]) => k.startsWith('intersection'))
      .every(([, v]) => v === true) &&
    results['over a move-dot'] === false &&
    results['intersection after dot'] === true
  if (!ok) {
    console.error('FAIL: ghost did not behave correctly')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
