// Runs the island invariant sweep over 300 seeds per biome (spec §9.1). Slow: minutes, not seconds.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['vitest', 'run', 'src/lib/island/island.test.ts', '--project', 'unit', '--test-timeout', '1800000'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ISLAND_SWEEP: 'full' },
})
process.exit(result.status ?? 1)
