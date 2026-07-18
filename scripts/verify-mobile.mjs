// Mobile-viewport check: (1) header height / board position must not change when the headline
// switches to "Computer is thinking…"; (2) touch wall placement shows a confirm bar with
// Flip / Place / Cancel buttons, and Place places the wall.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://127.0.0.1:5180'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  // Emulate a coarse (touch) pointer via raw CDP — page.emulateMediaFeatures rejects 'pointer'.
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] })
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.menu')

  const choose = async (t) => {
    const h = await page.evaluateHandle(
      (x) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(x)) || null,
      t,
    )
    await h.asElement().click()
  }

  // --- Part 1: vs Computer, header stability across "thinking" headline ---
  await choose('Play the computer')
  await choose('Start game')
  await page.waitForSelector('.board')
  await sleep(300)

  const metrics = () =>
    page.evaluate(() => {
      const head = document.querySelector('.game-head').getBoundingClientRect()
      const board = document.querySelector('.board').getBoundingClientRect()
      return {
        headH: Math.round(head.height),
        boardTop: Math.round(board.top),
        headline: document.querySelector('.turn-text')?.textContent ?? '',
      }
    })

  const before = await metrics()
  // Make a pawn move (tap the first move dot) so the AI starts thinking.
  await page.evaluate(() => document.querySelector('.move-dot').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  // Poll until the thinking headline shows (or timeout), then measure.
  let during = before
  for (let i = 0; i < 40; i++) {
    await sleep(100)
    during = await metrics()
    if (during.headline.includes('thinking')) break
  }
  await page.screenshot({ path: '/tmp/quo-mobile-1-thinking.png' })
  // Wait for AI to finish, measure again.
  let after = during
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    after = await metrics()
    if (!after.headline.includes('thinking')) break
  }
  console.log('header stability:', JSON.stringify({ before, during, after }))

  // --- Part 2: touch wall preview + confirm bar ---
  const touchTap = (vx, vy) =>
    page.evaluate((coord) => {
      const svg = document.querySelector('.board')
      const r = svg.getBoundingClientRect()
      const x = r.left + ((coord.vx + 0.5) / 10) * r.width
      const y = r.top + ((coord.vy + 0.5) / 10) * r.height
      svg.dispatchEvent(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }),
      )
    }, { vx, vy })

  // First tap right after the AI's move must preview the wall (regression: React's delegated
  // events used to drop this tap; the board now listens natively, so no retry is needed).
  await touchTap(5, 3)
  await sleep(300)
  const barVisible = await page.evaluate(() => !!document.querySelector('.touch-actions'))
  await page.screenshot({ path: '/tmp/quo-mobile-2-wallbar.png' })
  const wallsBefore = await page.evaluate(
    () => document.querySelector('.card-white .walls-count')?.textContent.trim(),
  )
  // Flip orientation, then place via the button.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.touch-actions button')]
    btns.find((b) => b.textContent.includes('Flip'))?.click()
  })
  await sleep(120)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.touch-actions button')]
    btns.find((b) => b.textContent.includes('Place wall'))?.click()
  })
  await sleep(300)
  const wallsAfter = await page.evaluate(
    () => document.querySelector('.card-white .walls-count')?.textContent.trim(),
  )
  const barGone = await page.evaluate(() => !document.querySelector('.touch-actions'))
  console.log('wall bar:', JSON.stringify({ barVisible, wallsBefore, wallsAfter, barGone }))

  const stable = before.headH === during.headH && before.boardTop === during.boardTop
  const ok = stable && barVisible && wallsBefore === '10/10' && wallsAfter === '9/10' && barGone
  console.log(ok ? 'MOBILE OK' : 'MOBILE FAIL')
  if (!ok) process.exitCode = 1
} finally {
  await browser.close()
}
