// Headless screenshots of the DEV island route (spec §10). Assumes `npm run dev` is already serving on :5173.
// Usage: npm run render:island -- <biome> <seed> <view> [key=value ...] [--out <dir>]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outArg = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined
const outDir = resolve(outArg ?? join(tmpdir(), 'cairn-renders', new Date().toISOString().slice(0, 10)))
const [biome = 'jungle', seed = '1', view = 'hero', ...extra] = args
const query = extra.join('&')
const baseUrl = process.env.CAIRN_DEV_URL ?? 'http://localhost:5173'

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
const size = view === 'phone' ? '390,844' : '1280,800'
const url = `${baseUrl}/dev/island/${biome}?seed=${seed}&view=${view}${query ? `&${query}` : ''}`
const suffix = query ? `-${query.replace(/[^a-z0-9]+/gi, '_')}` : ''
const file = join(outDir, `${biome}-${seed}-${view}${suffix}.png`)
const chromeArgs = [
  '--headless=new',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  // Chrome refuses to start as root (containers, CI) without this.
  ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  `--window-size=${size}`,
  '--virtual-time-budget=8000',
  `--screenshot=${file}`,
  url,
]
const result = spawnSync(chrome, chromeArgs, { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(file)
