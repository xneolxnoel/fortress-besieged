// Verify (1) last-move highlight appears after a pawn move and a wall placement, and
// (2) touch wall placement is a two-tap preview/confirm flow (first tap previews, second places).
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

  const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
  const wallsCount = (color) =>
    page.evaluate((c) => document.querySelector(`.card-${c} .walls-count`)?.textContent.trim() ?? null, color)
  const screenOf = (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      return {
        x: r.left + ((coord.vx + 0.5) / 10) * r.width,
        y: r.top + ((coord.vy + 0.5) / 10) * r.height,
      }
    }, { vx, vy })

  // --- Last-move highlight (mouse) ---
  await page.click('.move-dot') // white pawn move
  await sleep(120)
  const cellAfterPawn = await has('.last-cell')

  // Place a wall (black) via mouse click at intersection (2,4).
  const w = await screenOf(2, 4)
  await page.mouse.click(w.x, w.y)
  await sleep(150)
  const wallAfterPlace = await has('.last-wall')

  // --- Touch two-tap (white's turn again) ---
  // Dispatch pointerdown with pointerType 'touch' (Puppeteer's touchscreen.tap doesn't reliably
  // synthesize pointer events in headless, but real touch fires exactly this).
  const touchTap = (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      const x = r.left + ((coord.vx + 0.5) / 10) * r.width
      const y = r.top + ((coord.vy + 0.5) / 10) * r.height
      svg.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
          isPrimary: true,
        }),
      )
    }, { vx, vy })

  const before = await wallsCount('white') // expect 10/10
  // First touch tap at intersection (5,4): should PREVIEW only (ghost + hint), not place.
  await touchTap(5, 4)
  await sleep(150)
  const hintAfterFirst = await has('.touch-hint')
  const ghostAfterFirst = await has('rect[opacity="0.65"]:not(.wall)')
  const countAfterFirst = await wallsCount('white') // still 10/10 if not placed

  // Second tap at the same spot: should PLACE.
  await touchTap(5, 4)
  await sleep(200)
  const countAfterSecond = await wallsCount('white') // 9/10
  const lastWallAtTouch = await has('.last-wall')

  console.log(
    JSON.stringify(
      {
        cellAfterPawn,
        wallAfterPlace,
        before,
        hintAfterFirst,
        ghostAfterFirst,
        countAfterFirst,
        countAfterSecond,
        lastWallAtTouch,
      },
      null,
      2,
    ),
  )

  const ok =
    cellAfterPawn &&
    wallAfterPlace &&
    hintAfterFirst &&
    ghostAfterFirst &&
    before === '10/10' &&
    countAfterFirst === '10/10' &&
    countAfterSecond === '9/10' &&
    lastWallAtTouch
  if (!ok) {
    console.error('FAIL: highlight or touch two-tap did not behave as expected')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
