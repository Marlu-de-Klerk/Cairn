// Exports one jungle layout as JSON for scripts/blender/jungle_island.py (env-gated; run via `npm run island:export`).
// The Blender island is built on this layout so the trail, cairns and camera, which all read the same layout in the
// app, line up with the hand-built mesh.
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { buildIslandLayout } from '../../src/lib/island/plan'
import { rayExit } from '../../src/lib/island/query'
import { levelCore } from '../../src/lib/island/trailPlan'
import { JUNGLE_ISLAND_SEED } from '../../src/lib/island/fixedIslands'
import { BIOME_TERRAIN, SHARED_PALETTE } from '../../src/lib/island/biomes'

const OUTLINE_SEGMENTS = 256
const PROBE_OFFSETS = [-0.5, -0.45, -0.4, -0.35, -0.3, -0.25, -0.2, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]

describe.runIf(process.env.ISLAND_EXPORT)('island export', () => {
  it('writes the jungle layout', () => {
    const layout = buildIslandLayout('jungle', JUNGLE_ISLAND_SEED)
    const outlines = layout.levels.map((level) => {
      const inside = (x: number, z: number) => layout.levelAt(x, z) >= level.index
      const core = level.index === 0 ? [0, 0] : levelCore(layout, level.index, [layout.blobs[level.index]?.cx ?? 0, layout.blobs[level.index]?.cz ?? 0])
      return Array.from({ length: OUTLINE_SEGMENTS }, (_, i) => {
        const theta = (i / OUTLINE_SEGMENTS) * Math.PI * 2
        const r = rayExit(inside, core[0], core[1], theta)
        return [core[0] + r * Math.cos(theta), core[1] + r * Math.sin(theta)]
      })
    })
    const out = {
      seed: layout.seed,
      front: layout.front,
      levels: layout.levels,
      outlines,
      summit: layout.summit,
      summitTopY: layout.summitTopY,
      trail: {
        halfWidth: layout.trail.halfWidth,
        samples: layout.trail.samples.map((s) => [s.x, s.y, s.z, s.level, s.ramp, s.s]),
        // Terrace height (path ignored) across each sample at PROBE_OFFSETS, left (+normal) positive.
        probeOffsets: PROBE_OFFSETS,
        probes: layout.trail.samples.map((s, i, all) => {
          const a = all[Math.max(0, i - 1)]
          const b = all[Math.min(all.length - 1, i + 1)]
          const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
          const nx = -(b.z - a.z) / len
          const nz = (b.x - a.x) / len
          return PROBE_OFFSETS.map((d) => layout.terraceY(s.x + nx * d, s.z + nz * d))
        }),
      },
      features: {
        ...layout.features,
        shelf: layout.features.shelf ? { y: layout.features.shelf.y, baseY: layout.features.shelf.baseY } : null,
      },
      props: layout.props,
      palette: { ...SHARED_PALETTE, ...BIOME_TERRAIN.jungle.palette },
      rules: BIOME_TERRAIN.jungle.props,
    }
    writeFileSync(process.env.ISLAND_EXPORT!, JSON.stringify(out))
  }, 600_000)
})
