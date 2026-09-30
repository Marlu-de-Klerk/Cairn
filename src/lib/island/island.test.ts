import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashGoalId } from '../theme'
import type { Biome, IslandLayout } from './types'
import { BIOME_TERRAIN, propRule } from './biomes'
import { __testHooks, buildIslandLayout, legShares, serializeLayout, validateLayout } from './plan'
import { BEACH, LAWN, blobSd } from './shapes'
import { PATH_HALF_WIDTH, SHARE_WINDOWS } from './trailPlan'
import { focusPose, islandAnchors } from './anchors'

const FULL = process.env.ISLAND_SWEEP === 'full'
const BIOMES = Object.keys(BIOME_TERRAIN) as Biome[]
const UUIDS = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

function seedsFor(biome: Biome): number[] {
  const count = FULL ? 300 : biome === 'jungle' ? 40 : 8
  return [...Array.from({ length: count }, (_, i) => i + 1), ...(FULL || biome === 'jungle' ? UUIDS.map(hashGoalId) : [])]
}

/** Rise over run around sample i; "flat" below 0.02 regardless of ramp tags, since the limiter's tails spill past a ramp span. */
function localSlope(l: IslandLayout, i: number): number {
  const s = l.trail.samples
  const a = s[Math.max(0, i - 2)]
  const b = s[Math.min(s.length - 1, i + 2)]
  return (b.y - a.y) / Math.max(1e-6, b.s - a.s)
}

const cache = new Map<string, IslandLayout>()
function layoutFor(biome: Biome, seed: number): IslandLayout {
  const key = `${biome}:${seed}`
  let layout = cache.get(key)
  if (!layout) {
    layout = buildIslandLayout(biome, seed)
    cache.set(key, layout)
  }
  return layout
}

function sweep(check: (layout: IslandLayout) => void) {
  for (const biome of BIOMES) for (const seed of seedsFor(biome)) check(layoutFor(biome, seed))
}

// The first sweep builds every layout (~40 s); later tests hit the cache.
vi.setConfig({ testTimeout: 600_000 })

afterEach(() => {
  __testHooks.forceInvalid = null
})

describe('buildIslandLayout', () => {
  it('is deterministic', () => {
    expect(serializeLayout(buildIslandLayout('jungle', 7))).toEqual(serializeLayout(buildIslandLayout('jungle', 7)))
  })

  it('gives different seeds visibly different islands', () => {
    const a = layoutFor('jungle', 1)
    const b = layoutFor('jungle', 2)
    const mid = (l: IslandLayout) => l.trail.samples.find((q) => q.s >= l.trail.length / 2)!
    expect(Math.hypot(mid(a).x - mid(b).x, mid(a).z - mid(b).z)).toBeGreaterThan(0.3)
  })

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    buildIslandLayout('jungle', 11)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('retries a failed seed deterministically with a different effective seed', () => {
    __testHooks.forceInvalid = (seed) => seed === 5
    const first = buildIslandLayout('jungle', 5)
    const second = buildIslandLayout('jungle', 5)
    expect(first.seed).not.toBe(5)
    expect(validateLayout(first)).toEqual([])
    expect(serializeLayout(first)).toEqual(serializeLayout(second))
  })

  it("every biome's preview seed builds a valid layout on its own", () => {
    for (const biome of BIOMES) expect(buildIslandLayout(biome, BIOME_TERRAIN[biome].previewSeed).seed).toBe(BIOME_TERRAIN[biome].previewSeed)
  })

  it('returns a valid layout for every swept seed', () => {
    sweep((layout) => expect(validateLayout(layout), `${layout.biome}:${layout.seed}`).toEqual([]))
  })
})

describe('layout invariants (spec §9.1)', () => {
  it('stays inside the world-size budget', () => {
    sweep((l) => {
      expect(l.footprintRadius).toBeLessThanOrEqual(3.05)
      expect(l.haloRadius).toBeLessThanOrEqual(3.45)
      expect(l.summitTopY).toBeLessThanOrEqual(2.2)
      for (const p of l.props) {
        const top = p.y + (propRule(l.biome, p.kind)?.height ?? 0) * p.scale
        expect(top).toBeLessThanOrEqual(3.0)
        expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(l.haloRadius)
      }
    })
  })

  it('keeps jungle palms and canopy trees within their height caps', () => {
    for (const seed of seedsFor('jungle')) {
      const l = layoutFor('jungle', seed)
      for (const p of l.props) {
        const h = (propRule(l.biome, p.kind)?.height ?? 0) * p.scale
        if (p.kind === 'palm') expect(h).toBeGreaterThanOrEqual(0.55 - 1e-9)
        if (p.kind === 'palm') expect(h).toBeLessThanOrEqual(0.8 + 1e-9)
        if (p.kind === 'canopyTree') expect(h).toBeLessThanOrEqual(0.7 + 1e-9)
      }
    }
  })

  it('nests every level inside the one below and keeps sand between grass and water', () => {
    for (const seed of [1, 2, 3]) {
      const l = layoutFor('jungle', seed)
      for (let x = -3.4; x <= 3.4; x += 0.05) {
        for (let z = -3.4; z <= 3.4; z += 0.05) {
          const sd = l.sdAt(x, z)
          for (let k = 1; k < sd.length; k++) if (sd[k] > 0) expect(sd[k - 1]).toBeGreaterThan(0)
        }
      }
      for (let k = 1; k < l.levels.length; k++) expect(l.levels[k].y).toBeGreaterThan(l.levels[k - 1].y)
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 2
        for (let r = 0; r < 3.4; r += 0.01) {
          const x = r * Math.cos(a)
          const z = r * Math.sin(a)
          if (l.sdAt(x, z)[LAWN] <= 0) {
            for (let d = 0; d < 0.12; d += 0.01) expect(l.levelAt(x + d * Math.cos(a), z + d * Math.sin(a))).toBeGreaterThanOrEqual(BEACH)
            break
          }
        }
      }
    }
  })

  it('starts on the beach facing the camera and ends well inside the summit', () => {
    sweep((l) => {
      const first = l.trail.samples[0]
      const last = l.trail.samples[l.trail.samples.length - 1]
      expect(l.levelAt(first.x, first.z)).toBe(BEACH)
      const angle = Math.atan2(first.z, first.x)
      expect(Math.abs(Math.atan2(Math.sin(angle - l.front), Math.cos(angle - l.front)))).toBeLessThan(0.6)
      const top = l.levels.length - 1
      expect(l.levelAt(last.x, last.z)).toBe(top)
      expect(l.sdAt(last.x, last.z)[top]).toBeGreaterThanOrEqual(0.25)
    })
  })

  it('walks on the ground: every sample on groundHeightAt and the corridor flat across', () => {
    sweep((l) => {
      const s = l.trail.samples
      for (let i = 0; i < s.length; i++) {
        expect(Math.abs(l.groundHeightAt(s[i].x, s[i].z) - s[i].y)).toBeLessThanOrEqual(1e-3)
        const j = Math.min(s.length - 1, i + 1)
        const k = Math.max(0, i - 1)
        const tx = s[j].x - s[k].x
        const tz = s[j].z - s[k].z
        const tl = Math.hypot(tx, tz) || 1
        for (const sign of [1, -1]) {
          const off = (PATH_HALF_WIDTH - 0.02) * sign
          // On a curving slope a lateral probe projects to a slightly different arc length, hence the looser bound there.
          const tolerance = localSlope(l, i) < 0.02 ? 0.03 : 0.06
          expect(Math.abs(l.groundHeightAt(s[i].x - (tz / tl) * off, s[i].z + (tx / tl) * off) - s[i].y)).toBeLessThanOrEqual(tolerance)
        }
      }
    })
  })

  it('keeps flat runs on their cap and never cuts more than one cliff deep', () => {
    sweep((l) => {
      l.trail.samples.forEach((q, i) => {
        const terrace = l.terraceY(q.x, q.z)
        if (localSlope(l, i) < 0.02) expect(Math.abs(terrace - q.y), `${l.biome}:${l.seed} s=${q.s.toFixed(2)}`).toBeLessThanOrEqual(0.02)
        expect(terrace - q.y).toBeLessThanOrEqual(1.0 + 1e-6)
        const shelf = l.features.shelf
        if (shelf) expect(Math.min(blobSd(shelf.blob, q.x, q.z), l.sdAt(q.x, q.z)[l.levels.length - 2] - 0.08)).toBeLessThanOrEqual(0)
      })
    })
  })

  it('climbs monotonically with bounded slope', () => {
    sweep((l) => {
      const s = l.trail.samples
      for (let i = 1; i < s.length; i++) expect(s[i].y).toBeGreaterThanOrEqual(s[i - 1].y - 1e-9)
      for (const r of l.trail.ramps) {
        const inRamp = s.filter((q) => q.s >= r.s0 && q.s <= r.s1)
        const rise = inRamp[inRamp.length - 1].y - inRamp[0].y
        expect(rise / (r.s1 - r.s0)).toBeLessThanOrEqual(Math.tan((27 * Math.PI) / 180))
      }
    })
  })

  it('has one ramp per tier above the lawn and balanced legs', () => {
    sweep((l) => {
      expect(l.trail.ramps.length).toBe(l.levels.length - 1 - LAWN)
      const shares = legShares(l)
      expect(shares.lawn).toBeGreaterThanOrEqual(SHARE_WINDOWS.lawn[0] - 1e-9)
      expect(shares.lawn).toBeLessThanOrEqual(SHARE_WINDOWS.lawn[1] + 1e-9)
      expect(shares.ramps).toBeGreaterThanOrEqual(SHARE_WINDOWS.ramps[0])
      expect(shares.summit).toBeGreaterThanOrEqual(SHARE_WINDOWS.summit[0] - 1e-9)
      expect(shares.summit).toBeLessThanOrEqual(SHARE_WINDOWS.summit[1] + 1e-9)
    })
  })

  it('keeps props, pillars and the waterfall clear of the trail and of each other', () => {
    sweep((l) => {
      for (const p of l.props) {
        if (p.kind === 'summitCairn') continue
        const rule = propRule(l.biome, p.kind)!
        expect(l.pathProject(p.x, p.z).d).toBeGreaterThanOrEqual(l.trail.halfWidth + rule.pathClear - 1e-9)
      }
      for (const pillar of l.features.pillars) expect(l.pathProject(pillar.x, pillar.z).d).toBeGreaterThanOrEqual(l.trail.halfWidth + pillar.r + 0.25 - 1e-9)
      for (const q of l.features.fall?.samples ?? []) expect(l.pathProject(q[0], q[2]).d).toBeGreaterThanOrEqual(l.trail.halfWidth + 0.25 - 1e-9)
      const scatterable = l.props.filter((p) => !['summitCairn', 'tent', 'campfire'].includes(p.kind))
      for (let i = 0; i < scatterable.length; i++) {
        for (let j = i + 1; j < scatterable.length; j++) {
          const a = scatterable[i]
          const b = scatterable[j]
          const ra = (propRule(l.biome, a.kind)!.spacing / 2) * a.scale
          const rb = (propRule(l.biome, b.kind)!.spacing / 2) * b.scale
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(Math.min(ra, rb))
        }
      }
    })
  })

  it('places at least 70% of every key prop kind on the jungle', () => {
    for (const seed of seedsFor('jungle')) {
      const l = layoutFor('jungle', seed)
      for (const rule of BIOME_TERRAIN.jungle.props.filter((r) => r.key)) {
        expect(l.props.filter((p) => p.kind === rule.kind).length, `${seed} ${rule.kind}`).toBeGreaterThanOrEqual(Math.ceil(rule.count * 0.7))
      }
    }
  })

  it('leaves room beside the path for entry markers on most flat runs', () => {
    sweep((l) => {
      const s = l.trail.samples
      let flat = 0
      let roomy = 0
      for (let i = 1; i < s.length - 1; i++) {
        if (localSlope(l, i) >= 0.02 || s[i].y < l.levels[LAWN].y - 1e-6) continue
        flat++
        const tx = s[i + 1].x - s[i - 1].x
        const tz = s[i + 1].z - s[i - 1].z
        const tl = Math.hypot(tx, tz) || 1
        const room = Math.max(l.walkableRun(s[i].x, s[i].z, -tz / tl, tx / tl, s[i].y, 0.4), l.walkableRun(s[i].x, s[i].z, tz / tl, -tx / tl, s[i].y, 0.4))
        if (room >= 0.25) roomy++
      }
      expect(roomy / flat).toBeGreaterThanOrEqual(0.6)
    })
  })
})

describe('islandAnchors / focusPose', () => {
  it('frames the island above a bottom sheet and below the header', () => {
    const l = layoutFor('jungle', 1)
    const base = { aspect: 390 / 845, fovDeg: 50, insetRightPx: 0, viewportPx: { width: 390, height: 845 }, orbit: 0 }
    const open = focusPose(l, base)
    const sheet = focusPose(l, { ...base, insetTopPx: 70, insetBottomPx: 300 })
    // less room: the camera backs off (or is already at its limit) ...
    expect(sheet.distance).toBeGreaterThanOrEqual(open.distance)
    // ... and looks lower, so the island sits higher on screen
    expect(sheet.lookAt[1]).toBeLessThan(open.lookAt[1])
    // equal insets top and bottom don't move the look-at
    const even = focusPose(l, { ...base, insetTopPx: 100, insetBottomPx: 100 })
    expect(even.lookAt[1]).toBeCloseTo(open.lookAt[1], 6)
  })

  it('keeps the label within a metre of the summit', () => {
    sweep((l) => expect(islandAnchors(l).labelY).toBeLessThanOrEqual(l.summitTopY + 1.0 + 1e-9))
  })

  it('frames the whole island at every aspect and orbit angle', () => {
    const l = layoutFor('jungle', 1)
    for (const [w, h] of [[1600, 900], [1200, 900], [390, 845]]) {
      for (const orbit of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const pose = focusPose(l, { aspect: w / h, fovDeg: 50, insetRightPx: 0, viewportPx: { width: w, height: h }, orbit })
        expect(pose.distance).toBeGreaterThanOrEqual(7)
        expect(pose.distance).toBeLessThanOrEqual(17)
        expect(pose.elevation).toBeCloseTo((38 * Math.PI) / 180, 6)
        expect(pose.azimuth).toBeCloseTo(Math.PI / 4 + orbit, 6)
        if (pose.distance < 17) {
          const dx = pose.position[0] - pose.lookAt[0]
          const dz = pose.position[2] - pose.lookAt[2]
          expect(Math.atan2(dz, dx)).toBeCloseTo(Math.atan2(Math.sin(Math.PI / 4 + orbit), Math.cos(Math.PI / 4 + orbit)), 6)
        }
      }
    }
  })
})
