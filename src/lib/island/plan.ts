import { hash01 } from '../archipelago'
import type { Biome, IslandLayout, Level, PolarBlob, Vec2 } from './types'
import { LAYOUT_VERSION, WATER_Y } from './types'
import { BIOME_TERRAIN, PATTERN_PRESETS } from './biomes'
import type { BiomeTerrainConfig } from './biomes'
import { createStream, valueNoise2 } from './random'
import type { Stream } from './random'
import { BEACH, FOAM_MAX, FOOTPRINT_MAX, HALO_MAX, LAWN, blobSd, buildLevelField, scaleBlob } from './shapes'
import type { LedgeSpec, LevelField, RaiseWindow } from './shapes'
import { SegmentHash, bakeHeightGrid, rayExit, walkableRun } from './query'
import { PATH_HALF_WIDTH, PEAK_SLOPE_DEG, SHARE_WINDOWS, planTrail } from './trailPlan'
import type { LegShares } from './trailPlan'
import { placeFeaturesAndProps } from './scatter'

export const SUMMIT_MAX_Y = 2.2
export const PROP_TOP_MAX_Y = 3.0
const FOOTPRINT_TARGET = 3.0
const TAU = Math.PI * 2

function harmonics(stream: Stream, amp: number): PolarBlob['harmonics'] {
  return [2, 3, 4, 5].map((n) => ({ n, amp: (amp * (0.35 + stream.next())) / n ** 0.6, phase: stream.next() * TAU }))
}

function flutes(stream: Stream, cfg: BiomeTerrainConfig['cliff']): PolarBlob['flutes'] {
  const bins = Math.round(cfg.binsPerRadian * TAU)
  const offsets = new Float32Array(bins)
  for (let i = 0; i < bins; i++) offsets[i] = (stream.next() * 2 - 1) * cfg.fluteDepth
  return { binsPerRadian: cfg.binsPerRadian, depth: cfg.fluteDepth, offsets }
}

const polar = (c: Vec2, a: number, r: number) => ({ x: c[0] + Math.cos(a) * r, z: c[1] + Math.sin(a) * r })

function maxRadius(inside: (x: number, z: number) => boolean): number {
  let max = 0
  for (let i = 0; i < 180; i++) max = Math.max(max, rayExit(inside, 0, 0, (i / 180) * TAU, 4.5))
  return max
}

interface Frame {
  readonly cfg: BiomeTerrainConfig
  readonly front: number
  readonly side: 1 | -1
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly centres: readonly Vec2[]
  readonly buildField: (raises: readonly (readonly RaiseWindow[])[]) => LevelField
}

function buildFrame(biome: Biome, seed: number): Frame {
  const cfg = BIOME_TERRAIN[biome]
  const preset = PATTERN_PRESETS[cfg.pattern]
  const outline = createStream(seed, 1)
  const driftStream = createStream(seed, 2)
  const side = driftStream.sign()
  const front = Math.PI / 2 + driftStream.range(-0.25, 0.25)
  const drift = front + Math.PI + side * driftStream.range(0.55, 0.9)
  const dv: Vec2 = [Math.cos(drift), Math.sin(drift)]

  const n1 = valueNoise2(seed, 300)
  const n2 = valueNoise2(seed, 301)
  const n3 = valueNoise2(seed, 302)
  const n4 = valueNoise2(seed, 303)
  const wobble = (x: number, z: number) => 0.09 * (2 * n1(x * 1.1, z * 1.1) - 1) + 0.035 * (2 * n2(x * 3.1 + 11, z * 3.1) - 1)
  const crag = (x: number, z: number) => 0.07 * (2 * n3(x * 4.3 + 23, z * 4.3 - 9) - 1)
  const widthNoise = (x: number, z: number) => 2 * n4(x * 1.3 + 40, z * 1.3) - 1

  let beachR = outline.range(cfg.beach.radius[0], cfg.beach.radius[1])
  const origin: Vec2 = [0, 0]
  const lobes = [
    { ...polar(origin, front + side * outline.range(-0.25, 0.25), 0.45 * beachR), r: outline.range(0.8, 0.88) * beachR },
    { ...polar(origin, front - side * outline.range(1.35, 1.75), 0.69 * beachR), r: outline.range(0.53, 0.62) * beachR },
  ]
  const spit = { ...polar(origin, front + side * outline.range(1.9, 2.4), beachR), r: outline.range(0.24, 0.3) * beachR }
  if (cfg.beach.spit) lobes.push(spit)
  let beach: PolarBlob = { cx: 0, cz: 0, radius: beachR, harmonics: harmonics(outline, cfg.beach.harmonicAmp), lobes, flutes: null }

  // Footprint normalisation (spec §3.4): scale the whole plan, not just the beach, so proportions survive.
  let scale = 1
  for (let pass = 0; pass < 3; pass++) {
    const max = maxRadius((x, z) => blobSd(beach, x, z) + wobble(x, z) > 0)
    if (max <= FOOTPRINT_TARGET) break
    const k = FOOTPRINT_TARGET / max
    beach = scaleBlob(beach, k)
    scale *= k
  }
  beachR = beach.radius

  const levels: Level[] = [
    { index: 0, role: 'shallow', y: preset.shallowY, wall: 'none' },
    { index: 1, role: 'foam', y: preset.foamY, wall: 'none' },
    { index: 2, role: 'beach', y: preset.beachY, wall: 'sand' },
    { index: 3, role: 'lawn', y: cfg.lawnY, wall: 'lip' },
  ]
  const blobs: (PolarBlob | null)[] = [null, null, beach, null]
  const centres: Vec2[] = [origin, origin, origin, origin]
  const ledges: (LedgeSpec | null)[] = [null, null, null, null]
  let prevR = beachR
  let prevC: Vec2 = origin
  cfg.tiers.forEach((tier, t) => {
    const index = LAWN + 1 + t
    const radius = prevR * tier.radiusRatio
    const c: Vec2 = [prevC[0] + dv[0] * tier.drift * scale, prevC[1] + dv[1] * tier.drift * scale]
    const tierLobes = t === 0 ? [{ ...polar(c, drift + side * outline.range(1.3, 1.7), 0.62 * radius), r: outline.range(0.38, 0.46) * radius }] : []
    levels.push({ index, role: t === cfg.tiers.length - 1 ? 'summit' : 'tier', y: tier.y, wall: 'cliff' })
    blobs.push({ cx: c[0], cz: c[1], radius, harmonics: harmonics(outline, tier.harmonicAmp), lobes: tierLobes, flutes: flutes(createStream(seed, 200 + index), cfg.cliff) })
    centres.push(c)
    ledges.push({ back: tier.ledge.back, front: tier.ledge.front, lean: cfg.cliff.lean * (tier.y - levels[index - 1].y) })
    prevR = radius
    prevC = c
  })

  const top = levels.length - 1
  const dome = cfg.summit.shape === 'dome' ? { level: top, height: cfg.summit.domeHeight ?? 0.3, radius: cfg.summit.domeRadius ?? 0.7 } : null
  const crater = cfg.summit.shape === 'crater' ? { x: centres[top][0], z: centres[top][1], r: cfg.summit.craterRadius ?? 0.38 } : null
  const buildField = (raises: readonly (readonly RaiseWindow[])[]) =>
    buildLevelField({ levels, blobs, front, beachWidth: cfg.beach.width, ledges, raises, wobble, crag, widthNoise, dome, crater })

  return { cfg, front, side, levels, blobs, centres, buildField }
}

export const __testHooks: { forceInvalid: ((seed: number) => boolean) | null } = { forceInvalid: null }

function buildOnce(biome: Biome, seed: number): IslandLayout {
  const frame = buildFrame(biome, seed)
  const { cfg, levels } = frame
  const planned = planTrail(
    { levels, centres: frame.centres, front: frame.front, side: frame.side, lean: cfg.cliff.lean, summit: cfg.summit, buildField: frame.buildField },
    createStream(seed, 3),
  )
  const field = planned.field
  const trail = planned.trail
  const hash = new SegmentHash(trail.samples)
  const pathProject = (x: number, z: number) => hash.project(x, z)

  const placed = placeFeaturesAndProps({ biome, seed, cfg, frame: { front: frame.front, side: frame.side, centres: frame.centres, blobs: frame.blobs }, levels, field, trail, pathProject })
  const { features } = placed

  const inShelf = (x: number, z: number) => features.shelf !== null && Math.min(blobSd(features.shelf.blob, x, z), field.sdAt(x, z)[LAWN + 1] - 0.08) > 0
  const featureHeight = (x: number, z: number, base: number) => {
    let y = base
    if (features.shelf && inShelf(x, z)) y = Math.max(y, features.shelf.y)
    if (features.crater && Math.hypot(x - features.crater.x, z - features.crater.z) < features.crater.r) y = Math.max(y, features.crater.plugY)
    if (features.pool && Math.hypot(x - features.pool.x, z - features.pool.z) < features.pool.r) y = Math.max(y, features.pool.y)
    return y
  }
  const groundHeightAt = (x: number, z: number) => {
    const sd = field.sdAt(x, z)
    let level = 0
    while (level < sd.length && sd[level] > 0) level++
    level -= 1
    if (level < BEACH) return WATER_Y
    const p = hash.project(x, z)
    if (p.d <= trail.halfWidth) return p.y
    return featureHeight(x, z, field.levelTopY(level, x, z, sd))
  }
  const onLand = (x: number, z: number) => field.levelAt(x, z) >= BEACH
  const heightGrid = bakeHeightGrid((x, z) => {
    const level = field.levelAt(x, z)
    return level < BEACH ? WATER_Y : featureHeight(x, z, field.terraceY(x, z))
  })

  const end = trail.samples[trail.samples.length - 1]
  const cfgTop = cfg.tiers[cfg.tiers.length - 1]
  const summitTopY = cfg.summit.shape === 'dome' ? cfgTop.y + (cfg.summit.domeHeight ?? 0) : cfgTop.y
  return {
    version: LAYOUT_VERSION,
    biome,
    seed,
    pattern: cfg.pattern,
    front: frame.front,
    side: frame.side,
    levels,
    blobs: frame.blobs,
    footprintRadius: maxRadius((x, z) => field.sdAt(x, z)[BEACH] > 0),
    haloRadius: maxRadius((x, z) => field.sdAt(x, z)[0] > 0),
    summit: [end.x, end.y, end.z],
    summitTopY,
    trail,
    features,
    props: placed.props,
    heightGrid,
    sdAt: field.sdAt,
    levelAt: field.levelAt,
    terraceY: field.terraceY,
    groundHeightAt,
    pathProject,
    walkableRun: (x, z, dirX, dirZ, refY, maxDist) => walkableRun(groundHeightAt, onLand, x, z, dirX, dirZ, refY, maxDist),
  }
}

/** Spec §3.5 step 9. Returns human-readable failures; [] means valid. */
export function validateLayout(layout: IslandLayout): string[] {
  const errors: string[] = []
  const samples = layout.trail.samples
  const top = layout.levels.length - 1
  if (layout.levelAt(samples[0].x, samples[0].z) !== BEACH) errors.push('trail does not start on the beach')
  const last = samples[samples.length - 1]
  const endLevel = layout.levelAt(last.x, last.z)
  if (!(endLevel === top || (layout.features.crater && endLevel === top))) errors.push(`trail ends on level ${endLevel}, not the summit`)
  const tanPeak = Math.tan((PEAK_SLOPE_DEG * Math.PI) / 180)
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].y < samples[i - 1].y - 1e-9) {
      errors.push(`trail descends at sample ${i}`)
      break
    }
  }
  for (let i = 0, j = 0; i < samples.length; i++) {
    while (j < samples.length - 1 && samples[j].s - samples[i].s < 0.1) j++
    const run = samples[j].s - samples[i].s
    if (run >= 0.1 - 1e-9 && (samples[j].y - samples[i].y) / run > tanPeak) {
      errors.push(`trail slope exceeds ${PEAK_SLOPE_DEG} degrees at s=${samples[i].s.toFixed(2)}`)
      break
    }
  }
  for (const q of samples) {
    if (Math.abs(layout.groundHeightAt(q.x, q.z) - q.y) > 1e-3) {
      errors.push(`waypoint off the ground at s=${q.s.toFixed(2)}`)
      break
    }
  }
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 2)]
    const b = samples[Math.min(samples.length - 1, i + 2)]
    const slope = (b.y - a.y) / Math.max(1e-6, b.s - a.s)
    const q = samples[i]
    if (slope < 0.02 && Math.abs(layout.terraceY(q.x, q.z) - q.y) > 0.02) {
      errors.push(`flat trail off its cap at s=${q.s.toFixed(2)}`)
      break
    }
    const tx = b.x - a.x
    const tz = b.z - a.z
    const tl = Math.hypot(tx, tz) || 1
    const tolerance = slope < 0.02 ? 0.03 : 0.06
    const off = PATH_HALF_WIDTH - 0.02
    if ([1, -1].some((sign) => Math.abs(layout.groundHeightAt(q.x - (tz / tl) * off * sign, q.z + (tx / tl) * off * sign) - q.y) > tolerance)) {
      errors.push(`corridor not flat across at s=${q.s.toFixed(2)}`)
      break
    }
  }
  const clash = selfOverlap(layout)
  if (clash) errors.push(clash)
  if (layout.footprintRadius > FOOTPRINT_MAX + 1e-6) errors.push(`footprint ${layout.footprintRadius.toFixed(3)} > ${FOOTPRINT_MAX}`)
  if (layout.haloRadius > HALO_MAX + 1e-6) errors.push(`halo ${layout.haloRadius.toFixed(3)} > ${HALO_MAX}`)
  if (layout.summitTopY > SUMMIT_MAX_Y + 1e-9) errors.push('summit too high')
  const shares = legShares(layout)
  for (const key of ['lawn', 'ramps', 'summit'] as const) {
    const [lo, hi] = SHARE_WINDOWS[key]
    if (shares[key] < lo - 1e-9 || shares[key] > hi + 1e-9) errors.push(`${key} share ${shares[key].toFixed(3)} outside [${lo}, ${hi}]`)
  }
  if (__testHooks.forceInvalid?.(layout.seed)) errors.push('forced invalid by test hook')
  return errors
}

export function legShares(layout: IslandLayout): LegShares {
  const { ramps, length } = layout.trail
  return {
    lawn: ramps[0].s0 / length,
    ramps: ramps.reduce((acc, r) => acc + (r.s1 - r.s0), 0) / length,
    summit: (length - ramps[ramps.length - 1].s1) / length,
  }
}

/** Two separate passes of the trail must not share corridor where their heights differ. */
function selfOverlap(layout: IslandLayout): string | null {
  const samples = layout.trail.samples
  const minGap = 2 * PATH_HALF_WIDTH + 0.06
  const cell = 0.4
  const grid = new Map<string, number[]>()
  samples.forEach((q, i) => {
    const key = `${Math.floor(q.x / cell)},${Math.floor(q.z / cell)}`
    const list = grid.get(key)
    if (list) list.push(i)
    else grid.set(key, [i])
  })
  for (let i = 0; i < samples.length; i++) {
    const q = samples[i]
    const ci = Math.floor(q.x / cell)
    const cj = Math.floor(q.z / cell)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const j of grid.get(`${ci + di},${cj + dj}`) ?? []) {
          if (j <= i) continue
          const p = samples[j]
          const d = Math.hypot(p.x - q.x, p.z - q.z)
          // Within one bend the path length between two points is at most ~pi/2 times their gap; more means a second pass.
          if (p.s - q.s < Math.max(0.5, 2 * d)) continue
          if (d < minGap && Math.abs(p.y - q.y) > 0.03) {
            return `trail overlaps itself at s=${q.s.toFixed(2)} and s=${p.s.toFixed(2)}`
          }
        }
      }
    }
  }
  return null
}

const MAX_VARIANTS = 3

/** Deterministic: the same (biome, seed) always yields the same layout. Retries variant seeds, then the biome's preview seed. */
export function buildIslandLayout(biome: Biome, seed: number): IslandLayout {
  const candidates = [seed]
  for (let variant = 1; variant <= MAX_VARIANTS; variant++) candidates.push(Math.floor(hash01(seed, variant, 97) * 1e6))
  for (const candidate of candidates) {
    const layout = buildOnce(biome, candidate)
    if (validateLayout(layout).length === 0) return layout
  }
  const fallback = buildOnce(biome, BIOME_TERRAIN[biome].previewSeed)
  if (import.meta.env?.DEV) console.warn(`[island] ${biome}:${seed} failed every variant; using preview seed`)
  return fallback
}

/** Data only (no closures), for determinism tests. */
export function serializeLayout(layout: IslandLayout): unknown {
  const { sdAt: _sdAt, levelAt: _levelAt, terraceY: _terraceY, groundHeightAt: _g, pathProject: _p, walkableRun: _w, heightGrid, blobs, ...data } = layout
  return {
    ...data,
    blobs: blobs.map((b) => (b ? { ...b, flutes: b.flutes ? { ...b.flutes, offsets: Array.from(b.flutes.offsets) } : null } : null)),
    heightGrid: { ...heightGrid, heights: Array.from(heightGrid.heights) },
    features: JSON.parse(JSON.stringify(layout.features, (_, v) => (v instanceof Float32Array ? Array.from(v) : v))),
  }
}

export { FOAM_MAX, FOOTPRINT_MAX, HALO_MAX }
