// Writes the layout a Blender island is built on (default assets-raw/<biome>-layout.json, git-ignored).
// Usage: npm run island:export [-- <biome> [<seed>] [<out.json>]]   (defaults: jungle, the biome's HAND_BUILT seed)
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [biome = 'jungle', seed = '', outArg] = process.argv.slice(2)
const out = resolve(outArg ?? `assets-raw/${biome}-layout.json`)
mkdirSync(dirname(out), { recursive: true })
const result = spawnSync('npx', ['vitest', 'run', 'scripts/blender/island.export.test.ts', '--project', 'unit'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ISLAND_EXPORT: out, ISLAND_BIOME: biome, ISLAND_SEED: seed },
})
if (result.status === 0) console.log(out)
process.exit(result.status ?? 1)
