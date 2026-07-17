// Deterministic interaction check in hot-seat mode:
//  - clicking a legal-move dot records a PAWN move
//  - clicking the board at a groove records a WALL move (orientation auto-chosen by position)
// Reads DOM text (no OCR).
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
      (txt) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(txt)) || null,
      t,
    )
    await h.asElement().click()
  }
  await choose('Two players')
  await choose('Start game')
  await page.waitForSelector('.board')

  const readMoves = () =>
    page.evaluate(() => [...document.querySelectorAll('.move-cell')].map((c) => c.textContent.trim()))
  const wallsLeft = (color) =>
    page.evaluate((c) => document.querySelector(`.card-${c} .walls-count`)?.textContent.trim() ?? null, color)

  // 1) Click a legal-move dot -> pawn move (no 'h'/'v').
  await page.waitForSelector('.move-dot')
  await page.click('.move-dot')
  await sleep(150)
  const afterPawn = await readMoves()

  // 2) Click the board at a groove intersection -> wall move, auto orientation from position.
  //    Dispatch pointermove + click at the screen point for viewBox coord (2, 4).
  await page.evaluate(() => {
    const svg = document.querySelector('.board')
    const r = svg.getBoundingClientRect()
    const unit = r.width / 10 // viewBox spans 10 units (-0.5..9.5)
    const at = (vx, vy) => ({ x: r.left + (vx + 0.5) * unit, y: r.top + (vy + 0.5) * unit })
    const p = at(2, 4)
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }))
    svg.dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }))
  })
  await sleep(200)
  const afterWall = await readMoves()

  // The pawn move was white's; it is then BLACK's turn, so the wall belongs to black.
  const blackWalls = await wallsLeft('black')
  const whiteWalls = await wallsLeft('white')

  const firstIsPawn = afterPawn[0] && !/[hv]$/.test(afterPawn[0])
  const secondIsWall = afterWall[1] && /[hv]$/.test(afterWall[1])

  console.log(
    JSON.stringify({ afterPawn, afterWall, blackWalls, whiteWalls, firstIsPawn, secondIsWall }, null, 2),
  )

  if (!firstIsPawn) {
    console.error('FAIL: clicking a move-dot did not produce a pawn move')
    process.exitCode = 1
  }
  if (!secondIsWall) {
    console.error('FAIL: clicking the board did not produce a wall move')
    process.exitCode = 1
  }
  if (whiteWalls !== '10/10' || blackWalls !== '9/10') {
    console.error('FAIL: wall counts not as expected')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
