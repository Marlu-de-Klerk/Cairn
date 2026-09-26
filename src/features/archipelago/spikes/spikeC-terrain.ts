// Spike C: terraced mesh built by slicing a triangulated level field into flat
// tops + vertical walls, with the trail corridor carved out and rebuilt as a ramp strip.
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { hash2, LEVEL, LEVEL_Y, makeNoise, PATH_HALF_WIDTH, type IslandLayout, type P2 } from './spikeC-layout'

interface V { x: number; z: number; h: number; m: number }

const lerpV = (a: V, b: V, t: number): V => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
  h: a.h + (b.h - a.h) * t,
  m: a.m + (b.m - a.m) * t,
})

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

const col = (hex: string) => new Color(hex)

const PAL = {
  shallow: col('#93D6DA'),
  foam: col('#FFFFFF'),
  sand: col('#EFCB8E'),
  sandWall: col('#DDB677'),
  lawn: col('#70BF81'),
  grass: col('#66B87B'),
  grassLight: col('#86CC92'),
  grassDark: col('#4F9565'),
  lip: col('#5E9F6E'),
  cliff: col('#A8735A'),
  cliffBase: col('#7E5443'),
  cliffRim: col('#C08A6C'),
  path: col('#E2C992'),
  pathEdge: col('#CDAE78'),
  ramp: col('#D8BD86'),
}

class Builder {
  pos: number[] = []
  colr: number[] = []
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], ca: Color, cb: Color = ca, cc: Color = ca) {
    this.pos.push(...a, ...b, ...c)
    this.colr.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
  }
  /** flat top triangle, forced to face up */
  top(a: [number, number, number], b: [number, number, number], c: [number, number, number], ca: Color, cb: Color, cc: Color) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    if (ny > 0) this.tri(a, b, c, ca, cb, cc)
    else this.tri(a, c, b, ca, cc, cb)
  }
  /** vertical wall between two ground points, banded bottom->top, facing `n` */
  wall(p0: P2, p1: P2, lo0: number, hi0: number, lo1: number, hi1: number, n: P2, bands: [number, Color][]) {
    let a = p0
    let b = p1
    let [la, ha, lb, hb] = [lo0, hi0, lo1, hi1]
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    if (-ez * n[0] + ex * n[1] < 0) {
      ;[a, b] = [b, a]
      ;[la, ha, lb, hb] = [lb, hb, la, ha]
    }
    let prev = 0
    for (const [frac, c] of bands) {
      const ya0 = la + (ha - la) * prev
      const ya1 = la + (ha - la) * frac
      const yb0 = lb + (hb - lb) * prev
      const yb1 = lb + (hb - lb) * frac
      this.tri([a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], c)
      this.tri([a[0], ya0, a[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]], c)
      prev = frac
    }
  }
  geometry() {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.colr, 3))
    g.computeVertexNormals()
    return g
  }
}

function cliffBands(layout: IslandLayout, level: number, x: number, z: number, height: number): [number, Color][] {
  const c = level === LEVEL.summit ? layout.centers.summit : level === LEVEL.mid ? layout.centers.mid : layout.centers.beach
  const ang = Math.atan2(z - c[1], x - c[0])
  const bin = Math.floor((ang + Math.PI) * 5.5)
  const v = hash2(layout.seed * 7 + level, bin, 3)
  const shade = 0.86 + 0.24 * v
  const main = PAL.cliff.clone().multiplyScalar(shade)
  const base = PAL.cliffBase.clone().multiplyScalar(0.92 + 0.14 * v)
  const baseFrac = 0.26 + 0.14 * hash2(layout.seed, bin, 9)
  const lipH = Math.min(0.045 / height, 0.2)
  const rimH = Math.min(0.06 / height, 0.2)
  return [
    [baseFrac, base],
    [1 - lipH - rimH, main],
    [1 - lipH, PAL.cliffRim.clone().multiplyScalar(0.95 + 0.1 * v)],
    [1, PAL.lip],
  ]
}

function wallBands(layout: IslandLayout, level: number, x: number, z: number, height: number): [number, Color][] | null {
  if (height < 0.015) return null
  if (level === LEVEL.beach) return [[1, PAL.sandWall]]
  if (level === LEVEL.lawn) return [[0.45, PAL.sandWall], [1, PAL.lip]]
  return cliffBands(layout, level, x, z, height)
}

function topColor(layout: IslandLayout, noise: (x: number, z: number) => number, level: number, x: number, z: number) {
  if (level === LEVEL.shallow) return PAL.shallow
  if (level === LEVEL.foam) return PAL.foam
  const n = noise(x * 0.9, z * 0.9) * 0.7 + noise(x * 2.3 + 5, z * 2.3) * 0.3
  if (level === LEVEL.beach) return PAL.sand.clone().multiplyScalar(1 + n * 0.03)
  const base = level === LEVEL.lawn ? PAL.lawn : PAL.grass
  const c = base.clone()
  if (n > 0) c.lerp(PAL.grassLight, Math.min(1, n * 1.1))
  else c.lerp(PAL.grassDark, Math.min(1, -n * 1.1))
  // baked ambient occlusion at the foot of the next cliff up
  if (level + 1 < LEVEL_Y.length) {
    const d = -layout.sdChain(x, z)[level + 1]
    if (d < 0.45) c.multiplyScalar(0.74 + 0.26 * Math.max(0, d / 0.45))
  }
  return c
}

export function buildTerrainGeometry(layout: IslandLayout, cell = 0.075) {
  const E = layout.extent
  const N = Math.ceil((2 * E) / cell)
  const noise = makeNoise(layout.seed * 13 + 3)
  const verts: V[] = []
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -E + i * cell
      const z = -E + j * cell
      const h = layout.fieldAt(x, z)
      const m = h > 2.5 ? layout.pathDistance(x, z) - PATH_HALF_WIDTH : 1
      verts.push({ x, z, h, m })
    }
  }
  const b = new Builder()
  const flat = new Builder()
  const tint = new Map<string, Color>()
  const tcol = (level: number, x: number, z: number) => {
    const key = `${level}:${x.toFixed(3)}:${z.toFixed(3)}`
    let c = tint.get(key)
    if (!c) {
      c = topColor(layout, noise, level, x, z)
      tint.set(key, c)
    }
    return c
  }

  const emitTri = (a: V, bb: V, c: V) => {
    const hmin = Math.min(a.h, bb.h, c.h)
    const hmax = Math.max(a.h, bb.h, c.h)
    if (hmax < 0.5) return
    if (a.m < 0 && bb.m < 0 && c.m < 0) return
    const lmin = Math.max(0, Math.floor(hmin - 0.5))
    const lmax = Math.floor(hmax - 0.5)
    const tri = [a, bb, c]
    for (let L = lmin; L <= lmax; L++) {
      let poly = tri
      if (L > lmin || hmin < L + 0.5) poly = clip(poly, (v) => v.h - (L + 0.5))
      if (L < lmax) poly = clip(poly, (v) => L + 1.5 - v.h)
      if (a.m < 0 || bb.m < 0 || c.m < 0) poly = clip(poly, (v) => v.m)
      const y = LEVEL_Y[L]
      for (let k = 1; k + 1 < poly.length; k++) {
        const p0 = poly[0]
        const p1 = poly[k]
        const p2 = poly[k + 1]
        ;(L <= LEVEL.foam ? flat : b).top([p0.x, y, p0.z], [p1.x, y, p1.z], [p2.x, y, p2.z], tcol(L, p0.x, p0.z), tcol(L, p1.x, p1.z), tcol(L, p2.x, p2.z))
      }
    }
    for (let L = Math.max(1, lmin + 1); L <= lmax; L++) {
      const t = L + 0.5 + 1e-7
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
      const lo = LEVEL_Y[L - 1]
      const hi = LEVEL_Y[L]
      const bands = wallBands(layout, L, mx, mz, hi - lo)
      if (!bands) continue
      b.wall([p.x, p.z], [q.x, q.z], lo, hi, lo, hi, [low.x - mx, low.z - mz], bands)
    }
  }

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v00 = verts[j * (N + 1) + i]
      const v10 = verts[j * (N + 1) + i + 1]
      const v01 = verts[(j + 1) * (N + 1) + i]
      const v11 = verts[(j + 1) * (N + 1) + i + 1]
      if ((i + j) % 2 === 0) {
        emitTri(v00, v10, v11)
        emitTri(v00, v11, v01)
      } else {
        emitTri(v00, v10, v01)
        emitTri(v10, v11, v01)
      }
    }
  }

  buildPathStrip(layout, b, noise)
  for (const p of layout.pillars) buildPillar(b, p)
  return { land: b.geometry(), flat: flat.geometry() }
}

function buildPathStrip(layout: IslandLayout, b: Builder, noise: (x: number, z: number) => number) {
  const path = layout.path
  const hw = PATH_HALF_WIDTH + 0.035
  const edges: { l: P2; r: P2; nl: P2; y: number }[] = []
  for (let i = 0; i < path.length; i++) {
    const p0 = path[Math.max(0, i - 2)]
    const p1 = path[Math.min(path.length - 1, i + 2)]
    const tx = p1.x - p0.x
    const tz = p1.z - p0.z
    const tl = Math.hypot(tx, tz) || 1
    const nx = -tz / tl
    const nz = tx / tl
    const p = path[i]
    edges.push({ l: [p.x + nx * hw, p.z + nz * hw], r: [p.x - nx * hw, p.z - nz * hw], nl: [nx, nz], y: p.y + 0.004 })
  }
  const pc = (x: number, z: number, sloped: boolean) => {
    const base = sloped ? PAL.ramp : PAL.path
    return base.clone().multiplyScalar(1 + 0.04 * noise(x * 3, z * 3))
  }
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i]
    const c = edges[i + 1]
    const sloped = Math.abs(c.y - a.y) > 0.003
    const ca = pc(a.l[0], a.l[1], sloped)
    b.top([a.l[0], a.y, a.l[1]], [a.r[0], a.y, a.r[1]], [c.r[0], c.y, c.r[1]], ca, ca, ca)
    b.top([a.l[0], a.y, a.l[1]], [c.r[0], c.y, c.r[1]], [c.l[0], c.y, c.l[1]], ca, ca, ca)
  }
  // round caps so the carved hole never shows past either end of the trail
  for (const e of [edges[0], edges[edges.length - 1]]) {
    const cx = (e.l[0] + e.r[0]) / 2
    const cz = (e.l[1] + e.r[1]) / 2
    const ca = pc(cx, cz, false)
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2
      const a1 = ((k + 1) / 16) * Math.PI * 2
      b.top([cx, e.y, cz], [cx + Math.cos(a0) * hw, e.y, cz + Math.sin(a0) * hw], [cx + Math.cos(a1) * hw, e.y, cz + Math.sin(a1) * hw], ca, ca, ca)
    }
  }
  // side walls where the corridor is cut into (or built out from) the terrace
  for (const sideSign of [1, -1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i]
      const c = edges[i + 1]
      const pa = sideSign > 0 ? a.l : a.r
      const pb = sideSign > 0 ? c.l : c.r
      const na: P2 = [a.nl[0] * sideSign, a.nl[1] * sideSign]
      const ta = layout.terraceY(pa[0] + na[0] * 0.06, pa[1] + na[1] * 0.06)
      const tb = layout.terraceY(pb[0] + na[0] * 0.06, pb[1] + na[1] * 0.06)
      const lo0 = Math.min(a.y, ta)
      const hi0 = Math.max(a.y, ta)
      const lo1 = Math.min(c.y, tb)
      const hi1 = Math.max(c.y, tb)
      if (hi0 - lo0 < 0.01 && hi1 - lo1 < 0.01) continue
      const cut = ta + tb > a.y + c.y
      const n: P2 = cut ? [-na[0], -na[1]] : na
      const h = Math.max(hi0 - lo0, hi1 - lo1)
      const bands: [number, Color][] = cut
        ? cliffBands(layout, layout.levelAt(pa[0] + na[0] * 0.1, pa[1] + na[1] * 0.1), pa[0], pa[1], h)
        : [[0.3, PAL.cliffBase], [0.92, PAL.cliff.clone().multiplyScalar(0.95)], [1, PAL.pathEdge]]
      b.wall(pa, pb, lo0, hi0, lo1, hi1, n, bands)
    }
  }
}

const WATER = col('#BEE8EA')
const WATER_LIGHT = col('#DDF4F5')
const WHITE = col('#FFFFFF')

/** unlit water ribbon, falls and splash foam following the layout's waterfall samples */
export function buildWaterfallGeometry(layout: IslandLayout) {
  const b = new Builder()
  const wf = layout.waterfall
  if (!wf || wf.samples.length < 2) return b.geometry()
  const [dx, dz] = wf.dir
  const px = -dz
  const pz = dx
  const hw = 0.11
  const disc = (x: number, z: number, y: number, r: number, c: Color) => {
    for (let k = 0; k < 14; k++) {
      const a0 = (k / 14) * Math.PI * 2
      const a1 = ((k + 1) / 14) * Math.PI * 2
      b.top([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], c, c, c)
    }
  }
  const s = wf.samples
  disc(s[0].x, s[0].z, s[0].y + 0.006, 0.19, WHITE)
  disc(s[0].x, s[0].z, s[0].y + 0.009, 0.15, WATER)
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i]
    const c = s[i + 1]
    if (Math.abs(a.y - c.y) < 1e-4) {
      const y = a.y + 0.007
      b.top([a.x + px * hw, y, a.z + pz * hw], [a.x - px * hw, y, a.z - pz * hw], [c.x - px * hw, y, c.z - pz * hw], WATER, WATER, WATER)
      b.top([a.x + px * hw, y, a.z + pz * hw], [c.x - px * hw, y, c.z - pz * hw], [c.x + px * hw, y, c.z + pz * hw], WATER, WATER, WATER)
      const hl = hw * 0.35
      b.top([a.x + px * hl, y + 0.001, a.z + pz * hl], [a.x - px * hl, y + 0.001, a.z - pz * hl], [c.x - px * hl, y + 0.001, c.z - pz * hl], WATER_LIGHT, WATER_LIGHT, WATER_LIGHT)
      b.top([a.x + px * hl, y + 0.001, a.z + pz * hl], [c.x - px * hl, y + 0.001, c.z - pz * hl], [c.x + px * hl, y + 0.001, c.z + pz * hl], WATER_LIGHT, WATER_LIGHT, WATER_LIGHT)
      continue
    }
    // a drop: vertical striped sheet just proud of the cliff face, splash foam at its foot
    const fx = (a.x + c.x) / 2 + dx * 0.03
    const fz = (a.z + c.z) / 2 + dz * 0.03
    const top = a.y + 0.007
    const bottom = c.y
    const cols = 6
    for (let k = 0; k < cols; k++) {
      const u0 = -hw + (2 * hw * k) / cols
      const u1 = -hw + (2 * hw * (k + 1)) / cols
      const cc = k % 2 === 0 ? WHITE : WATER_LIGHT
      b.wall([fx + px * u0, fz + pz * u0], [fx + px * u1, fz + pz * u1], bottom, top, bottom, top, [dx, dz], [[1, cc]])
    }
    disc(fx + dx * 0.1, fz + dz * 0.1, bottom + 0.008, 0.2, WHITE)
  }
  const e = s[s.length - 1]
  if (e.y > LEVEL_Y[LEVEL.beach] + 0.01) {
    disc(e.x, e.z, e.y + 0.006, 0.2, WHITE)
    disc(e.x, e.z, e.y + 0.009, 0.15, WATER)
  } else disc(e.x + dx * 0.15, e.z + dz * 0.15, -0.036, 0.3, WHITE)
  return b.geometry()
}

function buildPillar(b: Builder, p: IslandLayout['pillars'][number]) {
  const ring: P2[] = []
  for (let k = 0; k < p.sides; k++) {
    const a = (k / p.sides) * Math.PI * 2 + hash2(p.seed, k, 1) * 0.4
    const r = p.r * (0.82 + 0.3 * hash2(p.seed, k, 2))
    ring.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r])
  }
  for (let k = 0; k < p.sides; k++) {
    const a = ring[k]
    const c = ring[(k + 1) % p.sides]
    const mx = (a[0] + c[0]) / 2 - p.x
    const mz = (a[1] + c[1]) / 2 - p.z
    const v = hash2(p.seed, k, 5)
    const bands: [number, Color][] = [
      [0.3, PAL.cliffBase.clone().multiplyScalar(0.9 + 0.15 * v)],
      [0.93, PAL.cliff.clone().multiplyScalar(0.84 + 0.26 * v)],
      [1, (p.grassCap ? PAL.lip : PAL.cliffRim).clone()],
    ]
    b.wall(a, c, p.baseY - 0.02, p.topY, p.baseY - 0.02, p.topY, [mx, mz], bands)
  }
  const cap = p.grassCap ? PAL.grass.clone() : PAL.cliffRim.clone()
  for (let k = 0; k < p.sides; k++) {
    const a = ring[k]
    const c = ring[(k + 1) % p.sides]
    b.top([p.x, p.topY, p.z], [a[0], p.topY, a[1]], [c[0], p.topY, c[1]], cap, cap, cap)
  }
}
