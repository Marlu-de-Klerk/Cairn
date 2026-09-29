import type { IslandTrail, Level, RampSpan, SummitShape, TrailSample, Vec2, Vec3 } from './types'
import type { LevelField, RaiseWindow } from './shapes'
import { BEACH, LAWN, smoothstep } from './shapes'
import type { Stream } from './random'
import { rayExit } from './query'

export const PATH_HALF_WIDTH = 0.17
export const LEDGE_LINE_MAX = 0.42
export const RAMP_SLOPE_DEG = 26
export const PEAK_SLOPE_DEG = 32
export const RAMP_LEDGE = 2 * PATH_HALF_WIDTH + 0.3
/** A ramp runs from RAMP_OFFSET outside its upper rim to RAMP_OFFSET inside it, so it crosses the contour at its midpoint. */
export const RAMP_OFFSET = 0.28
/** Upper-ledge width at a switchback, so the ramp arriving and the ramp leaving never share corridor at different heights. */
export const HAIRPIN_LEDGE = 1.1
export const SHARE_WINDOWS = { lawn: [0.2, 0.4], ramps: [0.25, 1], summit: [0.04, 0.18] } as const
const RAMP_FLAT = 0.2
const LANDING = 0.3
const SPACING = 0.04
const SMOOTH_PASSES = 40
const TAU = Math.PI * 2
const TAN_RAMP = Math.tan((RAMP_SLOPE_DEG * Math.PI) / 180)

export interface PlannerInput {
  readonly levels: readonly Level[]
  readonly centres: readonly Vec2[]
  readonly front: number
  readonly side: 1 | -1
  readonly lean: number
  readonly summit: { readonly shape: SummitShape; readonly craterRadius?: number }
  readonly buildField: (raises: readonly (readonly RaiseWindow[])[]) => LevelField
}

export interface LegShares {
  readonly lawn: number
  readonly ramps: number
  readonly summit: number
}

export interface PlannedTrail {
  readonly field: LevelField
  readonly trail: IslandTrail
  readonly shares: LegShares
}

interface RampPlan {
  readonly upper: number
  readonly centre: Vec2
  readonly start: number
  readonly dir: 1 | -1
  readonly span: number
}

type Tag =
  | { kind: 'approach' | 'walk' | 'summit' }
  | { kind: 'landing' | 'hairpin'; index: number }
  | { kind: 'ramp'; index: number; u: number }
interface TaggedPoint {
  x: number
  z: number
  tag: Tag
}

const polar = (c: Vec2, a: number, r: number): Vec2 => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]
const angleFrom = (c: Vec2, p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0])

/** Rim radius of a level about a centre, tabulated at `n` angles with warm-started bisection. */
class RimTable {
  private readonly radii: Float64Array

  constructor(inside: (x: number, z: number) => boolean, readonly centre: Vec2, private readonly n = 160) {
    this.radii = new Float64Array(n)
    let r = rayExit(inside, centre[0], centre[1], 0)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const dx = Math.cos(a)
      const dz = Math.sin(a)
      const at = (d: number) => inside(centre[0] + dx * d, centre[1] + dz * d)
      let lo: number
      let hi: number
      if (at(r)) {
        hi = r + 0.04
        while (hi < 4.5 && at(hi)) hi += 0.04
        lo = hi - 0.04
      } else {
        lo = Math.max(0, r - 0.04)
        while (lo > 0 && !at(lo)) lo = Math.max(0, lo - 0.04)
        hi = lo + 0.04
      }
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2
        if (at(mid)) lo = mid
        else hi = mid
      }
      r = lo
      this.radii[i] = r
    }
  }

  at(a: number): number {
    const f = ((((a / TAU) % 1) + 1) % 1) * this.n
    const i = Math.floor(f) % this.n
    const k = f - Math.floor(f)
    return this.radii[i] * (1 - k) + this.radii[(i + 1) % this.n] * k
  }

  point(a: number, offset: number): Vec2 {
    return polar(this.centre, a, this.at(a) + offset)
  }

  /** Circular moving average over ±`half` samples: lanes follow this so a sharp bay in the outline can't kink a ramp. */
  smoothed(half: number): RimTable {
    const out = Object.create(RimTable.prototype) as RimTable
    const radii = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      let sum = 0
      for (let k = -half; k <= half; k++) sum += this.radii[(i + k + this.n) % this.n]
      radii[i] = sum / (2 * half + 1)
    }
    Object.assign(out, { radii, centre: this.centre, n: this.n })
    return out
  }
}

class Geometry {
  private readonly cache = new Map<string, RimTable>()
  constructor(readonly field: LevelField) {}

  /** Rim of `level` along rays from `centre`, smoothed over ±18° so walking lanes stay gently curved. */
  rim(level: number, centre: Vec2): RimTable {
    const key = `${level}:${centre[0]}:${centre[1]}`
    let t = this.cache.get(key)
    if (!t) {
      t = new RimTable((x, z) => this.field.sdAt(x, z)[level] > 0, centre).smoothed(8)
      this.cache.set(key, t)
    }
    return t
  }
}

/** Deepest point of a level near its blob centre; switchback margins can shift a tier well off its blob. */
export function levelCore(field: Pick<LevelField, 'sdAt'>, level: number, near: Vec2): Vec2 {
  let best: Vec2 = near
  let bestSd = -Infinity
  for (let j = -15; j <= 15; j++) {
    for (let i = -15; i <= 15; i++) {
      const x = near[0] + i * 0.08
      const z = near[1] + j * 0.08
      const sd = field.sdAt(x, z)[level]
      if (sd > bestSd) {
        bestSd = sd
        best = [x, z]
      }
    }
  }
  return best
}

function arcCentre(input: PlannerInput, field: LevelField, level: number): Vec2 {
  const isCrater = level === input.levels.length - 1 && input.summit.shape === 'crater'
  return isCrater ? input.centres[level] : levelCore(field, level, input.centres[level])
}

function wallHeight(input: PlannerInput, level: number): number {
  return input.levels[level].y - input.levels[level - 1].y
}

function rampLength(input: PlannerInput, upper: number): number {
  return wallHeight(input, upper) / TAN_RAMP + 2 * RAMP_FLAT
}

/** Angle swept (in `dir`) along a rim from `start` until `length` of arc is covered. */
function sweep(rim: RimTable, start: number, dir: 1 | -1, length: number): number {
  let a = start
  let [px, pz] = rim.point(a, 0)
  let acc = 0
  for (let i = 0; i < 3000 && acc < length; i++) {
    a += 0.004 * dir
    const [qx, qz] = rim.point(a, 0)
    acc += Math.hypot(qx - px, qz - pz)
    px = qx
    pz = qz
  }
  return Math.abs(a - start)
}

/** Spec §3.5 step 3: mid-ledge walking line in front of `upper`'s cliff, measured from its (leaning) foot. */
function ledgeLine(input: PlannerInput, g: Geometry, upper: number, centre: Vec2, a: number): number {
  const foot = g.rim(upper, centre).at(a) + input.lean * wallHeight(input, upper)
  const outer = g.rim(upper - 1, centre).at(a)
  return foot + Math.min(LEDGE_LINE_MAX, Math.max(0, outer - foot) / 2)
}

function trailhead(input: PlannerInput, field: LevelField): Vec2 {
  const th = input.front - input.side * 0.3
  const beachR = rayExit((x, z) => field.sdAt(x, z)[BEACH] > 0, 0, 0, th)
  const lawnR = rayExit((x, z) => field.sdAt(x, z)[LAWN] > 0, 0, 0, th)
  return polar([0, 0], th, lawnR + (beachR - lawnR) * 0.55)
}

function facingAt(input: PlannerInput, p: Vec2): number {
  return 0.5 + 0.5 * Math.cos(Math.atan2(p[1], p[0]) - input.front)
}

/** Spec §3.5 step 2 for the first ramp (visibility, ledge room, jitter). Later ramps start at the switchback above it. */
function scoreFirstRampSite(input: PlannerInput, stream: Stream): number {
  const field = input.buildField(input.levels.map(() => []))
  const g = new Geometry(field)
  const upper = LAWN + 1
  const centre = arcCentre(input, field, upper)
  const dir = input.side
  const approach = angleFrom(centre, trailhead(input, field))
  const rim = g.rim(upper, centre)
  const outer = g.rim(upper - 1, centre)
  const length = rampLength(input, upper)
  let best = approach + dir * 0.4
  let bestScore = -Infinity
  for (let i = 0; i < 48; i++) {
    const a = approach + dir * (0.2 + (i / 47) * 1.4)
    const span = sweep(rim, a, dir, length)
    const mid = rim.point(a + (dir * span) / 2, 0)
    let ledge = Infinity
    for (let k = 0; k <= 3; k++) {
      const b = a + (dir * span * k) / 6
      ledge = Math.min(ledge, outer.at(b) - rim.at(b))
    }
    const score = 2 * facingAt(input, mid) + Math.min(1, ledge / RAMP_LEDGE) + 0.1 * stream.next()
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  return best
}

function windowFor(centre: Vec2, a0: number, a1: number, value: number): RaiseWindow {
  return { cx: centre[0], cz: centre[1], from: Math.min(a0, a1), to: Math.max(a0, a1), feather: 0.35, value }
}

function landingEnd(plan: RampPlan, rim: RimTable): number {
  const end = plan.start + plan.dir * plan.span
  return end + (plan.dir * LANDING) / Math.max(0.5, rim.at(end))
}

/**
 * Ramp k climbs onto level LAWN+1+k along its rim. Before each ramp is fixed, the ledge below it is widened to
 * RAMP_LEDGE and the ledge above its top to HAIRPIN_LEDGE, so "every ramp has room" holds by construction.
 */
function planRamps(input: PlannerInput, firstStart: number) {
  const top = input.levels.length - 1
  const raises: RaiseWindow[][] = input.levels.map(() => [])
  let field = input.buildField(raises)
  const plans: RampPlan[] = []
  for (let upper = LAWN + 1; upper <= top; upper++) {
    const k = upper - LAWN - 1
    const dir = (k % 2 === 0 ? input.side : -input.side) as 1 | -1
    const g = new Geometry(field)
    const centre = arcCentre(input, field, upper)
    let start = firstStart
    if (k > 0) {
      const prev = plans[k - 1]
      const prevRim = g.rim(prev.upper, prev.centre)
      start = angleFrom(centre, prevRim.point(landingEnd(prev, prevRim), -RAMP_OFFSET))
    }
    const rim = g.rim(upper, centre)
    const span = sweep(rim, start, dir, rampLength(input, upper))
    raises[upper].push(windowFor(centre, start, start + (dir * span) / 2, RAMP_LEDGE + input.lean * wallHeight(input, upper)))
    if (upper < top) {
      const end = start + dir * span
      const r = Math.max(0.5, rim.at(end))
      raises[upper + 1].push(windowFor(centre, end - (dir * 0.6) / r, end + (dir * (LANDING + 0.35)) / r, HAIRPIN_LEDGE + input.lean * wallHeight(input, upper + 1)))
    }
    field = input.buildField(raises)
    plans.push({ upper, centre, start, dir, span })
  }
  return { field, plans }
}

function pushLine(points: TaggedPoint[], a: Vec2, b: Vec2, tag: Tag) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SPACING))
  for (let i = points.length ? 1 : 0; i <= n; i++) points.push({ x: a[0] + ((b[0] - a[0]) * i) / n, z: a[1] + ((b[1] - a[1]) * i) / n, tag })
}

function pushArc(points: TaggedPoint[], centre: Vec2, a0: number, a1: number, radius: (a: number, u: number) => number, tag: Tag | ((u: number) => Tag)) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * radius(a0, 0)) / SPACING))
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const a = a0 + (a1 - a0) * u
    points.push({ ...pt(polar(centre, a, radius(a, u))), tag: typeof tag === 'function' ? tag(u) : tag })
  }
}

const pt = (p: Vec2) => ({ x: p[0], z: p[1] })

/** Semicircular switchback from `pa` to `pb`, bulging forward along `forward`. */
function pushHairpin(points: TaggedPoint[], pa: Vec2, pb: Vec2, forward: Vec2, index: number) {
  const mx = (pa[0] + pb[0]) / 2
  const mz = (pa[1] + pb[1]) / 2
  const rho = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / 2 || 1e-6
  const e1: Vec2 = [(pa[0] - mx) / rho, (pa[1] - mz) / rho]
  const dot = forward[0] * e1[0] + forward[1] * e1[1]
  const raw: Vec2 = [forward[0] - dot * e1[0], forward[1] - dot * e1[1]]
  const len = Math.hypot(raw[0], raw[1]) || 1
  const e2: Vec2 = [raw[0] / len, raw[1] / len]
  const n = Math.max(6, Math.ceil((Math.PI * rho) / SPACING))
  for (let i = 1; i <= n; i++) {
    const phi = (i / n) * Math.PI
    points.push({ x: mx + rho * (Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0]), z: mz + rho * (Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1]), tag: { kind: 'hairpin', index } })
  }
}

/**
 * Spec §3.5 step 5, adapted: the summit is small next to its ramp, so the end point is searched rather than fixed.
 * The summit point (and straight walk to it) with the most clearance from the trail already laid, favouring the
 * camera side and a walk of about `walkLength`; a dome prefers its peak, a crater its rim ring.
 */
function summitTarget(input: PlannerInput, field: LevelField, core: Vec2, from: Vec2, laid: readonly TaggedPoint[], walkLength: number): Vec2 {
  const top = input.levels.length - 1
  const craterR = input.summit.shape === 'crater' ? (input.summit.craterRadius ?? 0.38) : 0
  const clearance = (p: Vec2) => {
    let d = Infinity
    for (const q of laid) d = Math.min(d, Math.hypot(q.x - p[0], q.z - p[1]))
    return d
  }
  let best = core
  let bestScore = -Infinity
  for (let j = -14; j <= 14; j++) {
    for (let i = -14; i <= 14; i++) {
      const p: Vec2 = [core[0] + i * 0.08, core[1] + j * 0.08]
      if (field.sdAt(p[0], p[1])[top] < 0.28) continue
      const fromCore = Math.hypot(p[0] - core[0], p[1] - core[1])
      if (craterR > 0 && Math.abs(fromCore - (craterR + 0.3)) > 0.08) continue
      let clear = clearance(p)
      const len = Math.hypot(p[0] - from[0], p[1] - from[1])
      const steps = Math.ceil(len / 0.08)
      for (let k = 1; k < steps; k++) clear = Math.min(clear, clearance([from[0] + ((p[0] - from[0]) * k) / steps, from[1] + ((p[1] - from[1]) * k) / steps]))
      if (clear < 2 * PATH_HALF_WIDTH + 0.08) continue
      const peak = input.summit.shape === 'dome' ? -fromCore : 0
      const score = Math.min(clear, 0.8) + 0.6 * facingAt(input, p) - 0.9 * Math.abs(len - walkLength) + peak
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
  }
  return best
}

function trace(input: PlannerInput, g: Geometry, plans: readonly RampPlan[], walkLength: number): TaggedPoint[] {
  const points: TaggedPoint[] = []
  const first = plans[0]
  const start = trailhead(input, g.field)
  const approach = angleFrom(first.centre, start)
  pushLine(points, start, polar(first.centre, approach, ledgeLine(input, g, first.upper, first.centre, approach)), { kind: 'approach' })
  const firstRim = g.rim(first.upper, first.centre)
  pushArc(
    points,
    first.centre,
    approach,
    first.start,
    (a, u) => {
      const ledge = ledgeLine(input, g, first.upper, first.centre, a)
      return ledge + (firstRim.at(a) + RAMP_OFFSET - ledge) * smoothstep(0.35, 1, u)
    },
    { kind: 'walk' },
  )

  plans.forEach((plan, k) => {
    const rim = g.rim(plan.upper, plan.centre)
    const end = plan.start + plan.dir * plan.span
    pushArc(points, plan.centre, plan.start, end, (a, u) => rim.at(a) + RAMP_OFFSET * (1 - 2 * u), (u) => ({ kind: 'ramp', index: k, u }))
    const land = landingEnd(plan, rim)
    pushArc(points, plan.centre, end, land, (a) => rim.at(a) - RAMP_OFFSET, { kind: 'landing', index: k })
    const next = plans[k + 1]
    if (next) {
      const forward: Vec2 = [-Math.sin(land) * plan.dir, Math.cos(land) * plan.dir]
      pushHairpin(points, rim.point(land, -RAMP_OFFSET), g.rim(next.upper, next.centre).point(next.start, RAMP_OFFSET), forward, k)
    }
  })

  const last = plans[plans.length - 1]
  const from = points[points.length - 1]
  const laid = points.slice(0, Math.max(0, points.length - Math.ceil(0.6 / SPACING)))
  const target = summitTarget(input, g.field, last.centre, [from.x, from.z], laid, walkLength)
  pushLine(points, [from.x, from.z], target, { kind: 'summit' })
  return points
}

function densify(points: readonly TaggedPoint[]): TaggedPoint[] {
  const out: TaggedPoint[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SPACING))
    for (let k = 1; k <= n; k++) {
      const tag = k === n ? b.tag : a.tag.kind === 'ramp' && b.tag.kind === 'ramp' ? { ...a.tag, u: a.tag.u + ((b.tag.u - a.tag.u) * k) / n } : a.tag
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, tag })
    }
  }
  return out
}

/** Spec §3.5 step 6. Switchback points are pinned: smoothing would otherwise pull the two legs of the U together. */
function smoothXZ(points: TaggedPoint[]) {
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const px = points.map((p) => p.x)
    const pz = points.map((p) => p.z)
    for (let i = 1; i < points.length - 1; i++) {
      if (points[i].tag.kind === 'hairpin') continue
      points[i].x = 0.25 * px[i - 1] + 0.5 * px[i] + 0.25 * px[i + 1]
      points[i].z = 0.25 * pz[i - 1] + 0.5 * pz[i] + 0.25 * pz[i + 1]
    }
  }
}

/** Spec §3.5 step 7: monotone raw heights, forward/backward slope limiters averaged, then 3 smoothing passes. */
export function limitHeights(raw: readonly number[], s: readonly number[]): number[] {
  const mono = raw.slice()
  for (let i = 1; i < mono.length; i++) mono[i] = Math.max(mono[i], mono[i - 1])
  const g = 2 * TAN_RAMP
  const yf = mono.slice()
  for (let i = 1; i < yf.length; i++) yf[i] = Math.min(mono[i], yf[i - 1] + g * (s[i] - s[i - 1]))
  const yb = mono.slice()
  for (let i = yb.length - 2; i >= 0; i--) yb[i] = Math.max(mono[i], yb[i + 1] - g * (s[i + 1] - s[i]))
  let ys = yf.map((v, i) => (v + yb[i]) / 2)
  for (let pass = 0; pass < 3; pass++) {
    ys = ys.map((v, i) => (i === 0 || i === ys.length - 1 ? v : 0.25 * ys[i - 1] + 0.5 * v + 0.25 * ys[i + 1]))
  }
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1])
  return ys
}

function finish(input: PlannerInput, field: LevelField, plans: readonly RampPlan[], tagged: TaggedPoint[]): { trail: IslandTrail; shares: LegShares } {
  const points = densify(tagged)
  smoothXZ(points)
  const s: number[] = [0]
  for (let i = 1; i < points.length; i++) s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  // Ramps, landings and switchbacks take their height from the plan, not the ground under them: a lane grazing a
  // bulge of the next tier must not trigger the climb early. The carve then cuts or fills the terrain to match.
  const beachY = input.levels[BEACH].y
  const planned = (p: TaggedPoint) => {
    const terrain = Math.max(beachY, field.terraceY(p.x, p.z))
    if (p.tag.kind === 'ramp') return input.levels[p.tag.u < 0.5 ? plans[p.tag.index].upper - 1 : plans[p.tag.index].upper].y
    if (p.tag.kind === 'landing' || p.tag.kind === 'hairpin') return input.levels[plans[p.tag.index].upper].y
    if (p.tag.kind === 'summit') return Math.max(input.levels[input.levels.length - 1].y, terrain)
    return terrain
  }
  const ys = limitHeights(points.map(planned), s)

  const ramps: RampSpan[] = plans.map((plan, k) => {
    let i0 = -1
    let i1 = -1
    points.forEach((p, i) => {
      if (p.tag.kind === 'ramp' && p.tag.index === k) {
        if (i0 < 0) i0 = i
        i1 = i
      }
    })
    return { fromLevel: plan.upper - 1, toLevel: plan.upper, s0: s[i0], s1: s[i1], theta: plan.start, dir: plan.dir }
  })

  const samples: TrailSample[] = points.map((p, i) => {
    const ramp = ramps.findIndex((r) => s[i] >= r.s0 && s[i] <= r.s1)
    return { x: p.x, y: ys[i], z: p.z, s: s[i], level: ramp >= 0 ? ramps[ramp].fromLevel : field.levelAt(p.x, p.z), ramp }
  })
  const length = s[s.length - 1]
  const shares = {
    lawn: ramps[0].s0 / length,
    ramps: ramps.reduce((acc, r) => acc + (r.s1 - r.s0), 0) / length,
    summit: (length - ramps[ramps.length - 1].s1) / length,
  }
  const waypoints: Vec3[] = samples.map((q) => [q.x, q.y, q.z])
  return { trail: { samples, waypoints, ramps, halfWidth: PATH_HALF_WIDTH, length }, shares }
}

function shareViolation(shares: LegShares): number {
  const out = (v: number, [lo, hi]: readonly [number, number]) => Math.max(0, lo - v, v - hi)
  return out(shares.lawn, SHARE_WINDOWS.lawn) + out(shares.ramps, SHARE_WINDOWS.ramps) + out(shares.summit, SHARE_WINDOWS.summit)
}

/** Spec §3.5 steps 1-8: score the first ramp, zigzag the rest, trace, smooth, limit heights, rebalance legs up to 3 times. */
export function planTrail(input: PlannerInput, stream: Stream): PlannedTrail {
  let rampStart = scoreFirstRampSite(input, stream)
  let walkLength = 1.0
  let best: PlannedTrail | null = null
  let bestViolation = Infinity
  for (let iteration = 0; iteration <= 5; iteration++) {
    const { field, plans } = planRamps(input, rampStart)
    const { trail, shares } = finish(input, field, plans, trace(input, new Geometry(field), plans, walkLength))
    const violation = shareViolation(shares)
    if (violation < bestViolation) {
      bestViolation = violation
      best = { field, trail, shares }
    }
    if (violation === 0) break
    if (shares.lawn < SHARE_WINDOWS.lawn[0]) rampStart += input.side * 0.15
    else if (shares.lawn > SHARE_WINDOWS.lawn[1]) rampStart -= input.side * 0.15
    if (shares.summit < SHARE_WINDOWS.summit[0]) walkLength += 0.3
    else if (shares.summit > SHARE_WINDOWS.summit[1]) walkLength = Math.max(0.3, walkLength - 0.3)
  }
  return best!
}
