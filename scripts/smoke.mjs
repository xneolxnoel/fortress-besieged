// Headless UI smoke test: launches the dev server's page in system Chrome,
// plays through menu -> game -> moves, captures console/page errors and screenshots.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://127.0.0.1:5180'
const OUT = '/tmp/quo-smoke'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickText(page, text) {
  const handle = await page.evaluateHandle((t) => {
    const btns = [...document.querySelectorAll('button')]
    return btns.find((b) => b.textContent.trim().startsWith(t)) || null
  }, text)
  const el = handle.asElement()
  if (!el) throw new Error(`button not found: ${text}`)
  await el.click()
  await handle.dispose()
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}-${name}.png` })
}

async function movelistLength(page) {
  return page.evaluate(() => document.querySelectorAll('.move-row').length)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 920, deviceScaleFactor: 2 })
  const errors = []
  page.on('console', (m) => {
    errors.push(`console[${m.type()}]: ` + m.text())
    console.log('PAGE', `[${m.type()}]`, m.text())
  })
  page.on('pageerror', (e) => {
    errors.push('pageerror: ' + e.message)
    console.log('PAGE pageerror:', e.message)
  })

  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.menu')
  await shot(page, '00-menu')

  await clickText(page, 'Play the computer')
  await sleep(200)
  await clickText(page, 'Normal')
  await sleep(200)
  await shot(page, '00b-menu-ai')
  await clickText(page, 'Start game')

  await page.waitForSelector('.board')
  await sleep(1500) // let the AI (white) make the first move
  await shot(page, '01-board-start')
  const movesAfterAI1 = await movelistLength(page)

  // Human (black) plays a pawn move by clicking a legal-move dot.
  await page.waitForSelector('.move-dot')
  await page.click('.move-dot')
  await sleep(400)
  await shot(page, '02-after-human-move')
  const movesAfterHuman = await movelistLength(page)

  // Dump real state to resolve what colour the human is and whose turn it is.
  const dump = await page.evaluate(() => {
    const head = document.querySelector('.game-head')?.innerText ?? '(no head)'
    const cards = [...document.querySelectorAll('.player-card')].map((c) => ({
      cls: c.className,
      role: c.querySelector('.player-role')?.textContent ?? null,
      active: c.classList.contains('active'),
    }))
    const saved = (() => {
      try {
        return JSON.parse(localStorage.getItem('fortress-besieged.v1') || 'null')
      } catch {
        return null
      }
    })()
    return { head, cards, savedSettings: saved?.settings ?? null, savedHistLen: saved?.history?.length ?? null }
  })
  console.log('DUMP', JSON.stringify(dump, null, 2))

  await sleep(1500) // AI responds
  await shot(page, '03-after-ai-reply')
  let movesAfterAI2 = await movelistLength(page)

  // Diagnostic poll: is the AI thinking / does it ever move?
  for (let i = 0; i < 20 && movesAfterAI2 <= movesAfterHuman; i++) {
    await sleep(400)
    movesAfterAI2 = await movelistLength(page)
    const turnText = await page.evaluate(() => {
      const el = document.querySelector('.turn-line')
      const th = document.querySelector('.thinking')
      return { turn: el ? el.textContent.trim() : null, thinking: !!th }
    })
    console.log(`poll ${i}: moves=${movesAfterAI2}`, turnText)
  }

  // Try placing a wall as the human: click a wall hit-zone, then screenshot.
  await page.waitForSelector('.wall-zone')
  await page.click('.wall-zone')
  await sleep(400)
  await shot(page, '04-after-wall')

  console.log(JSON.stringify({ movesAfterAI1, movesAfterHuman, movesAfterAI2, errors }, null, 2))
  if (errors.length) {
    console.error('SMOKE FAILED: runtime errors detected')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
