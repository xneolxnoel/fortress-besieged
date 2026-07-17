// Verify the AI waits at least ~1s before replying (minimum thinking time).
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
  await choose('Play the computer')
  await sleep(150)
  await choose('Normal')
  await sleep(150)
  await choose('White') // human is white -> moves first
  await choose('Start game')
  await page.waitForSelector('.board')

  const cells = () =>
    page.evaluate(() => [...document.querySelectorAll('.move-cell')].filter((c) => c.textContent.trim()).length)

  // Human (white) moves.
  await page.waitForSelector('.move-dot')
  const t0 = Date.now()
  await page.click('.move-dot')

  // Wait until the AI (black) has replied (2 moves recorded), up to 6s.
  let replyAt = null
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    if ((await cells()) >= 2) {
      replyAt = Date.now()
      break
    }
  }
  const elapsed = replyAt ? replyAt - t0 : null
  console.log(JSON.stringify({ elapsedMs: elapsed, minExpected: 1000 }))

  if (elapsed === null) {
    console.error('FAIL: AI never replied within 6s')
    process.exitCode = 1
  } else if (elapsed < 950) {
    console.error('FAIL: AI replied too fast (' + elapsed + 'ms < 950ms)')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
