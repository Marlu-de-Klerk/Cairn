// Spike A: one seeded island plan that drives terrain, props AND the trail.
// Pure maths only (no React/three) so the trail and the terrain can never drift apart.

export type V3 = [number, number, number]

const TAU = Math.PI * 2
const DEG = Math.PI / 180

export const WATER_Y = -0.05
export const BEVEL = 0.06
export const TRAIL_CLEARANCE = 0.05
export const TRAIL_OFFSET = 0.26
export const RAMP_INNER = -0.1
export const RAMP_OUTER = TRAIL_OFFSET + 0.22
export const RAMP_SLOPE = Math.tan(31 * DEG)
export const T1_LIP = 0.12
export const WALL_LEAN = 0.07
export const WALL_BOTTOM = -0.3

export interface PolarTier {
  cx: number
  cz: number
  r: number[]
  top: number
}

export interface Ramp {
  tier: PolarTier
  a0: number
  a1: number
  dir: 1 | -1
  landSpan: number
  hLow: number
  hHigh: number
}

export type PropKind =
  | 'palmTall'
  | 'palmBend'
  | 'palmDetailed'
  | 'darkTree'
  | 'roundTree'
  | 'bush'
  | 'bushBig'
  | 'fern'
  | 'fernTall'
  | 'stump'
  | 'heroRock'
  | 'flower'
  | 'mushroom'
  | 'grassTuft'
  | 'lily'
  | 'log'

export interface Prop {
  kind: PropKind
  x: number
  y: number
  z: number
  rot: number
  scale: number
  tiltX?: number
  tiltZ?: number
  scaleY?: number
}

export interface Pillar {
  x: number
  z: number
  base: number
  height: number
  radius: number
  sides: number
  rot: number
  grassCap: boolean
  boulder?: boolean
}

export interface Vine {
  tier: number
  angle: number
  length: number
}

export interface Cave {
  tier: number
  angle: number
  width: number
  height: number
}

export interface WaterRock {
  x: number
  z: number
  radius: number
  height: number
  rot: number
}

export interface Waterfall {
  tier: PolarTier
  angle: number
  width: number
  top: number
  bottom: number
}

export interface IslandLayout {
  seed: number
  beach: PolarTier
  tiers: PolarTier[]
  ramps: Ramp[]
  trail2D: [number, number][]
  trail: V3[]
  props: Prop[]
  pillars: Pillar[]
  waterRocks: WaterRock[]
  waterfall: Waterfall | null
  shelf: PolarTier | null
  camp: { x: number; y: number; z: number; rot: number } | null
  vines: Vine[]
  caves: Cave[]
  groundHeightAt: (x: number, z: number) => number
  footprintRadius: number
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function wrapPi(a: number) {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}

export function radiusAt(t: PolarTier, a: number) {
  const n = t.r.length
  let f = (a / TAU) % 1
  if (f < 0) f += 1
  f *= n
  const i = Math.floor(f) % n
  const k = f - Math.floor(f)
  return t.r[i] * (1 - k) + t.r[(i + 1) % n] * k
}

export function angleOf(t: PolarTier, x: number, z: number) {
  return Math.atan2(z - t.cz, x - t.cx)
}

export function signedDist(t: PolarTier, x: number, z: number) {
  return Math.hypot(x - t.cx, z - t.cz) - radiusAt(t, angleOf(t, x, z))
}

export function pointAt(t: PolarTier, a: number, offset: number): [number, number] {
  const r = radiusAt(t, a) + offset
  return [t.cx + Math.cos(a) * r, t.cz + Math.sin(a) * r]
}

function exitDistance(t: PolarTier, ox: number, oz: number, dx: number, dz: number, maxLen = 8) {
  let lo = 0
  let hi = 0
  const step = 0.04
  while (hi < maxLen && signedDist(t, ox + dx * hi, oz + dz * hi) < 0) hi += step
  lo = Math.max(0, hi - step)
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (signedDist(t, ox + dx * mid, oz + dz * mid) < 0) lo = mid
    else hi = mid
  }
  return lo
}

/** Distance from `upper`'s rim outward (along upper's own ray) to where `lower` ends. */
export function ledgeWidth(upper: PolarTier, lower: PolarTier, a: number) {
  const [px, pz] = pointAt(upper, a, 0)
  return exitDistance(lower, px, pz, Math.cos(a), Math.sin(a))
}

function harmonicOutline(rand: () => number, n: number, base: number, amps: [number, number][], extra?: (a: number) => number) {
  const phases = amps.map(() => rand() * TAU)
  const r: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    let f = 1
    amps.forEach(([k, amp], j) => {
      f += amp * Math.cos(k * a + phases[j])
    })
    r.push(base * f + (extra ? extra(a) : 0))
  }
  return r
}

function angularWindow(a: number, from: number, to: number, feather: number) {
  const span = wrapPositive(to - from)
  const d = wrapPositive(a - from)
  if (d <= span) return 1
  const before = TAU - d
  const after = d - span
  const gap = Math.min(before, after)
  if (gap >= feather) return 0
  return 0.5 + 0.5 * Math.cos((gap / feather) * Math.PI)
}

function wrapPositive(a: number) {
  let x = a % TAU
  if (x < 0) x += TAU
  return x
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function clampInside(upper: PolarTier, lower: PolarTier, margin: (a: number) => number) {
  const n = upper.r.length
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const m = margin(a)
    let guard = 0
    while (guard++ < 200) {
      const r = upper.r[i] + m
      const x = upper.cx + Math.cos(a) * r
      const z = upper.cz + Math.sin(a) * r
      if (signedDist(lower, x, z) < 0) break
      upper.r[i] *= 0.985
    }
  }
  const smoothed = upper.r.map((_, i) => {
    let s = 0
    for (let k = -2; k <= 2; k++) s += upper.r[(i + k + n) % n]
    return s / 5
  })
  upper.r = upper.r.map((r, i) => Math.min(r, smoothed[i]))
}

function marchAngle(t: PolarTier, a0: number, dir: 1 | -1, offset: number, length: number) {
  let a = a0
  let [px, pz] = pointAt(t, a, offset)
  let acc = 0
  const da = 0.2 * DEG * dir
  for (let i = 0; i < 4000 && acc < length; i++) {
    a += da
    const [qx, qz] = pointAt(t, a, offset)
    acc += Math.hypot(qx - px, qz - pz)
    px = qx
    pz = qz
  }
  return a
}

export function rampParam(ramp: Ramp, a: number) {
  const span = Math.abs(ramp.a1 - ramp.a0)
  return (wrapPi(a - ramp.a0) * ramp.dir) / span
}

export function rampHeight(ramp: Ramp, s: number) {
  if (s <= 1) return ramp.hLow + Math.max(0, s) * (ramp.hHigh - ramp.hLow)
  return ramp.hHigh - 0.004
}

export function rampSurfaceAt(ramp: Ramp, x: number, z: number): number | null {
  const off = signedDist(ramp.tier, x, z)
  if (off < RAMP_INNER || off > RAMP_OUTER) return null
  const s = rampParam(ramp, angleOf(ramp.tier, x, z))
  const span = Math.abs(ramp.a1 - ramp.a0)
  if (s < 0 || s > 1 + ramp.landSpan / span) return null
  return rampHeight(ramp, s)
}

export function buildIslandLayout(seed: number): IslandLayout {
  const rand = mulberry32(seed * 7919 + 104729)
  const j = (amp: number) => (rand() - 0.5) * 2 * amp

  const spitAngle = Math.PI * 1.02 + j(0.25)
  const spitAmp = 0.4 + rand() * 0.2
  const spit = (a: number) => spitAmp * Math.exp(-((wrapPi(a - spitAngle) / 0.13) ** 2))
  const lobePhase = Math.PI / 2 + 0.35 + j(0.25)
  const frontLobe = (a: number) => 0.38 * Math.max(0, Math.cos(a - lobePhase)) ** 3
  const beachR = harmonicOutline(rand, 160, 3.0, [[2, 0.08], [3, 0.065], [4, 0.035], [5, 0.02]], (a) => frontLobe(a) + spit(a)).map((r) =>
    Math.min(r, 3.65),
  )
  const beach: PolarTier = { cx: 0, cz: 0, r: beachR, top: -0.03 }

  const sandPhase = rand() * TAU
  const h1 = 0.16
  const t1R = beachR.map((r, i) => {
    const a = (i / beachR.length) * TAU
    const sand = 0.24 + 0.3 * Math.max(0, Math.sin(a)) ** 2 + 0.05 * Math.cos(3 * a + sandPhase) + spit(a) * 1.05
    return r - sand
  })
  const t1: PolarTier = { cx: 0, cz: 0, r: t1R, top: h1 }

  const h2 = 1.0 + rand() * 0.12
  const h3 = h2 + 0.98 + rand() * 0.12

  const c2x = -0.32 + j(0.18)
  const c2z = -1.02 + j(0.12)
  const t2: PolarTier = {
    cx: c2x,
    cz: c2z,
    r: harmonicOutline(rand, 64, 2.05, [[2, 0.1], [3, 0.08], [4, 0.045], [5, 0.025]]),
    top: h2,
  }

  const rampStart1 = (32 + j(10)) * DEG
  const approachStart = (112 + j(8)) * DEG
  clampInside(t2, t1, (a) => 0.06 + 0.86 * angularWindow(a, rampStart1 - 75 * DEG, approachStart + 8 * DEG, 20 * DEG))

  const rampLen1 = (h2 - h1) / RAMP_SLOPE
  const rampEnd1 = marchAngle(t2, rampStart1, -1, TRAIL_OFFSET, rampLen1)
  const land1 = marchAngle(t2, rampEnd1, -1, TRAIL_OFFSET, 0.5) - rampEnd1
  const ramp1: Ramp = { tier: t2, a0: rampStart1, a1: rampEnd1, dir: -1, landSpan: Math.abs(land1), hLow: h1, hHigh: h2 }

  const c3x = c2x - 0.3 + j(0.16)
  const c3z = c2z - 0.62 + j(0.1)
  const t3: PolarTier = {
    cx: c3x,
    cz: c3z,
    r: harmonicOutline(rand, 48, 1.3, [[2, 0.12], [3, 0.08], [4, 0.04]]),
    top: h3,
  }

  const trail2D: [number, number][] = []
  const push = (p: [number, number]) => trail2D.push(p)

  // A: beach -> T1 lawn -> foot of ramp 1 (angles in T2's frame)
  const t1LedgeAtStart = ledgeWidth(t2, t1, approachStart)
  const [sx, sz] = pointAt(t2, approachStart, t1LedgeAtStart)
  const sandAlong = exitDistance(beach, sx, sz, Math.cos(approachStart), Math.sin(approachStart))
  const offStart = t1LedgeAtStart + sandAlong * 0.55
  const stepsA = 60
  for (let i = 0; i <= stepsA; i++) {
    const u = i / stepsA
    const a = approachStart + (rampStart1 - approachStart) * u
    const target = TRAIL_OFFSET
    let off = offStart + (target - offStart) * smoothstep(0, 0.82, u)
    const maxOff = u < 0.2 ? offStart : ledgeWidth(t2, t1, a) - 0.3
    off = Math.max(TRAIL_OFFSET, Math.min(off, maxOff))
    push(pointAt(t2, a, off))
  }
  // B: ramp 1 + landing, then step inward onto T2
  const stepsB = 36
  for (let i = 1; i <= stepsB; i++) push(pointAt(t2, rampStart1 + (rampEnd1 - rampStart1) * (i / stepsB), TRAIL_OFFSET))
  push(pointAt(t2, rampEnd1 + land1 * 0.45, TRAIL_OFFSET))
  push(pointAt(t2, rampEnd1 + land1 * 0.72, TRAIL_OFFSET * 0.35))
  push(pointAt(t2, rampEnd1 + land1 * 0.85, -0.2))
  push(pointAt(t2, rampEnd1 + land1 * 0.95, -0.45))

  // T3 must be clamped using the real T2-walk window, which starts where ramp 1 lands.
  const [p0x, p0z] = trail2D[trail2D.length - 1]
  const psi0 = angleOf(t3, p0x, p0z)
  const rampStart2 = psi0 + (78 + j(14)) * DEG
  clampInside(t3, t2, (a) => 0.05 + 0.87 * angularWindow(a, psi0 - 12 * DEG, rampStart2 + 115 * DEG, 18 * DEG))

  // C: walk across T2 to the foot of ramp 2 (angles in T3's frame)
  const o0 = signedDist(t3, p0x, p0z)
  const stepsC = 50
  for (let i = 1; i <= stepsC; i++) {
    const u = i / stepsC
    const a = psi0 + (rampStart2 - psi0) * u
    let off = o0 + (TRAIL_OFFSET - o0) * smoothstep(0.1, 0.85, u)
    off = Math.max(TRAIL_OFFSET, Math.min(off, ledgeWidth(t3, t2, a) - 0.3))
    push(pointAt(t3, a, off))
  }
  const rampLen2 = (h3 - h2) / RAMP_SLOPE
  const rampEnd2 = marchAngle(t3, rampStart2, 1, TRAIL_OFFSET, rampLen2)
  const land2 = marchAngle(t3, rampEnd2, 1, TRAIL_OFFSET, 0.5) - rampEnd2
  const ramp2: Ramp = { tier: t3, a0: rampStart2, a1: rampEnd2, dir: 1, landSpan: Math.abs(land2), hLow: h2, hHigh: h3 }
  const stepsD = 40
  for (let i = 1; i <= stepsD; i++) push(pointAt(t3, rampStart2 + (rampEnd2 - rampStart2) * (i / stepsD), TRAIL_OFFSET))
  push(pointAt(t3, rampEnd2 + land2 * 0.45, TRAIL_OFFSET))
  push(pointAt(t3, rampEnd2 + land2 * 0.72, TRAIL_OFFSET * 0.35))
  push(pointAt(t3, rampEnd2 + land2 * 0.85, -0.2))
  push(pointAt(t3, rampEnd2 + land2 * 0.95, -0.45))

  // E: across the summit plateau to the flag
  const [lx, lz] = trail2D[trail2D.length - 1]
  const summitAngle = rampEnd2 + Math.PI * 0.85
  // Interpolate in T3's own polar frame (angle + fraction of rim radius) so the walk can
  // never leave the plateau, even across a concave bay in its outline.
  const aL = angleOf(t3, lx, lz)
  const fL = Math.hypot(lx - t3.cx, lz - t3.cz) / radiusAt(t3, aL)
  const dA = wrapPi(summitAngle - aL)
  const fS = 0.28
  for (let i = 1; i <= 24; i++) {
    const u = i / 24
    const a = aL + dA * u
    const f = fS + (fL - fS) * (1 - u) ** 1.6
    const r = radiusAt(t3, a) * f
    push([t3.cx + Math.cos(a) * r, t3.cz + Math.sin(a) * r])
  }

  // Side shelf straddling T2's rim (the reference's waterfall ledge), kept clear of the trail.
  let shelf: PolarTier | null = null
  const shelfJ = rand() * 8
  for (let i = 0; i < 30 && !shelf; i++) {
    const a = (128 + shelfJ + i * 4) * DEG
    const [sx2, sz2] = pointAt(t2, a, 0.05)
    const sr = 0.5 + rand() * 0.12
    let clear = Infinity
    for (const [tx, tz] of trail2D) clear = Math.min(clear, Math.hypot(tx - sx2, tz - sz2))
    if (clear < sr + 0.55) continue
    const cand: PolarTier = { cx: sx2, cz: sz2, r: harmonicOutline(rand, 28, sr, [[2, 0.12], [3, 0.08]]), top: h2 + 0.42 + rand() * 0.1 }
    clampInside(cand, t1, () => 0.12)
    if (Math.min(...cand.r) > 0.25) shelf = cand
  }
  const tiers = [t1, t2, t3]
  const surfaces = shelf ? [...tiers, shelf] : tiers
  const ramps = [ramp1, ramp2]

  const groundHeightAt = (x: number, z: number) => {
    let y = WATER_Y - 0.2
    const d = Math.hypot(x, z)
    const a = Math.atan2(z, x)
    const rb = radiusAt(beach, a)
    const r1 = radiusAt(t1, a) + WALL_LEAN * 0.5
    if (d <= rb + 0.2) {
      if (d <= rb) {
        const f = Math.min(1, Math.max(0, (d - r1) / Math.max(0.05, rb - r1)))
        y = h1 - T1_LIP + (beach.top - (h1 - T1_LIP)) * (f * f * (3 - 2 * f) * 0.6 + f * 0.4)
      } else {
        y = beach.top - ((d - rb) / 0.2) * 0.15
      }
    }
    for (const t of surfaces) {
      const sd = signedDist(t, x, z)
      if (sd <= 0) y = Math.max(y, sd < -BEVEL ? t.top : t.top - (sd + BEVEL))
    }
    for (const r of ramps) {
      const h = rampSurfaceAt(r, x, z)
      if (h !== null) y = Math.max(y, h)
    }
    return y
  }

  const dense: [number, number][] = [trail2D[0]]
  for (let i = 1; i < trail2D.length; i++) {
    const [ax, az] = trail2D[i - 1]
    const [bx, bz] = trail2D[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.04))
    for (let k = 1; k <= n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  trail2D.length = 0
  trail2D.push(...dense)
  const ground = trail2D.map(([x, z]) => groundHeightAt(x, z))
  // Pre-lift ahead of any step steeper than the ramps so the spline never undercuts a lip.
  const trail: V3[] = trail2D.map(([x, z], i) => {
    let y = ground[i]
    let d = 0
    for (let k = i + 1; k < Math.min(trail2D.length, i + 8); k++) {
      d += Math.hypot(trail2D[k][0] - trail2D[k - 1][0], trail2D[k][1] - trail2D[k - 1][1])
      y = Math.max(y, ground[k] - RAMP_SLOPE * d)
    }
    return [x, y + TRAIL_CLEARANCE, z]
  })

  const trailDist = (x: number, z: number) => {
    let best = Infinity
    for (const [tx, tz] of trail2D) best = Math.min(best, (tx - x) ** 2 + (tz - z) ** 2)
    return Math.sqrt(best)
  }
  const onRamp = (x: number, z: number, pad = 0.12) =>
    ramps.some((r) => {
      const off = signedDist(r.tier, x, z)
      if (off < RAMP_INNER - pad || off > RAMP_OUTER + pad) return false
      const s = rampParam(r, angleOf(r.tier, x, z))
      return s > -0.08 && s < 1 + r.landSpan / Math.abs(r.a1 - r.a0) + 0.08
    })

  const topTierIndex = (x: number, z: number, inset: number) => {
    for (let k = tiers.length - 1; k >= 0; k--) if (signedDist(tiers[k], x, z) < -inset) return k
    return -1
  }

  const props: Prop[] = []
  const taken: [number, number, number][] = []
  const free = (x: number, z: number, r: number) => taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + r)

  const place = (
    kind: PropKind,
    count: number,
    opts: {
      tiers: number[]
      rimBand?: [number, number]
      nearUpperWall?: [number, number]
      back?: boolean
      front?: boolean
      trailClear: number
      spacing: number
      scale: [number, number]
      tilt?: number
      tries?: number
    },
  ) => {
    let placed = 0
    const tries = opts.tries ?? 600
    for (let i = 0; i < tries && placed < count; i++) {
      const k = opts.tiers[Math.floor(rand() * opts.tiers.length)]
      const t = tiers[k]
      const a = rand() * TAU
      const rr = radiusAt(t, a)
      let off: number
      if (opts.rimBand) off = -(opts.rimBand[0] + rand() * (opts.rimBand[1] - opts.rimBand[0]))
      else off = -rand() * rr * 0.95
      const [x, z] = pointAt(t, a, off)
      if (topTierIndex(x, z, 0.1) !== k) continue
      const up = tiers[k + 1]
      if (up) {
        const du = signedDist(up, x, z)
        if (opts.nearUpperWall) {
          if (du < opts.nearUpperWall[0] || du > opts.nearUpperWall[1]) continue
        } else if (du < 0.22) continue
      } else if (opts.nearUpperWall) continue
      if (opts.back && z > t.cz - 0.1 * rr) continue
      if (opts.front && z < t.cz + 0.1 * rr) continue
      if (trailDist(x, z) < opts.trailClear) continue
      if (onRamp(x, z)) continue
      const sc = opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0])
      if (!free(x, z, opts.spacing * sc)) continue
      taken.push([x, z, opts.spacing * sc])
      const outward = Math.atan2(z - t.cz, x - t.cx)
      const tilt = opts.tilt ?? 0
      props.push({
        kind,
        x,
        y: groundHeightAt(x, z),
        z,
        rot: rand() * TAU,
        scale: sc,
        tiltX: Math.sin(outward) * tilt,
        tiltZ: -Math.cos(outward) * tilt,
      })
      placed++
    }
  }

  place('darkTree', 5, { tiers: [2], rimBand: [0.1, 0.4], back: true, trailClear: 0.45, spacing: 0.34, scale: [0.55, 0.75] })
  place('darkTree', 8, { tiers: [1], rimBand: [0.08, 0.5], back: true, trailClear: 0.45, spacing: 0.34, scale: [0.5, 0.72] })
  place('darkTree', 6, { tiers: [0], rimBand: [0.1, 0.5], back: true, trailClear: 0.45, spacing: 0.34, scale: [0.45, 0.62] })
  place('palmTall', 2, { tiers: [2], rimBand: [0.12, 0.3], trailClear: 0.4, spacing: 0.3, scale: [0.55, 0.65], tilt: 0.18 })
  place('palmBend', 2, { tiers: [1], rimBand: [0.12, 0.28], trailClear: 0.4, spacing: 0.3, scale: [0.55, 0.65], tilt: 0.2 })
  place('palmDetailed', 3, { tiers: [0], rimBand: [0.1, 0.3], trailClear: 0.4, spacing: 0.3, scale: [0.5, 0.62], tilt: 0.22 })
  place('roundTree', 3, { tiers: [0, 1], nearUpperWall: [0.25, 0.6], back: true, trailClear: 0.45, spacing: 0.3, scale: [0.45, 0.6] })
  place('bushBig', 5, { tiers: [0, 1], nearUpperWall: [0.12, 0.35], trailClear: 0.3, spacing: 0.25, scale: [0.8, 1.1] })
  place('bush', 7, { tiers: [0, 1, 2], rimBand: [0.12, 0.35], trailClear: 0.3, spacing: 0.2, scale: [0.8, 1.2] })
  place('heroRock', 1, { tiers: [0], front: true, trailClear: 0.55, spacing: 0.5, scale: [0.6, 0.7] })
  for (const p of props) if (p.kind === 'heroRock') p.scaleY = 1.6
  place('stump', 1, { tiers: [2], trailClear: 0.35, spacing: 0.3, scale: [1.1, 1.3] })
  place('log', 1, { tiers: [1], trailClear: 0.35, spacing: 0.3, scale: [0.7, 0.9] })
  place('fern', 5, { tiers: [0], trailClear: 0.25, spacing: 0.14, scale: [0.7, 1.0] })
  place('fern', 3, { tiers: [1, 2], trailClear: 0.25, spacing: 0.14, scale: [0.7, 1.0] })
  place('fernTall', 5, { tiers: [0, 1], nearUpperWall: [0.1, 0.4], trailClear: 0.25, spacing: 0.12, scale: [0.8, 1.1] })
  place('flower', 4, { tiers: [0, 1, 2], trailClear: 0.22, spacing: 0.1, scale: [0.7, 0.9] })
  place('mushroom', 3, { tiers: [0, 1], nearUpperWall: [0.1, 0.35], trailClear: 0.22, spacing: 0.1, scale: [0.8, 1.0] })
  place('grassTuft', 5, { tiers: [0, 1, 2], trailClear: 0.2, spacing: 0.1, scale: [0.7, 1.0] })

  const pillars: Pillar[] = []
  const tryPillar = (k: number, n: number, hRange: [number, number], rRange: [number, number]) => {
    const t = tiers[k]
    for (let i = 0, placed = 0; i < 300 && placed < n; i++) {
      const a = rand() * TAU
      const radius = rRange[0] + rand() * (rRange[1] - rRange[0])
      const [x, z] = pointAt(t, a, -radius * 0.55)
      if (k === 0 && z > 0.2) continue
      if (topTierIndex(x, z, radius * 0.4) !== k) continue
      const up = tiers[k + 1]
      if (up && signedDist(up, x, z) < 0.3) continue
      if (trailDist(x, z) < 0.5 || onRamp(x, z, 0.3)) continue
      if (!free(x, z, radius + 0.1)) continue
      taken.push([x, z, radius + 0.1])
      pillars.push({
        x,
        z,
        base: t.top - 0.02,
        height: hRange[0] + rand() * (hRange[1] - hRange[0]),
        radius,
        sides: 6 + Math.floor(rand() * 2),
        rot: rand() * TAU,
        grassCap: rand() > 0.35,
      })
      placed++
    }
  }
  tryPillar(1, 2, [0.45, 0.8], [0.16, 0.22])
  tryPillar(0, 1, [0.4, 0.7], [0.15, 0.2])
  tryPillar(2, 1, [0.3, 0.5], [0.12, 0.16])

  const waterRocks: WaterRock[] = []
  for (let i = 0, placed = 0; i < 200 && placed < 5; i++) {
    const a = placed < 2 ? spitAngle + j(0.35) : rand() * TAU
    const d = radiusAt(beach, a) + 0.3 + rand() * 0.45
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (trailDist(x, z) < 0.8) continue
    if (!free(x, z, 0.25)) continue
    taken.push([x, z, 0.25])
    waterRocks.push({ x, z, radius: 0.1 + rand() * 0.1, height: 0.08 + rand() * 0.12, rot: rand() * TAU })
    placed++
  }
  for (let i = 0, placed = 0; i < 100 && placed < 3; i++) {
    const a = rand() * TAU
    const d = radiusAt(beach, a) + 0.35 + rand() * 0.5
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (!free(x, z, 0.2)) continue
    taken.push([x, z, 0.2])
    props.push({ kind: 'lily', x, y: WATER_Y + 0.02, z, rot: rand() * TAU, scale: 0.9 + rand() * 0.3 })
    placed++
  }

  // Waterfall down T2's left-hand cliff, away from the trail.
  let waterfall: Waterfall | null = null
  if (shelf) {
    const a = Math.atan2(shelf.cz - t2.cz, shelf.cx - t2.cx)
    waterfall = { tier: shelf, angle: a, width: 0.24, top: shelf.top, bottom: h1 }
  }
  for (let i = 0; i < 40 && !waterfall; i++) {
    const a = (150 + j(40)) * DEG
    const [x, z] = pointAt(t2, a, 0.25)
    if (trailDist(x, z) < 0.8 || onRamp(x, z, 0.3)) continue
    if (signedDist(t3, x, z) < 0.3) continue
    waterfall = { tier: t2, angle: a, width: 0.26, top: h2, bottom: h1 }
    break
  }

  if (waterfall) {
    const [px, pz] = pointAt(waterfall.tier, waterfall.angle, 0.28)
    for (let i = props.length - 1; i >= 0; i--) if (Math.hypot(props[i].x - px, props[i].z - pz) < 0.5) props.splice(i, 1)
    taken.push([px, pz, 0.45])
  }

  // Boulders slumped at cliff feet, like the reference's stacked slabs.
  for (let i = 0, placed = 0; i < 400 && placed < 6; i++) {
    const k = placed < 3 ? 1 : 0
    const up = tiers[k + 1]
    const a = rand() * TAU
    const radius = 0.12 + rand() * 0.1
    const [x, z] = pointAt(up, a, radius * 0.7 + 0.05)
    if (topTierIndex(x, z, 0.05) !== k) continue
    if (trailDist(x, z) < 0.45 || onRamp(x, z, 0.25)) continue
    if (!free(x, z, radius + 0.05)) continue
    taken.push([x, z, radius + 0.05])
    pillars.push({ x, z, base: tiers[k].top - 0.02, height: 0.12 + rand() * 0.2, radius, sides: 5, rot: rand() * TAU, grassCap: false, boulder: true })
    placed++
  }

  const rampAngleClear = (k: number, a: number) =>
    ramps.every((r) => r.tier !== tiers[k] || rampParam(r, a) < -0.25 || rampParam(r, a) > 1 + r.landSpan / Math.abs(r.a1 - r.a0) + 0.25)
  const nearTrailAtWall = (k: number, a: number, pad: number) => {
    const [x, z] = pointAt(tiers[k], a, 0.2)
    return trailDist(x, z) < pad
  }
  const vines: Vine[] = []
  for (let i = 0, placed = 0; i < 300 && placed < 9; i++) {
    const k = 1 + Math.floor(rand() * 2)
    const a = rand() * TAU
    if (!rampAngleClear(k, a) || nearTrailAtWall(k, a, 0.3)) continue
    if (waterfall && k === 1 && Math.abs(wrapPi(a - waterfall.angle)) < 0.25) continue
    const drop = tiers[k].top - tiers[k - 1].top
    vines.push({ tier: k, angle: a, length: drop * (0.3 + rand() * 0.4) })
    placed++
  }
  const caves: Cave[] = []
  for (let i = 0; i < 80 && caves.length < 1; i++) {
    const k = 1 + Math.floor(rand() * 2)
    const a = (75 + j(55)) * DEG + (k === 2 ? 0 : 0)
    if (!rampAngleClear(k, a) || nearTrailAtWall(k, a, 0.6)) continue
    if (waterfall && k === 1 && Math.abs(wrapPi(a - waterfall.angle)) < 0.5) continue
    caves.push({ tier: k, angle: a, width: 0.34, height: 0.3 })
  }

  // A tiny camp beside the trail on the mid plateau: the human-scale cue.
  let camp: IslandLayout['camp'] = null
  for (let i = 0; i < 600 && !camp; i++) {
    const a = rand() * TAU
    const k = i < 300 ? 1 : 0
    const [x, z] = pointAt(tiers[k], a, -(0.25 + rand() * 1.2))
    if (topTierIndex(x, z, 0.22) !== k || signedDist(tiers[k + 1], x, z) < 0.35) continue
    if (shelf && signedDist(shelf, x, z) < 0.2) continue
    const td = trailDist(x, z)
    if (td < 0.3 || td > 0.7 || onRamp(x, z, 0.25) || !free(x, z, 0.28)) continue
    taken.push([x, z, 0.28])
    let best = 0
    let bd = Infinity
    trail2D.forEach(([tx, tz], ti) => {
      const d = Math.hypot(tx - x, tz - z)
      if (d < bd) {
        bd = d
        best = ti
      }
    })
    const [tx, tz] = trail2D[best]
    camp = { x, y: groundHeightAt(x, z), z, rot: Math.atan2(tx - x, tz - z) }
  }

  const footprintRadius = Math.max(...beachR)
  return { seed, beach, tiers, ramps, trail2D, trail, props, pillars, waterRocks, waterfall, shelf, camp, vines, caves, groundHeightAt, footprintRadius }
}
