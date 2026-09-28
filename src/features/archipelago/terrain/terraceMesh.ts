import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { hash01 } from '../../../lib/archipelago'
import type { IslandLayout, Vec2 } from '../../../lib/island/types'
import { WATER_Y } from '../../../lib/island/types'
import { BIOME_TERRAIN, SHARED_PALETTE } from '../../../lib/island/biomes'
import type { TerrainPalette } from '../../../lib/island/biomes'
import { BEACH, FIELD_SOFTNESS, LAWN, blobSd } from '../../../lib/island/shapes'
import { rayExit, sunOcclusion } from '../../../lib/island/query'
import { sunDirLocal } from '../../../lib/island/orientation'
import { levelCore } from '../../../lib/island/trailPlan'
import { valueNoise2 } from '../../../lib/island/random'

export type IslandDetail = 'overview' | 'focus' | 'preview'

export interface TerrainMeshes {
  readonly lit: BufferGeometry
  readonly unlit: BufferGeometry
  readonly hull: BufferGeometry
}

const CELL: Record<IslandDetail, number> = { focus: 0.07, overview: 0.12, preview: 0.15 }
const EXTENT = 3.5
const TAU = Math.PI * 2

type P3 = [number, number, number]
type Band = readonly [number, Color]

interface V {
  x: number
  z: number
  h: number
  m: number
  sd: Float64Array
  sun: number
}

const lerpV = (a: V, b: V, t: number): V => {
  const sd = new Float64Array(a.sd.length)
  for (let i = 0; i < sd.length; i++) sd[i] = a.sd[i] + (b.sd[i] - a.sd[i]) * t
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t, m: a.m + (b.m - a.m) * t, sd, sun: a.sun + (b.sun - a.sun) * t }
}

function clip(poly: V[], f: (v: V) => number): V[] {
  const out: V[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if (fa >= 0 !== fb >= 0) out.push(lerpV(a, b, fa / (fa - fb)))
  }
  return out
}

const color = (hex: string) => new Color(hex)

class Builder {
  readonly pos: number[] = []
  readonly col: number[] = []

  tri(a: P3, b: P3, c: P3, ca: Color, cb: Color = ca, cc: Color = ca) {
    this.pos.push(...a, ...b, ...c)
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
  }

  /** A triangle forced to face +Y. */
  up(a: P3, b: P3, c: P3, ca: Color, cb: Color = ca, cc: Color = ca) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    if (ny > 0) this.tri(a, b, c, ca, cb, cc)
    else this.tri(a, c, b, ca, cc, cb)
  }

  /** A triangle forced to face along `want`. */
  facing(a: P3, b: P3, c: P3, want: P3, k: Color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const n: P3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) this.tri(a, b, c, k)
    else this.tri(a, c, b, k)
  }

  /**
   * A near-vertical wall from p0 to p1 facing `n` (horizontal), banded bottom→top. `offset(p, f)` displaces the point
   * p at height fraction f (cliff lean and slabs). It must depend on p alone, never on the segment, or neighbouring
   * segments pull their shared corner apart and the wall cracks.
   */
  wall(p0: Vec2, p1: Vec2, lo0: number, hi0: number, lo1: number, hi1: number, n: Vec2, bands: readonly Band[], offset: (p: Vec2, f: number) => Vec2 = NO_OFFSET) {
    const nl = Math.hypot(n[0], n[1]) || 1
    const nx = n[0] / nl
    const nz = n[1] / nl
    const at = (p: Vec2, lo: number, hi: number, f: number): P3 => {
      const o = offset(p, f)
      return [p[0] + o[0], lo + (hi - lo) * f, p[1] + o[1]]
    }
    let prev = 0
    for (const [frac, c] of bands) {
      if (frac <= prev) continue
      const a0 = at(p0, lo0, hi0, prev)
      const a1 = at(p0, lo0, hi0, frac)
      const b0 = at(p1, lo1, hi1, prev)
      const b1 = at(p1, lo1, hi1, frac)
      this.facing(a0, b0, b1, [nx, 0, nz], c)
      this.facing(a0, b1, a1, [nx, 0, nz], c)
      prev = frac
    }
  }

  get triangles() {
    return this.pos.length / 9
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    return g
  }
}

interface Ctx {
  readonly layout: IslandLayout
  readonly palette: TerrainPalette
  readonly cliff: (typeof BIOME_TERRAIN)['jungle']['cliff']
  readonly top: number
  readonly noise: (x: number, z: number) => number
  readonly normals: Map<string, Vec2>
}

/** Spec §2.4 cliff bands: dark base, main (lit/mid/shade per flute bin, ±12%), light rim, grass lip. */
function fluteBin(ctx: Ctx, level: number, x: number, z: number): number {
  const blob = ctx.layout.blobs[level]
  return Math.floor((Math.atan2(z - (blob?.cz ?? 0), x - (blob?.cx ?? 0)) + Math.PI) * ctx.cliff.binsPerRadian)
}

function cliffBands(ctx: Ctx, level: number, x: number, z: number, height: number): Band[] {
  const bin = fluteBin(ctx, level, x, z)
  const seed = ctx.layout.seed
  const v = hash01(seed, bin, 200 + level)
  const tone = [ctx.palette.cliffLit, ctx.palette.cliff, ctx.palette.cliffShade][Math.floor(hash01(seed, bin, 230 + level) * 3)]
  const main = color(tone).multiplyScalar(0.88 + 0.24 * v)
  const base = color(ctx.palette.cliffBase).multiplyScalar(0.92 + 0.14 * v)
  const baseFrac = ctx.cliff.baseBand[0] + (ctx.cliff.baseBand[1] - ctx.cliff.baseBand[0]) * hash01(seed, bin, 260 + level)
  const lip = Math.min(0.045 / height, 0.2)
  const rim = Math.min(0.06 / height, 0.2)
  return [[baseFrac, base], [1 - lip - rim, main], [1 - lip, color(ctx.palette.cliffRim).multiplyScalar(0.95 + 0.1 * v)], [1, color(ctx.palette.lip)]]
}

function wallFor(ctx: Ctx, level: number, x: number, z: number, height: number): { bands: Band[]; offset: (p: Vec2, f: number) => Vec2 } | null {
  if (height < 0.012) return null
  const role = ctx.layout.levels[level].wall
  if (role === 'sand') return { bands: [[1, color(SHARED_PALETTE.sandWall)]], offset: NO_OFFSET }
  if (role === 'lip') return { bands: [[0.45, color(SHARED_PALETTE.sandWall)], [1, color(ctx.palette.lip)]], offset: NO_OFFSET }
  if (role !== 'cliff') return null
  const lean = ctx.cliff.lean * height
  return {
    bands: cliffBands(ctx, level, x, z, height),
    offset: (p, f) => {
      const slab = hash01(ctx.layout.seed, fluteBin(ctx, level, p[0], p[1]), 250 + level) < ctx.cliff.slabChance
      const d = lean * (1 - f) + (slab && f < 0.6 ? 0.06 * (1 - f / 0.6) : 0)
      if (d === 0) return NO_SHIFT
      const [ox, oz] = outward(ctx, level, p)
      return [ox * d, oz * d]
    },
  }
}

const NO_SHIFT: Vec2 = [0, 0]
const NO_OFFSET = (): Vec2 => NO_SHIFT

/** Outward horizontal unit normal of level's outline at p (down the signed-distance gradient), memoised per point. */
function outward(ctx: Ctx, level: number, p: Vec2): Vec2 {
  const key = `${level}:${p[0].toFixed(5)}:${p[1].toFixed(5)}`
  let n = ctx.normals.get(key)
  if (!n) {
    const e = 0.01
    const gx = ctx.layout.sdAt(p[0] + e, p[1])[level] - ctx.layout.sdAt(p[0] - e, p[1])[level]
    const gz = ctx.layout.sdAt(p[0], p[1] + e)[level] - ctx.layout.sdAt(p[0], p[1] - e)[level]
    const len = Math.hypot(gx, gz) || 1
    n = [-gx / len, -gz / len]
    ctx.normals.set(key, n)
  }
  return n
}

function topColor(ctx: Ctx, level: number, v: V): Color {
  const { palette, layout } = ctx
  const n = ctx.noise(v.x * 0.9, v.z * 0.9) * 0.7 + ctx.noise(v.x * 2.3 + 5, v.z * 2.3) * 0.3
  if (level === BEACH) return color(SHARED_PALETTE.sand).multiplyScalar(1 + 0.03 * n)
  const c = color(level === LAWN ? palette.lawn : palette.cap)
  c.lerp(color(n > 0 ? palette.capLight : palette.capDark), Math.min(1, Math.abs(n) * 0.9))
  if (v.sd[level] < 0.05) c.lerp(color(palette.capLight), 0.5)
  if (level < ctx.top) {
    const d = -v.sd[level + 1]
    if (d < 0.45) c.multiplyScalar(0.74 + 0.26 * Math.max(0, d / 0.45))
  }
  if (layout.features.shelf && level === ctx.top - 1) {
    const d = -blobSd(layout.features.shelf.blob, v.x, v.z)
    if (d >= 0 && d < 0.45) c.multiplyScalar(0.74 + 0.26 * d / 0.45)
  }
  return c.multiplyScalar(1 - 0.2 * v.sun)
}

function slice(ctx: Ctx, lit: Builder, cell: number) {
  const { layout } = ctx
  const n = Math.ceil((2 * EXTENT) / cell)
  const sun = sunDirLocal()
  const verts: V[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -EXTENT + i * cell
      const z = -EXTENT + j * cell
      const sd = layout.sdAt(x, z)
      let h = 0
      let level = -1
      for (let k = 0; k < sd.length; k++) {
        h += Math.min(1, Math.max(0, sd[k] / FIELD_SOFTNESS + 0.5))
        if (sd[k] > 0 && level === k - 1) level = k
      }
      const m = level >= BEACH ? layout.pathProject(x, z).d - layout.trail.halfWidth : 1
      const occ = level >= LAWN ? sunOcclusion(layout.heightGrid, sun, x, layout.levels[level].y, z) : 0
      verts.push({ x, z, h, m, sd, sun: occ })
    }
  }

  const colourCache = new Map<V, Color>()
  const tint = (level: number, v: V) => {
    let c = colourCache.get(v)
    if (!c) {
      c = topColor(ctx, level, v)
      colourCache.set(v, c)
    }
    return c
  }

  const emit = (a: V, b: V, c: V) => {
    const hmin = Math.min(a.h, b.h, c.h)
    const hmax = Math.max(a.h, b.h, c.h)
    if (hmax < 0.5) return
    const carve = a.m < 0 || b.m < 0 || c.m < 0
    if (a.m < 0 && b.m < 0 && c.m < 0) return
    const lmin = Math.max(0, Math.floor(hmin - 0.5))
    const lmax = Math.min(ctx.top, Math.floor(hmax - 0.5))
    const tri = [a, b, c]
    for (let level = Math.max(BEACH, lmin); level <= lmax; level++) {
      let poly = tri
      if (level > lmin || hmin < level + 0.5) poly = clip(poly, (v) => v.h - (level + 0.5))
      if (level < lmax) poly = clip(poly, (v) => level + 1.5 - v.h)
      if (carve) poly = clip(poly, (v) => v.m)
      const y = layout.levels[level].y
      for (let k = 1; k + 1 < poly.length; k++) {
        const p0 = poly[0]
        const p1 = poly[k]
        const p2 = poly[k + 1]
        lit.up([p0.x, y, p0.z], [p1.x, y, p1.z], [p2.x, y, p2.z], tint(level, p0), tint(level, p1), tint(level, p2))
      }
    }
    for (let level = Math.max(BEACH, lmin + 1); level <= lmax; level++) {
      const t = level + 0.5 + 1e-7
      const cross: V[] = []
      for (let e = 0; e < 3; e++) {
        const p = tri[e]
        const q = tri[(e + 1) % 3]
        if ((p.h - t) * (q.h - t) < 0) cross.push(lerpV(p, q, (t - p.h) / (q.h - p.h)))
      }
      if (cross.length !== 2) continue
      let [p, q] = cross
      if (p.m < 0 && q.m < 0) continue
      if (p.m < 0) p = lerpV(p, q, p.m / (p.m - q.m))
      else if (q.m < 0) q = lerpV(q, p, q.m / (q.m - p.m))
      const low = tri.reduce((acc, v) => (v.h < acc.h ? v : acc))
      const mx = (p.x + q.x) / 2
      const mz = (p.z + q.z) / 2
      const lo = layout.levels[level - 1].y
      const hi = layout.levels[level].y
      const spec = wallFor(ctx, level, mx, mz, hi - lo)
      if (!spec) continue
      lit.wall([p.x, p.z], [q.x, q.z], lo, hi, lo, hi, [low.x - mx, low.z - mz], spec.bands, spec.offset)
    }
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v00 = verts[j * (n + 1) + i]
      const v10 = verts[j * (n + 1) + i + 1]
      const v01 = verts[(j + 1) * (n + 1) + i]
      const v11 = verts[(j + 1) * (n + 1) + i + 1]
      if ((i + j) % 2 === 0) {
        emit(v00, v10, v11)
        emit(v00, v11, v01)
      } else {
        emit(v00, v10, v01)
        emit(v10, v11, v01)
      }
    }
  }
}

/**
 * Foam and shallow halo as polar rings rather than grid slices: a fraction of the triangles for the same look. Each
 * ring starts a little inside the level above it, underneath that level's cap, so no water shows through the seam.
 */
function waterRings(ctx: Ctx, unlit: Builder) {
  const { layout } = ctx
  const segments = 96
  const radius = (level: number, a: number) => rayExit((x, z) => layout.sdAt(x, z)[level] > 0, 0, 0, a)
  const rings = Array.from({ length: segments }, (_, k) => {
    const a = (k / segments) * TAU
    return { a, beach: radius(BEACH, a), foam: radius(1, a), halo: radius(0, a) }
  })
  const foam = color(SHARED_PALETTE.foam)
  const foamEdge = color(SHARED_PALETTE.foamEdge)
  const shallow = color(SHARED_PALETTE.shallow)
  const water = color(SHARED_PALETTE.water)
  const at = (a: number, r: number, y: number): P3 => [Math.cos(a) * r, y, Math.sin(a) * r]
  for (let k = 0; k < segments; k++) {
    const p = rings[k]
    const q = rings[(k + 1) % segments]
    const a1 = k + 1 === segments ? TAU : q.a
    const quad = (r0p: number, r0q: number, r1p: number, r1q: number, y: number, inner: Color, outer: Color) => {
      unlit.up(at(p.a, r0p, y), at(p.a, r1p, y), at(a1, r1q, y), inner, outer, outer)
      unlit.up(at(p.a, r0p, y), at(a1, r1q, y), at(a1, r0q, y), inner, outer, inner)
    }
    const foamY = layout.levels[1].y
    quad(p.beach - 0.04, q.beach - 0.04, Math.max(p.beach, p.foam - 0.03), Math.max(q.beach, q.foam - 0.03), foamY, foam, foam)
    quad(Math.max(p.beach, p.foam - 0.03), Math.max(q.beach, q.foam - 0.03), p.foam, q.foam, foamY, foam, foamEdge)
    quad(p.foam - 0.03, q.foam - 0.03, p.halo, q.halo, layout.levels[0].y, shallow, water)
  }
}

/** Spec §3.8 corridor: a strip flat across at the path's own y, with cut walls up into terrain and fill walls down to it. */
function corridor(ctx: Ctx, lit: Builder, coarse: boolean) {
  const { layout, palette } = ctx
  const samples = coarse ? layout.trail.samples.filter((_, i, all) => i % 2 === 0 || i === all.length - 1) : layout.trail.samples
  const hw = layout.trail.halfWidth + 0.01
  const edges = samples.map((p, i) => {
    const a = samples[Math.max(0, i - 2)]
    const b = samples[Math.min(samples.length - 1, i + 2)]
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const nx = -(b.z - a.z) / tl
    const nz = (b.x - a.x) / tl
    const slope = (b.y - a.y) / Math.max(1e-6, b.s - a.s)
    return { p, nx, nz, slope }
  })
  const pathC = color(palette.path)
  const edgeC = color(palette.pathEdge)
  const treadC = color(palette.tread)
  const offsets = coarse ? [-hw, hw] : [-hw, -hw + 0.025, 0, hw - 0.025, hw]
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    const tread = a.slope > 0.15 && a.p.s % 0.15 < 0.035
    for (let k = 0; k + 1 < offsets.length; k++) {
      const c = tread ? treadC : !coarse && (k === 0 || k === offsets.length - 2) ? edgeC : pathC
      const p = (e: typeof a, o: number): P3 => [e.p.x + e.nx * o, e.p.y, e.p.z + e.nz * o]
      lit.up(p(a, offsets[k]), p(a, offsets[k + 1]), p(b, offsets[k + 1]), c)
      lit.up(p(a, offsets[k]), p(b, offsets[k + 1]), p(b, offsets[k]), c)
    }
  }
  for (const e of [edges[0], edges[edges.length - 1]]) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU
      const a1 = ((k + 1) / 16) * TAU
      lit.up([e.p.x, e.p.y, e.p.z], [e.p.x + Math.cos(a0) * hw, e.p.y, e.p.z + Math.sin(a0) * hw], [e.p.x + Math.cos(a1) * hw, e.p.y, e.p.z + Math.sin(a1) * hw], pathC)
    }
  }
  for (const side of [1, -1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i]
      const b = edges[i + 1]
      const pa: Vec2 = [a.p.x + a.nx * hw * side, a.p.z + a.nz * hw * side]
      const pb: Vec2 = [b.p.x + b.nx * hw * side, b.p.z + b.nz * hw * side]
      const out: Vec2 = [a.nx * side, a.nz * side]
      const ta = layout.terraceY(pa[0] + out[0] * 0.05, pa[1] + out[1] * 0.05)
      const tb = layout.terraceY(pb[0] + out[0] * 0.05, pb[1] + out[1] * 0.05)
      const lo0 = Math.min(a.p.y, ta)
      const hi0 = Math.max(a.p.y, ta)
      const lo1 = Math.min(b.p.y, tb)
      const hi1 = Math.max(b.p.y, tb)
      const h = Math.max(hi0 - lo0, hi1 - lo1)
      if (h < 0.01) continue
      const cut = ta + tb > a.p.y + b.p.y
      const level = Math.max(BEACH, layout.levelAt(pa[0] + out[0] * 0.1, pa[1] + out[1] * 0.1))
      const bands: Band[] = h < 0.05 || coarse ? [[1, color(h < 0.05 ? palette.lip : palette.cliff)]] : cliffBands(ctx, Math.max(LAWN + 1, level), pa[0], pa[1], h)
      lit.wall(pa, pb, lo0, hi0, lo1, hi1, cut ? [-out[0], -out[1]] : out, bands)
    }
  }
}

function prism(b: Builder, ring: Vec2[], lo: number, hi: number, cap: Color, bands: (i: number) => Band[]) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]
    const c = ring[(k + 1) % ring.length]
    b.up([cx, hi, cz], [a[0], hi, a[1]], [c[0], hi, c[1]], cap)
    b.wall(a, c, lo, hi, lo, hi, [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cz], bands(k))
  }
}

function features(ctx: Ctx, lit: Builder, unlit: Builder, coarse: boolean) {
  const { layout, palette } = ctx
  const f = layout.features
  const seed = layout.seed
  if (f.shelf) {
    const shelf = f.shelf
    const below = ctx.top - 1
    const inside = (x: number, z: number) => Math.min(blobSd(shelf.blob, x, z), layout.sdAt(x, z)[below] - 0.08) > 0
    const ring: Vec2[] = []
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU
      const r = rayExit(inside, shelf.blob.cx, shelf.blob.cz, a)
      ring.push([shelf.blob.cx + Math.cos(a) * r, shelf.blob.cz + Math.sin(a) * r])
    }
    prism(lit, ring, shelf.baseY, shelf.y, color(palette.cap), (k) => cliffBands(ctx, below, ring[k][0], ring[k][1], shelf.y - shelf.baseY))
  }
  if (f.pool) {
    const poolC = color(palette.pool ?? SHARED_PALETTE.shallow)
    const foamC = color(SHARED_PALETTE.foam)
    for (let k = 0; k < 20; k++) {
      const a0 = (k / 20) * TAU
      const a1 = ((k + 1) / 20) * TAU
      const at = (a: number, r: number, dy = 0): P3 => [f.pool!.x + Math.cos(a) * r, f.pool!.y + dy, f.pool!.z + Math.sin(a) * r]
      unlit.up(at(0, 0), at(a0, f.pool.r), at(a1, f.pool.r), poolC)
      unlit.up(at(a0, f.pool.r), at(a0, f.pool.r + 0.03, 0.001), at(a1, f.pool.r + 0.03, 0.001), foamC)
      unlit.up(at(a0, f.pool.r), at(a1, f.pool.r + 0.03, 0.001), at(a1, f.pool.r), foamC)
    }
  }
  if (f.fall && f.fall.samples.length > 1) waterfall(ctx, unlit)
  for (const p of f.pillars) {
    const ring: Vec2[] = []
    for (let k = 0; k < p.sides; k++) {
      const a = p.rot + (k / p.sides) * TAU + hash01(seed, k, 400) * 0.4
      const r = p.r * (0.82 + 0.3 * hash01(seed, k, 401))
      ring.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r])
    }
    const capC = color(p.grassCap ? palette.cap : palette.pillarCap)
    prism(lit, ring, p.baseY - 0.02, p.topY, capC, (k) => {
      const v = hash01(seed, k, 402)
      return [[0.3, color(palette.cliffBase).multiplyScalar(0.9 + 0.15 * v)], [0.93, color(palette.pillar).multiplyScalar(0.88 + 0.24 * v)], [1, color(p.grassCap ? palette.lip : palette.pillarCap)]]
    })
  }
  for (const r of f.waterRocks) {
    const ring: Vec2[] = []
    for (let k = 0; k < 6; k++) ring.push([r.x + Math.cos(r.rot + (k / 6) * TAU) * r.r, r.z + Math.sin(r.rot + (k / 6) * TAU) * r.r])
    prism(lit, ring, WATER_Y - 0.05, WATER_Y + r.height, color(palette.pillarCap), () => [[0.6, color(palette.cliffBase)], [1, color(palette.pillar)]])
    const foam = color(SHARED_PALETTE.foam)
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU
      const a1 = ((k + 1) / 16) * TAU
      const at = (a: number, rr: number): P3 => [r.x + Math.cos(a) * rr, -0.036, r.z + Math.sin(a) * rr]
      unlit.up(at(a0, r.r * 0.9), at(a0, r.r * 1.35 + 0.05), at(a1, r.r * 1.35 + 0.05), foam)
      unlit.up(at(a0, r.r * 0.9), at(a1, r.r * 1.35 + 0.05), at(a1, r.r * 0.9), foam)
    }
  }
  const crevice = color(palette.crevice)
  for (const c of coarse ? [] : f.caves) {
    const ox = Math.sin(c.rotY)
    const oz = Math.cos(c.rotY)
    const px = oz
    const pz = -ox
    const base: P3 = [c.x + ox * 0.015, c.y, c.z + oz * 0.015]
    for (let k = 0; k < 12; k++) {
      const t0 = (k / 12) * Math.PI
      const t1 = ((k + 1) / 12) * Math.PI
      const at = (t: number): P3 => [base[0] - px * Math.cos(t) * (c.width / 2), c.y + Math.sin(t) * c.height, base[2] - pz * Math.cos(t) * (c.width / 2)]
      lit.facing(base, at(t0), at(t1), [ox, 0, oz], crevice)
    }
  }
  const vineC = color(palette.foliage.vine ?? palette.lip)
  const leafC = color(palette.foliage.vineLeaf ?? palette.capLight)
  for (const v of coarse ? [] : f.vines) {
    const ox = Math.sin(v.rotY) * 0.012
    const oz = Math.cos(v.rotY) * 0.012
    const px = Math.cos(v.rotY) * 0.015
    const pz = -Math.sin(v.rotY) * 0.015
    const want: P3 = [Math.sin(v.rotY), 0, Math.cos(v.rotY)]
    const segs = 6
    for (let i = 0; i < segs; i++) {
      const y0 = v.y - (v.length * i) / segs
      const y1 = v.y - (v.length * (i + 1)) / segs
      const sw0 = Math.sin(i * 1.3) * 0.01
      const sw1 = Math.sin((i + 1) * 1.3) * 0.01
      const at = (y: number, s: number, sw: number): P3 => [v.x + ox + px * s + px * sw * 60, y, v.z + oz + pz * s + pz * sw * 60]
      lit.facing(at(y0, -1, sw0), at(y0, 1, sw0), at(y1, 1, sw1), want, vineC)
      lit.facing(at(y0, -1, sw0), at(y1, 1, sw1), at(y1, -1, sw1), want, vineC)
      if (i % 2 === 1) {
        const side = i % 4 === 1 ? 1 : -1
        const ly = (y0 + y1) / 2
        const c0 = at(ly, 0, sw0)
        lit.facing(c0, at(ly + 0.03, 2.5 * side, sw0), at(ly - 0.015, 4 * side, sw0), want, leafC)
        lit.facing(c0, at(ly - 0.015, 4 * side, sw0), at(ly - 0.05, 2.5 * side, sw0), want, leafC)
      }
    }
  }
}

function waterfall(ctx: Ctx, unlit: Builder) {
  const fall = ctx.layout.features.fall!
  const base = color(ctx.palette.fall ?? SHARED_PALETTE.shallow)
  const streak = color(ctx.palette.fallStreak ?? SHARED_PALETTE.foam)
  const foam = color(SHARED_PALETTE.foam)
  const [dx, dz] = fall.dir
  const px = -dz
  const pz = dx
  const hw = 0.1
  const disc = (x: number, z: number, y: number, r: number, c: Color) => {
    for (let k = 0; k < 14; k++) {
      const a0 = (k / 14) * TAU
      const a1 = ((k + 1) / 14) * TAU
      unlit.up([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], c)
    }
  }
  const s = fall.samples
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i]
    const c = s[i + 1]
    if (Math.abs(a[1] - c[1]) < 1e-4) {
      const y = a[1] + 0.006
      unlit.up([a[0] + px * hw, y, a[2] + pz * hw], [a[0] - px * hw, y, a[2] - pz * hw], [c[0] - px * hw, y, c[2] - pz * hw], base)
      unlit.up([a[0] + px * hw, y, a[2] + pz * hw], [c[0] - px * hw, y, c[2] - pz * hw], [c[0] + px * hw, y, c[2] + pz * hw], base)
      continue
    }
    const fx = (a[0] + c[0]) / 2 + dx * 0.03
    const fz = (a[2] + c[2]) / 2 + dz * 0.03
    const lanes = 5
    for (let k = 0; k < lanes; k++) {
      const u0 = -hw + (2 * hw * k) / lanes
      const u1 = -hw + (2 * hw * (k + 1)) / lanes
      unlit.wall([fx + px * u0, fz + pz * u0], [fx + px * u1, fz + pz * u1], c[1], a[1] + 0.006, c[1], a[1] + 0.006, [dx, dz], [[1, k % 2 === 0 ? streak : base]])
    }
    disc(fx + dx * 0.1, fz + dz * 0.1, c[1] + 0.007, 0.18, foam)
  }
}

/** Spec §3.8 hull: each level's outline (48 segments) as a prism, ~600 triangles, for pointer events and label occlusion. */
function hull(ctx: Ctx): BufferGeometry {
  const { layout } = ctx
  const b = new Builder()
  const plain = new Color(1, 1, 1)
  for (let level = BEACH; level <= ctx.top; level++) {
    const centre: Vec2 = level <= LAWN ? [0, 0] : levelCore(layout, level, [layout.blobs[level]!.cx, layout.blobs[level]!.cz])
    const inside = (x: number, z: number) => layout.sdAt(x, z)[level] > 0
    const ring: Vec2[] = []
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU
      const r = rayExit(inside, centre[0], centre[1], a)
      ring.push([centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r])
    }
    prism(b, ring, WATER_Y, layout.levels[level].y, plain, () => [[1, plain]])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.computeVertexNormals()
  return g
}

/** Pure: layout → { lit, unlit, hull } (spec §3.8). Non-indexed, so computeVertexNormals gives flat shading. */
export function buildTerrain(layout: IslandLayout, detail: IslandDetail): TerrainMeshes {
  const cfg = BIOME_TERRAIN[layout.biome]
  const n = valueNoise2(layout.seed, 310)
  const ctx: Ctx = { layout, palette: cfg.palette, cliff: cfg.cliff, top: layout.levels.length - 1, noise: (x, z) => 2 * n(x, z) - 1, normals: new Map() }
  const lit = new Builder()
  const unlit = new Builder()
  slice(ctx, lit, CELL[detail])
  waterRings(ctx, unlit)
  const coarse = detail !== 'focus'
  corridor(ctx, lit, coarse)
  features(ctx, lit, unlit, coarse)
  return { lit: lit.geometry(), unlit: unlit.geometry(), hull: hull(ctx) }
}
