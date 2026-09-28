import type { Level, PolarBlob } from './types'
import { WATER_Y } from './types'

export const FIELD_SOFTNESS = 0.11
export const FOOTPRINT_MAX = 3.05
export const FOAM_MAX = 3.15
export const HALO_MAX = 3.45
export const MIN_BEACH_WIDTH = 0.16
const TAU = Math.PI * 2

export function wrapPi(a: number): number {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}

export function wrapPositive(a: number): number {
  const x = a % TAU
  return x < 0 ? x + TAU : x
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 1 inside the arc from→to (positive direction), cosine falloff over `feather` radians outside it. */
export function angularWindow(a: number, from: number, to: number, feather: number): number {
  const span = wrapPositive(to - from)
  const d = wrapPositive(a - from)
  if (d <= span) return 1
  const gap = Math.min(TAU - d, d - span)
  if (gap >= feather) return 0
  return 0.5 + 0.5 * Math.cos((gap / feather) * Math.PI)
}

export function fluteOffset(flutes: NonNullable<PolarBlob['flutes']>, theta: number): number {
  const n = flutes.offsets.length
  const f = (wrapPositive(theta) / TAU) * n
  const i = Math.floor(f) % n
  const k = f - Math.floor(f)
  return flutes.offsets[i] * (1 - k) + flutes.offsets[(i + 1) % n] * k
}

export function blobSd(b: PolarBlob, x: number, z: number): number {
  const dx = x - b.cx
  const dz = z - b.cz
  const th = Math.atan2(dz, dx)
  let r = b.radius
  for (const h of b.harmonics) r += b.radius * h.amp * Math.cos(h.n * th + h.phase)
  let sd = r - Math.hypot(dx, dz)
  for (const l of b.lobes) sd = Math.max(sd, l.r - Math.hypot(x - l.x, z - l.z))
  if (b.flutes) sd += fluteOffset(b.flutes, th)
  return sd
}

export function scaleBlob(b: PolarBlob, k: number): PolarBlob {
  return {
    ...b,
    cx: b.cx * k,
    cz: b.cz * k,
    radius: b.radius * k,
    lobes: b.lobes.map((l) => ({ x: l.x * k, z: l.z * k, r: l.r * k })),
  }
}

/** A raised minimum ledge margin over an arc of angles measured about (cx, cz). */
export interface RaiseWindow {
  readonly cx: number
  readonly cz: number
  readonly from: number
  readonly to: number
  readonly feather: number
  readonly value: number
}

export interface LedgeSpec {
  readonly back: number
  readonly front: number
  readonly lean: number
}

export interface ChainParams {
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly front: number
  readonly beachWidth: { readonly back: number; readonly front: number }
  readonly ledges: readonly (LedgeSpec | null)[]
  readonly raises: readonly (readonly RaiseWindow[])[]
  readonly wobble: (x: number, z: number) => number
  readonly crag: (x: number, z: number) => number
  readonly widthNoise: (x: number, z: number) => number
  readonly dome: { readonly level: number; readonly height: number; readonly radius: number } | null
  readonly crater: { readonly x: number; readonly z: number; readonly r: number } | null
}

export interface LevelField {
  readonly count: number
  readonly sdAt: (x: number, z: number) => Float64Array
  readonly levelAt: (x: number, z: number) => number
  readonly levelTopY: (level: number, x: number, z: number, sd?: Float64Array) => number
  readonly terraceY: (x: number, z: number) => number
  readonly classField: (x: number, z: number) => number
}

export const BEACH = 2
export const LAWN = 3

/** Nested signed-distance levels (spec §3.4): each level's region is inside the one below by construction. */
export function buildLevelField(p: ChainParams): LevelField {
  const count = p.levels.length
  const beachBlob = p.blobs[BEACH]!
  const facingAt = (x: number, z: number) => 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - p.front)

  const marginAt = (level: number, x: number, z: number, facing: number) => {
    const ledge = p.ledges[level]!
    let m = ledge.back + (ledge.front - ledge.back) * facing * facing + ledge.lean
    for (const w of p.raises[level]) {
      if (w.value <= m) continue
      const t = angularWindow(Math.atan2(z - w.cz, x - w.cx), w.from, w.to, w.feather)
      if (t > 0) m = Math.max(m, m + (w.value - m) * t)
    }
    return m
  }

  const sdAt = (x: number, z: number) => {
    const out = new Float64Array(count)
    const r = Math.hypot(x, z)
    const facing = facingAt(x, z)
    const wob = p.wobble(x, z)
    const beach = blobSd(beachBlob, x, z) + wob
    out[0] = Math.min(beach + 0.4, HALO_MAX - r)
    out[1] = Math.min(beach + 0.1, FOAM_MAX - r)
    out[BEACH] = Math.min(beach, FOOTPRINT_MAX - r)
    const width = Math.max(MIN_BEACH_WIDTH, p.beachWidth.back + (p.beachWidth.front - p.beachWidth.back) * facing * facing + 0.06 * p.widthNoise(x, z))
    out[LAWN] = out[BEACH] - width
    const crag = p.crag(x, z)
    for (let level = LAWN + 1; level < count; level++) {
      const own = blobSd(p.blobs[level]!, x, z) + 0.8 * wob + crag
      out[level] = Math.min(own, out[level - 1] - marginAt(level, x, z, facing))
    }
    if (p.crater) out[count - 1] = Math.min(out[count - 1], Math.hypot(x - p.crater.x, z - p.crater.z) - p.crater.r)
    return out
  }

  const levelOf = (sd: Float64Array) => {
    let n = 0
    while (n < sd.length && sd[n] > 0) n++
    return n - 1
  }

  const levelTopY = (level: number, x: number, z: number, sd?: Float64Array) => {
    if (level < 0) return WATER_Y
    const y = p.levels[level].y
    if (!p.dome || level !== p.dome.level) return y
    const s = sd ?? sdAt(x, z)
    return y + p.dome.height * smoothstep(0, p.dome.radius, s[level])
  }

  return {
    count,
    sdAt,
    levelAt: (x, z) => levelOf(sdAt(x, z)),
    levelTopY,
    terraceY: (x, z) => {
      const sd = sdAt(x, z)
      return levelTopY(levelOf(sd), x, z, sd)
    },
    classField: (x, z) => {
      const sd = sdAt(x, z)
      let h = 0
      for (let i = 0; i < sd.length; i++) h += Math.min(1, Math.max(0, sd[i] / FIELD_SOFTNESS + 0.5))
      return h
    },
  }
}
