// Spec §8 measurement, run with `npm run bench:island` (skipped in `npm test`). Uncached layout and mesh build times
// per biome over 20 seeds, and the worst-case triangle counts against the budget. Lives beside the mesher rather than
// in src/lib/island because it needs three.js.
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { buildIslandLayout } from '../../../lib/island/plan'
import { BIOME_TERRAIN, propRule } from '../../../lib/island/biomes'
import type { Biome, IslandLayout } from '../../../lib/island/types'
import { buildTerrain } from './terraceMesh'
import type { IslandDetail } from './terraceMesh'
import { getPropGeometry } from './propGeometry'

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
const BIOMES = Object.keys(BIOME_TERRAIN) as Biome[]

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function timed<T>(times: number[], fn: () => T): T {
  const t0 = performance.now()
  const out = fn()
  times.push(performance.now() - t0)
  return out
}

function measure(layout: IslandLayout, detail: IslandDetail, times: number[]) {
  const t = timed(times, () => buildTerrain(layout, detail))
  const lit = t.lit.getAttribute('position').count / 3
  const unlit = t.unlit.getAttribute('position').count / 3
  for (const g of [t.lit, t.unlit, t.hull]) g.dispose()
  let props = 0
  const kinds = new Set<string>()
  for (const p of layout.props) {
    if (detail !== 'focus' && !propRule(layout.biome, p.kind)?.overview) continue
    props += getPropGeometry(p.kind, layout.biome).getAttribute('position').count / 3
    kinds.add(p.kind)
  }
  return { lit, unlit, props, kinds: kinds.size }
}

const ms = (times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b)
  return `median ${percentile(sorted, 0.5).toFixed(0)} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms`
}

describe.runIf(process.env.ISLAND_BENCH)('island build bench', () => {
  it('reports build times and triangle counts per biome', () => {
    const lines = ['Budget (spec §8): focus build ≤ 90 ms, ≤ 26k lit + 5k unlit, ≤ 14k prop tris; overview ≤ 60 ms, ≤ 10k + 2k, ≤ 8k prop tris']
    for (const biome of BIOMES) {
      const layoutMs: number[] = []
      const focusMs: number[] = []
      const overviewMs: number[] = []
      const max = { focus: { lit: 0, unlit: 0, props: 0, kinds: 0 }, overview: { lit: 0, unlit: 0, props: 0, kinds: 0 } }
      for (const seed of SEEDS) {
        const layout = timed(layoutMs, () => buildIslandLayout(biome, seed))
        for (const [detail, times] of [['focus', focusMs], ['overview', overviewMs]] as const) {
          const t = measure(layout, detail, times)
          for (const k of ['lit', 'unlit', 'props', 'kinds'] as const) max[detail][k] = Math.max(max[detail][k], t[k])
        }
      }
      lines.push(
        `${biome}: layout ${ms(layoutMs)} | mesh focus ${ms(focusMs)}, overview ${ms(overviewMs)}`,
        `  max focus ${max.focus.lit} lit + ${max.focus.unlit} unlit, ${max.focus.props} prop tris, ${max.focus.kinds} prop kinds` +
          ` | max overview ${max.overview.lit} + ${max.overview.unlit}, ${max.overview.props} prop tris, ${max.overview.kinds} kinds`,
      )
    }
    // Vitest hides a passing test's console output, so the wrapper script prints this file instead.
    writeFileSync(process.env.ISLAND_BENCH!, `${lines.join('\n')}\n`)
  }, 1_800_000)
})
