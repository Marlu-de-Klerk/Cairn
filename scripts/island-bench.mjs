// Island build bench (spec §8): layout/mesh median and p95 per biome, and worst-case triangle counts. About a minute.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const report = join(tmpdir(), `cairn-island-bench-${process.pid}.txt`)
const result = spawnSync('npx', ['vitest', 'run', 'src/features/archipelago/terrain/island.perf.test.ts', '--project', 'unit'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ISLAND_BENCH: report },
})
if (result.status === 0) {
  console.log(readFileSync(report, 'utf8'))
  rmSync(report)
}
process.exit(result.status ?? 1)
