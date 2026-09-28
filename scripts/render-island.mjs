// Headless screenshots of the DEV island route (spec §10). Assumes `npm run dev` is already serving on :5173.
// Usage: npm run render:island -- <biome> <seed> <view> [key=value ...] [--out <dir>]
// Drives the installed Chrome through playwright-core (no browser download). Chrome's own --screenshot fires at page
// load, before the lazy route and the idle-time island build have drawn anything.
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outArg = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined
const outDir = resolve(outArg ?? join(tmpdir(), 'cairn-renders', new Date().toISOString().slice(0, 10)))
const [biome = 'jungle', seed = '1', view = 'hero', ...extra] = args
const query = extra.join('&')
const baseUrl = process.env.CAIRN_DEV_URL ?? 'http://localhost:5173'
const settleMs = Number(process.env.CAIRN_RENDER_WAIT ?? 8000)

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const viewport = view === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 }
const url = `${baseUrl}/dev/island/${biome}?seed=${seed}&view=${view}${query ? `&${query}` : ''}`
const suffix = query ? `-${query.replace(/[^a-z0-9]+/gi, '_')}` : ''
const file = join(outDir, `${biome}-${seed}-${view}${suffix}.png`)

const browser = await chromium.launch({
  executablePath: chrome,
  // Chrome refuses to start as root (containers, CI) without --no-sandbox.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
})
let failed = false
try {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (error) => {
    failed = true
    console.error(`pageerror: ${error.message}`)
  })
  await page.goto(url)
  await page.waitForSelector('canvas')
  await page.waitForTimeout(settleMs)
  await page.screenshot({ path: file })
} finally {
  await browser.close()
}
console.log(file)
if (failed) process.exit(1)
