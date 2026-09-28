import type {
  Biome, CaveSpec, FallSpec, IslandFeatures, IslandTrail, Level, PillarSpec, PolarBlob, PropKind, PropPlacement, Vec2, Vec3, VineSpec, WaterRockSpec,
} from './types'
import { WATER_Y } from './types'
import type { BiomeTerrainConfig, PropRule } from './biomes'
import { createStream } from './random'
import type { Stream } from './random'
import type { LevelField } from './shapes'
import { BEACH, HALO_MAX, LAWN, blobSd } from './shapes'
import { rayExit } from './query'
import { levelCore } from './trailPlan'
import { CAMERA_DIR_LOCAL } from './orientation'

export const PROP_KINDS: readonly PropKind[] = [
  'palm', 'canopyTree', 'pine', 'bareTree', 'ashTree', 'cactus',
  'bush', 'fernRosette', 'grassTuft', 'flower', 'mushroom', 'heather', 'coralPuff', 'anemone',
  'stump', 'log', 'heroRock', 'boulder', 'waterRock', 'lily', 'iceFloe',
  'tent', 'campfire', 'signpost', 'summitCairn',
]
const LANDMARK_KINDS: ReadonlySet<PropKind> = new Set(['signpost', 'summitCairn', 'tent', 'campfire', 'stump', 'heroRock'])
const SUMMIT_PROP_MAX = 0.85
const PROP_TOP_MAX = 3.0
const COT_35 = 1.43
const TAU = Math.PI * 2

export interface ScatterInput {
  readonly biome: Biome
  readonly seed: number
  readonly cfg: BiomeTerrainConfig
  readonly frame: { readonly front: number; readonly side: 1 | -1; readonly centres: readonly Vec2[]; readonly blobs: readonly (PolarBlob | null)[] }
  readonly levels: readonly Level[]
  readonly field: LevelField
  readonly trail: IslandTrail
  readonly pathProject: (x: number, z: number) => { d: number; y: number; s: number }
}

interface Disc {
  readonly x: number
  readonly z: number
  readonly r: number
}

const polar = (c: Vec2, a: number, r: number): Vec2 => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]

/** Spec §3.4 features and §3.9 props, placed after the trail so both can keep clear of it. */
export function placeFeaturesAndProps(input: ScatterInput): { features: IslandFeatures; props: PropPlacement[] } {
  const { cfg, field, levels, trail, pathProject, seed } = input
  const { front, side } = input.frame
  const top = levels.length - 1
  const half = trail.halfWidth
  const decor = createStream(seed, 4)
  const taken: Disc[] = []
  const props: PropPlacement[] = []
  const free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r)
  const pathD = (x: number, z: number) => pathProject(x, z).d
  const frontDot = (x: number, z: number) => (x * Math.cos(front) + z * Math.sin(front)) / (Math.hypot(x, z) || 1)
  const facing = (x: number, z: number) => 0.5 + 0.5 * frontDot(x, z)
  const inside = (level: number) => (x: number, z: number) => field.sdAt(x, z)[level] > 0
  const outward = (level: number, x: number, z: number): Vec2 => {
    const e = 0.02
    const nx = field.sdAt(x - e, z)[level] - field.sdAt(x + e, z)[level]
    const nz = field.sdAt(x, z - e)[level] - field.sdAt(x, z + e)[level]
    const len = Math.hypot(nx, nz) || 1
    return [nx / len, nz / len]
  }
  const topCore = levelCore(field, top, input.frame.centres[top])

  const shelf = placeShelf()
  const inShelf = (x: number, z: number) => shelf !== null && Math.min(blobSd(shelf.blob, x, z), field.sdAt(x, z)[top - 1] - 0.08) > 0
  const crater = cfg.summit.shape === 'crater'
    ? { x: input.frame.centres[top][0], z: input.frame.centres[top][1], r: cfg.summit.craterRadius ?? 0.38, plugY: cfg.summit.plugY ?? levels[top].y - 0.25 }
    : null
  const groundAt = (x: number, z: number) => {
    const level = field.levelAt(x, z)
    if (level < BEACH) return WATER_Y
    let y = field.terraceY(x, z)
    if (inShelf(x, z)) y = Math.max(y, shelf!.y)
    if (crater && Math.hypot(x - crater.x, z - crater.z) < crater.r) y = crater.plugY
    return y
  }

  const fall = placeFall()
  if (fall) for (const q of fall.samples) taken.push({ x: q[0], z: q[2], r: 0.18 })
  const pool = placePool()
  if (pool) taken.push({ x: pool.x, z: pool.z, r: pool.r + 0.05 })
  const start = trail.samples[0]
  const end = trail.samples[trail.samples.length - 1]
  taken.push({ x: start.x, z: start.z, r: 0.3 }, { x: end.x, z: end.z, r: 0.25 })

  const ruleFor = (kind: PropKind) => cfg.props.find((r) => r.kind === kind)
  const pushProp = (kind: PropKind, x: number, z: number, rotY: number, scale = 1, tilt: Vec2 = [0, 0]) =>
    props.push({ kind, x, y: groundAt(x, z), z, rotY, scale, tiltX: tilt[0], tiltZ: tilt[1] })

  // Landmarks first (spec §3.9 order): signpost, summit cairn, camp, summit stump, hero rock.
  placeLandmarks()
  const pillars = placePillars()
  const waterRocks = placeWaterRocks()
  const vines = placeVines()
  const caves = placeCaves()
  const rules = cfg.props.filter((r) => !LANDMARK_KINDS.has(r.kind)).slice().sort((a, b) => b.height - a.height)
  for (const rule of rules) scatterRule(rule, createStream(seed, 100 + PROP_KINDS.indexOf(rule.kind)))

  const camp = props.find((p) => p.kind === 'tent')
  return {
    features: {
      shelf,
      crater,
      pool,
      fall,
      pillars,
      vines,
      caves,
      waterRocks,
      camp: camp ? { x: camp.x, y: camp.y, z: camp.z, rotY: camp.rotY } : null,
    },
    props,
  }

  function placeShelf(): IslandFeatures['shelf'] {
    const spec = cfg.features.shelf
    if (!spec) return null
    const below = top - 1
    let best: IslandFeatures['shelf'] = null
    let bestScore = -Infinity
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU
      const rim = rayExit(inside(top), topCore[0], topCore[1], a)
      const c = polar(topCore, a, rim + 0.5 * spec.radius)
      const blob: PolarBlob = { cx: c[0], cz: c[1], radius: spec.radius, harmonics: [{ n: 3, amp: 0.1, phase: decor.next() * TAU }], lobes: [], flutes: null }
      let ok = true
      for (let i = 0; i < 16 && ok; i++) {
        const p = polar(c, (i / 16) * TAU, spec.radius * 0.85)
        if (field.sdAt(p[0], p[1])[below] < 0.12 || pathD(p[0], p[1]) < half + 0.2) ok = false
      }
      if (!ok || trail.samples.some((q) => blobSd(blob, q.x, q.z) > -0.1)) continue
      const score = -Math.abs(facing(c[0], c[1]) - 0.55) + 0.1 * decor.next()
      if (score > bestScore) {
        bestScore = score
        best = { blob, y: spec.y, baseY: levels[below].y }
      }
    }
    return best
  }

  function placeFall(): FallSpec | null {
    const kind = cfg.features.fall
    if (!kind) return null
    const stream = createStream(seed, 5)
    const source: { c: Vec2; test: (x: number, z: number) => boolean } = shelf
      ? { c: [shelf.blob.cx, shelf.blob.cz], test: inShelf }
      : { c: topCore, test: inside(top) }
    let best: FallSpec | null = null
    let bestScore = -Infinity
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * TAU
      const rim = rayExit(source.test, source.c[0], source.c[1], a)
      const spring = polar(source.c, a, rim - 0.12)
      if (pathD(spring[0], spring[1]) < half + 0.4) continue
      const samples: Vec3[] = []
      for (let r = Math.max(0.05, rim - 0.12); r < 5; r += 0.03) {
        const [x, z] = polar(source.c, a, r)
        if (field.levelAt(x, z) < BEACH || pathD(x, z) < half + 0.25) break
        samples.push([x, groundAt(x, z), z])
      }
      const drops = new Set(samples.map((q) => q[1].toFixed(3))).size - 1
      if (drops < 1) continue
      const dir: Vec2 = [Math.cos(a), Math.sin(a)]
      const score = -2.5 * Math.abs(facing(spring[0] + dir[0], spring[1] + dir[1]) - 0.75) + 0.5 * drops + 0.05 * stream.next()
      if (score > bestScore) {
        bestScore = score
        best = { samples, dir, kind }
      }
    }
    return best
  }

  function placePool(): IslandFeatures['pool'] {
    const kind = cfg.features.pool
    if (!kind) return null
    const candidates: Vec2[] = []
    if ((kind === 'tide' || kind === 'ember') && fall) {
      const last = fall.samples[fall.samples.length - 1]
      candidates.push([last[0], last[2]])
    } else {
      for (let k = 0; k < 40; k++) {
        const a = front + (decor.next() - 0.5) * 1.6
        const rim = rayExit(inside(LAWN), 0, 0, a)
        candidates.push(polar([0, 0], a, rim - 0.45 - decor.next() * 0.4))
      }
    }
    for (const [x, z] of candidates) {
      if (field.levelAt(x, z) !== LAWN) continue
      const room = Math.min(field.sdAt(x, z)[LAWN], -field.sdAt(x, z)[LAWN + 1]) - 0.06
      const r = Math.min(0.28, room)
      if (r < 0.15 || pathD(x, z) < half + 0.3 + r) continue
      return { x, z, r, y: levels[LAWN].y + 0.006, kind }
    }
    return null
  }

  function placeLandmarks() {
    const s3 = trail.samples[Math.min(4, trail.samples.length - 1)]
    const s4 = trail.samples[Math.min(6, trail.samples.length - 1)]
    const tx = s4.x - s3.x
    const tz = s4.z - s3.z
    const tl = Math.hypot(tx, tz) || 1
    for (const sign of [1, -1]) {
      const x = s3.x - (tz / tl) * 0.34 * sign
      const z = s3.z + (tx / tl) * 0.34 * sign
      if (field.levelAt(x, z) >= BEACH && pathD(x, z) > half + 0.08) {
        pushProp('signpost', x, z, Math.atan2(tx, tz))
        taken.push({ x, z, r: 0.12 })
        break
      }
    }
    props.push({ kind: 'summitCairn', x: end.x, y: end.y, z: end.z, rotY: decor.next() * TAU, scale: 1, tiltX: 0, tiltZ: 0 })
    if (cfg.features.camp) placeCamp()
    if (ruleFor('stump')) {
      for (let k = 0; k < 40; k++) {
        const a = decor.next() * TAU
        const [x, z] = polar([end.x, end.z], a, 0.4 + decor.next() * 0.2)
        if (field.levelAt(x, z) !== top || field.sdAt(x, z)[top] < 0.2 || pathD(x, z) < half + 0.2 || !free(x, z, 0.15)) continue
        pushProp('stump', x, z, decor.next() * TAU)
        taken.push({ x, z, r: 0.15 })
        break
      }
    }
    if (ruleFor('heroRock')) {
      for (let k = 0; k < 40; k++) {
        const a = front + side * (0.4 + decor.next() * 0.5)
        const rim = rayExit(inside(LAWN), 0, 0, a)
        const [x, z] = polar([0, 0], a, rim - 0.55 - decor.next() * 0.4)
        if (field.levelAt(x, z) !== LAWN || -field.sdAt(x, z)[LAWN + 1] < 0.35 || pathD(x, z) < half + 0.3 || !free(x, z, 0.3)) continue
        pushProp('heroRock', x, z, decor.next() * TAU)
        taken.push({ x, z, r: 0.3 })
        break
      }
    }
  }

  function placeCamp() {
    for (let k = 0; k < 600; k++) {
      const level = k < 300 ? LAWN + 1 : LAWN
      const q = trail.samples[Math.floor(decor.next() * trail.samples.length)]
      const a = decor.next() * TAU
      const [x, z] = polar([q.x, q.z], a, half + 0.3 + decor.next() * 0.25)
      if (field.levelAt(x, z) !== level || inShelf(x, z) || !free(x, z, 0.3)) continue
      const sd = field.sdAt(x, z)
      if (sd[level] < 0.3 || (level < top && -sd[level + 1] < 0.35)) continue
      const p = pathProject(x, z)
      if (p.d < half + 0.25 || p.d > half + 0.6) continue
      const rotY = Math.atan2(q.x - x, q.z - z)
      pushProp('tent', x - Math.cos(rotY) * 0.1, z + Math.sin(rotY) * 0.1, rotY)
      pushProp('campfire', x + Math.cos(rotY) * 0.14, z - Math.sin(rotY) * 0.14, decor.next() * TAU)
      taken.push({ x, z, r: 0.3 })
      return
    }
  }

  function placePillars(): PillarSpec[] {
    const out: PillarSpec[] = []
    const want = cfg.features.pillars
    for (let tries = 0; tries < 800 && out.length < want; tries++) {
      const hugging = out.length < Math.ceil(want / 2)
      const [x, z] = polar([0, 0], decor.next() * TAU, Math.sqrt(decor.next()) * 3)
      const level = field.levelAt(x, z)
      if (level < LAWN || level >= top || inShelf(x, z)) continue
      const sd = field.sdAt(x, z)
      const gap = levels[level + 1].y - levels[level].y
      const r = hugging ? 0.17 + decor.next() * 0.08 : 0.11 + decor.next() * 0.05
      if (hugging ? !(-sd[level + 1] > 0.1 && -sd[level + 1] < 0.2) : !(sd[level] > 0.16 && sd[level] < 0.3 && -sd[level + 1] > 0.4)) continue
      if (pathD(x, z) < half + r + 0.25 || !free(x, z, r + 0.1)) continue
      const height = hugging ? gap * (0.7 + decor.next() * 0.35) : 0.45 + decor.next() * 0.35
      taken.push({ x, z, r: r + 0.1 })
      out.push({ x, z, r, baseY: levels[level].y, topY: levels[level].y + height, sides: decor.next() < 0.5 ? 6 : 7, grassCap: decor.next() < 0.5, rot: decor.next() * TAU })
    }
    return out
  }

  function placeWaterRocks(): WaterRockSpec[] {
    const out: WaterRockSpec[] = []
    for (let tries = 0; tries < 400 && out.length < cfg.features.waterRocks; tries++) {
      const a = decor.next() * TAU
      const r = 0.1 + decor.next() * 0.08
      const d = rayExit(inside(1), 0, 0, a) + 0.1 + r + decor.next() * 0.2
      if (d + r > HALO_MAX - 0.05) continue
      const [x, z] = polar([0, 0], a, d)
      if (Math.hypot(x - start.x, z - start.z) < 0.8 || !free(x, z, r + 0.15)) continue
      taken.push({ x, z, r: r + 0.15 })
      out.push({ x, z, r, height: 0.06 + decor.next() * 0.12, rot: decor.next() * TAU })
    }
    return out
  }

  function placeVines(): VineSpec[] {
    const out: VineSpec[] = []
    for (let tries = 0; tries < 400 && out.length < cfg.features.vines; tries++) {
      const level = LAWN + 1 + Math.floor(decor.next() * (top - LAWN))
      const c = levelCore(field, level, input.frame.centres[level])
      const a = decor.next() * TAU
      const rim = rayExit(inside(level), c[0], c[1], a)
      const [x, z] = polar(c, a, rim - 0.005)
      const [nx, nz] = outward(level, x, z)
      if (pathD(x + nx * 0.15, z + nz * 0.15) < half + 0.3) continue
      if (fall && fall.samples.some((q) => Math.hypot(q[0] - x, q[2] - z) < 0.35)) continue
      if (out.some((v) => Math.hypot(v.x - x, v.z - z) < 0.45)) continue
      const wall = levels[level].y - levels[level - 1].y
      out.push({ x, y: levels[level].y, z, rotY: Math.atan2(nx, nz), length: Math.min(wall * 0.5, 0.2 + decor.next() * 0.25) })
    }
    return out
  }

  function placeCaves(): CaveSpec[] {
    if (!cfg.features.cave) return []
    for (let tries = 0; tries < 120; tries++) {
      const level = LAWN + 1 + Math.floor(decor.next() * (top - LAWN))
      const wall = levels[level].y - levels[level - 1].y
      if (wall < 0.6) continue
      const c = levelCore(field, level, input.frame.centres[level])
      const a = decor.next() * TAU
      const rim = rayExit(inside(level), c[0], c[1], a)
      const [rx, rz] = polar(c, a, rim)
      if (facing(rx, rz) < 0.55) continue
      const [nx, nz] = outward(level, rx, rz)
      const foot: Vec2 = [rx + nx * cfg.cliff.lean * wall, rz + nz * cfg.cliff.lean * wall]
      if (pathD(foot[0], foot[1]) < half + 0.35 || !free(foot[0], foot[1], 0.25) || inShelf(foot[0], foot[1])) continue
      taken.push({ x: foot[0], z: foot[1], r: 0.25 })
      return [{ x: foot[0], y: levels[level - 1].y, z: foot[1], rotY: Math.atan2(nx, nz), width: 0.3, height: 0.24 }]
    }
    return []
  }

  function blocksSightline(x: number, y: number, z: number, h: number, r: number): boolean {
    if (h <= 0.3) return false
    for (let i = 0; i < trail.samples.length; i += 2) {
      const q = trail.samples[i]
      const along = (x - q.x) * CAMERA_DIR_LOCAL[0] + (z - q.z) * CAMERA_DIR_LOCAL[2]
      const lateral = (x - q.x) * CAMERA_DIR_LOCAL[2] - (z - q.z) * CAMERA_DIR_LOCAL[0]
      if (along > 0 && along < COT_35 * h + 0.3 && Math.abs(lateral) < r + 0.15 && q.y < y + h) return true
    }
    return false
  }

  function scatterRule(rule: PropRule, stream: Stream) {
    let placed = 0
    for (let tries = 0; tries < rule.count * 120 && placed < rule.count; tries++) {
      const [x, z] = polar([0, 0], stream.next() * TAU, Math.sqrt(stream.next()) * 3.3)
      const scale = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * stream.next()
      const rotY = stream.next() * TAU
      const level = field.levelAt(x, z)
      if (rule.levels.includes('water')) {
        if (level >= BEACH || Math.hypot(x, z) > HALO_MAX - 0.1) continue
      } else {
        if (level < BEACH) continue
        const role = levels[level].role
        const allowed = rule.levels.includes(role === 'tier' ? 'tier' : (role as 'beach' | 'lawn' | 'summit'))
        if (!allowed) continue
        const sd = field.sdAt(x, z)
        const edge = sd[level]
        const toCliff = level < top ? -sd[level + 1] : 9
        if (edge < 0.08) continue
        if (rule.edge && (edge < rule.edge[0] || edge > rule.edge[1])) continue
        if (rule.cliffFoot ? toCliff < rule.cliffFoot[0] || toCliff > rule.cliffFoot[1] : toCliff < 0.12) continue
        if (rule.facing === 'back' && frontDot(x, z) >= 0.25) continue
        if (rule.facing === 'front' && frontDot(x, z) <= 0.3) continue
        if ((pool && Math.hypot(x - pool.x, z - pool.z) < pool.r + 0.1) || (crater && Math.hypot(x - crater.x, z - crater.z) < crater.r + 0.1)) continue
      }
      if (pathD(x, z) < half + rule.pathClear) continue
      const radius = (rule.spacing * 0.5) * scale
      if (!free(x, z, radius)) continue
      const y = rule.levels.includes('water') ? WATER_Y + 0.004 : groundAt(x, z)
      const h = rule.height * scale
      if (y + h > PROP_TOP_MAX || (level === top && h > SUMMIT_PROP_MAX)) continue
      if (blocksSightline(x, y, z, h, radius)) continue
      let tilt: Vec2 = [0, 0]
      if (rule.tilt && level >= LAWN) {
        const [nx, nz] = outward(level, x, z)
        tilt = [rule.tilt * nz, -rule.tilt * nx]
      }
      taken.push({ x, z, r: radius })
      props.push({ kind: rule.kind, x, y, z, rotY, scale, tiltX: tilt[0], tiltZ: tilt[1] })
      placed++
    }
  }
}
