import * as THREE from 'three'
import {
  BEVEL,
  RAMP_INNER,
  RAMP_OUTER,
  T1_LIP,
  WALL_BOTTOM,
  WALL_LEAN,
  WATER_Y,

  mulberry32,
  pointAt,
  radiusAt,
  rampHeight,
  signedDist,
  type IslandLayout,
  type PolarTier,
} from './spikeA-layout'

const TAU = Math.PI * 2

export const PALETTE = {
  grass: '#6FBF84',
  grassLight: '#86CE93',
  grassDark: '#579F6F',
  grassLow: '#78C487',
  path: '#D9C08A',
  cliff: '#A8735A',
  cliffRim: '#C08A6C',
  cliffDark: '#7E5443',
  cliffDeep: '#5A3B30',
  sand: '#EFCB8E',
  sandWet: '#E2B97F',
  foam: '#FFFFFF',
  pool: '#BEE8EA',
  wood: '#B98452',
}

const col = (hex: string) => new THREE.Color(hex)

class TriBuilder {
  pos: number[] = []
  colors: number[] = []
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, want: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    if (n.dot(want) < 0) {
      ;[b, c] = [c, b]
      ;[cb, cc] = [cc, cb]
    }
    for (const [p, k] of [
      [a, ca],
      [b, cb],
      [c, cc],
    ] as [THREE.Vector3, THREE.Color][]) {
      this.pos.push(p.x, p.y, p.z)
      this.colors.push(k.r, k.g, k.b)
    }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, k: THREE.Color, want: THREE.Vector3) {
    this.tri(a, b, c, k, k, k, want)
    this.tri(a, c, d, k, k, k, want)
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    g.computeVertexNormals()
    return g
  }
}

function noise2(seed: number) {
  const r = mulberry32(seed)
  const waves = Array.from({ length: 5 }, () => ({
    kx: (r() - 0.5) * 3.2,
    kz: (r() - 0.5) * 3.2,
    p: r() * TAU,
  }))
  return (x: number, z: number) => waves.reduce((s, w) => s + Math.sin(w.kx * x + w.kz * z + w.p), 0) / waves.length
}

function lowerSurface(layout: IslandLayout, k: number, x: number, z: number) {
  let y = WATER_Y
  const d = Math.hypot(x, z)
  if (d < radiusAt(layout.beach, Math.atan2(z, x))) y = Math.max(y, layout.beach.top)
  for (let i = 0; i < k; i++) if (signedDist(layout.tiers[i], x, z) < 0) y = Math.max(y, layout.tiers[i].top)
  return y
}

export function buildTierGeometry(layout: IslandLayout, k: number, override?: PolarTier) {
  const tier = override ?? layout.tiers[k]
  const upper = override ? undefined : layout.tiers[k + 1]
  const b = new TriBuilder()
  const n = tier.r.length
  const rand = mulberry32(layout.seed * 131 + k * 17)
  const nz = noise2(layout.seed * 3 + k)
  const up = new THREE.Vector3(0, 1, 0)
  const base = col(k === 0 ? PALETTE.grassLow : PALETTE.grass)
  const light = col(PALETTE.grassLight)
  const dark = col(PALETTE.grassDark)

  const capColor = (x: number, z: number) => {
    const v = nz(x * 1.3, z * 1.3)
    const c = base.clone()
    if (v > 0.15) c.lerp(light, Math.min(1, (v - 0.15) * 2.2))
    else if (v < -0.2) c.lerp(dark, Math.min(1, (-v - 0.2) * 1.8))
    if (upper) {
      const du = signedDist(upper, x, z)
      if (du > 0 && du < 0.5) c.lerp(dark, (1 - du / 0.5) * 0.55)
    }
    return c
  }

  const fracs = [0, 0.22, 0.42, 0.6, 0.75, 0.87, 0.95, 1]
  const ring = (f: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU
      const r = (radiusAt(tier, a) - BEVEL) * f
      return new THREE.Vector3(tier.cx + Math.cos(a) * r, tier.top, tier.cz + Math.sin(a) * r)
    })
  const rings = fracs.map(ring)
  const center = rings[0][0]
  const cCenter = capColor(center.x, center.z)
  for (let i = 0; i < n; i++) {
    const a1 = rings[1][i]
    const a2 = rings[1][(i + 1) % n]
    b.tri(center, a1, a2, cCenter, capColor(a1.x, a1.z), capColor(a2.x, a2.z), up)
  }
  for (let rI = 1; rI < rings.length - 1; rI++) {
    const A = rings[rI]
    const B = rings[rI + 1]
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      b.tri(A[i], B[i], B[i2], capColor(A[i].x, A[i].z), capColor(B[i].x, B[i].z), capColor(B[i2].x, B[i2].z), up)
      b.tri(A[i], B[i2], A[i2], capColor(A[i].x, A[i].z), capColor(B[i2].x, B[i2].z), capColor(A[i2].x, A[i2].z), up)
    }
  }

  const jit = Array.from({ length: n }, () => (rand() - 0.5) * 0.09)
  const shade = Array.from({ length: n }, () => 1 + (rand() - 0.5) * 0.26)
  const slab = Array.from({ length: n }, () => (rand() < 0.14 ? 0.05 + rand() * 0.04 : 0))
  const rowAmp = [0, 0.015, 0.045, 0.05]
  const rowJit = rowAmp.map((amp) => Array.from({ length: n }, () => (rand() - 0.5) * 2 * amp))
  const prevTop = k === 0 ? layout.beach.top : layout.tiers[k - 1].top
  const leanRate = WALL_LEAN / Math.max(0.2, tier.top - prevTop)
  const yTop = tier.top - BEVEL
  const colPoint = (i: number, y: number, row = 0) => {
    const a = (i / n) * TAU
    const s0 = row >= 2 ? Math.max(slab[i], slab[(i - 1 + n) % n]) : 0
    const r = radiusAt(tier, a) + jit[i] + leanRate * (yTop - y) + rowJit[row][i] + s0
    return new THREE.Vector3(tier.cx + Math.cos(a) * r, y, tier.cz + Math.sin(a) * r)
  }

  const rimLight = col(PALETTE.grassLight)
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    const inA = rings[rings.length - 1][i]
    const inB = rings[rings.length - 1][i2]
    const outA = colPoint(i, yTop)
    const outB = colPoint(i2, yTop)
    const a = ((i + 0.5) / n) * TAU
    const want = new THREE.Vector3(Math.cos(a), 1, Math.sin(a))
    b.quad(inA, outA, outB, inB, rimLight, want)
  }

  const rimC = col(k === 0 ? PALETTE.grassDark : PALETTE.cliffRim)
  const mainC = col(k === 0 ? PALETTE.grassDark : PALETTE.cliff)
  const darkC = col(k === 0 ? PALETTE.sandWet : PALETTE.cliffDark)
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    const a = ((i + 0.5) / n) * TAU
    const probe = pointAt(tier, a, 0.15)
    const visBottom = lowerSurface(layout, k, probe[0], probe[1])
    const yRim = yTop - (k === 0 ? 0.03 : 0.06)
    const yDark = k === 0 ? visBottom : visBottom + 0.36 * (yRim - visBottom)
    const want = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const s = shade[i]
    const band = (y0: number, y1: number, r0: number, r1: number, c: THREE.Color) => {
      if (y0 <= y1) return
      b.quad(colPoint(i, y0, r0), colPoint(i2, y0, r0), colPoint(i2, y1, r1), colPoint(i, y1, r1), c.clone().multiplyScalar(s), want)
    }
    band(yTop, yRim, 0, 1, rimC)
    band(yRim, yDark, 1, 2, mainC)
    band(yDark, WALL_BOTTOM, 2, 3, darkC)
  }
  return b.build()
}

export function buildBeachGeometry(layout: IslandLayout) {
  const beach = layout.beach
  const t1 = layout.tiers[0]
  const n = beach.r.length
  const b = new TriBuilder()
  const sand = col(PALETTE.sand)
  const wet = col(PALETTE.sandWet)
  const up = new THREE.Vector3(0, 1, 0)
  const fr = [0, 0.3, 0.6, 0.85, 1]
  const ringAt = (i: number, f: number) => {
    const a = (i / n) * TAU
    const r1 = radiusAt(t1, a) + WALL_LEAN * 0.5
    const rb = radiusAt(beach, a)
    const r = r1 + (rb - r1) * f
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    return new THREE.Vector3(x, layout.groundHeightAt(x, z), z)
  }
  const rings = fr.map((f) => Array.from({ length: n }, (_, i) => ringAt(i, f)))
  rings.unshift(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU
      const r = radiusAt(t1, a) - 0.1
      return new THREE.Vector3(Math.cos(a) * r, t1.top - T1_LIP - 0.02, Math.sin(a) * r)
    }),
  )
  rings.push(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU
      const r = radiusAt(beach, a) + 0.22
      return new THREE.Vector3(Math.cos(a) * r, WATER_Y - 0.16, Math.sin(a) * r)
    }),
  )
  const colorFor = (ri: number) => (ri >= rings.length - 2 ? wet : sand)
  for (let rI = 0; rI < rings.length - 1; rI++) {
    const A = rings[rI]
    const B = rings[rI + 1]
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      b.tri(A[i], B[i], B[i2], colorFor(rI), colorFor(rI + 1), colorFor(rI + 1), up)
      b.tri(A[i], B[i2], A[i2], colorFor(rI), colorFor(rI + 1), colorFor(rI), up)
    }
  }
  return b.build()
}

export function buildFoamGeometry(layout: IslandLayout) {
  const beach = layout.beach
  const n = beach.r.length
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const rb = radiusAt(beach, a)
    for (const r of [rb - 0.02, rb + 0.12]) pos.push(Math.cos(a) * r, WATER_Y + 0.014, Math.sin(a) * r)
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    idx.push(i * 2, i2 * 2, i * 2 + 1, i * 2 + 1, i2 * 2, i2 * 2 + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  fixUp(g)
  return g
}

export function buildHaloGeometry(layout: IslandLayout) {
  const beach = layout.beach
  const n = beach.r.length
  const pos: number[] = []
  const colors: number[] = []
  const idx: number[] = []
  const c = col('#CFF3F2')
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const rb = radiusAt(beach, a)
    for (const [r, alpha] of [
      [rb + 0.1, 0.75],
      [rb + 0.38, 0.35],
      [rb + 0.95, 0],
    ] as const) {
      pos.push(Math.cos(a) * r, WATER_Y + 0.008, Math.sin(a) * r)
      colors.push(c.r, c.g, c.b, alpha)
    }
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    for (let r = 0; r < 2; r++) idx.push(i * 3 + r, i2 * 3 + r, i * 3 + r + 1, i * 3 + r + 1, i2 * 3 + r, i2 * 3 + r + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  g.setIndex(idx)
  fixUp(g)
  return g
}

function fixUp(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position')
  const idx = g.getIndex()!
  const a = new THREE.Vector3()
  const b2 = new THREE.Vector3()
  const c = new THREE.Vector3()
  const arr = idx.array as Uint16Array | Uint32Array
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(p, arr[i])
    b2.fromBufferAttribute(p, arr[i + 1])
    c.fromBufferAttribute(p, arr[i + 2])
    const ny = (b2.x - a.x) * (c.z - a.z) - (b2.z - a.z) * (c.x - a.x)
    if (ny > 0) {
      const t = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = t
    }
  }
  g.computeVertexNormals()
}

export function buildRampGeometry(layout: IslandLayout) {
  const b = new TriBuilder()
  const top = col(PALETTE.path)
  const edge = col('#E6D2A2')
  const side = col(PALETTE.cliff)
  const sideDark = col(PALETTE.cliffDark)
  const up = new THREE.Vector3(0, 1, 0)
  const cleats: THREE.Matrix4[] = []
  for (const ramp of layout.ramps) {
    const span = Math.abs(ramp.a1 - ramp.a0)
    const sMax = 1 + ramp.landSpan / span
    const M = 48
    const at = (s: number, off: number, y: number) => {
      const a = ramp.a0 + (ramp.a1 - ramp.a0) * s
      const [x, z] = pointAt(ramp.tier, a, off)
      return new THREE.Vector3(x, y, z)
    }
    const baseY = ramp.hLow - 0.04
    for (let i = 0; i < M; i++) {
      const s0 = (i / M) * sMax
      const s1 = ((i + 1) / M) * sMax
      const y0 = rampHeight(ramp, s0)
      const y1 = rampHeight(ramp, s1)
      const kerb = RAMP_OUTER - 0.05
      b.quad(at(s0, RAMP_INNER, y0), at(s0, kerb, y0), at(s1, kerb, y1), at(s1, RAMP_INNER, y1), top, up)
      b.quad(at(s0, kerb, y0), at(s0, RAMP_OUTER, y0 - 0.02), at(s1, RAMP_OUTER, y1 - 0.02), at(s1, kerb, y1), edge, up)
      const am = ramp.a0 + (ramp.a1 - ramp.a0) * ((s0 + s1) / 2)
      const out = new THREE.Vector3(Math.cos(am), 0, Math.sin(am))
      const oTop0 = at(s0, RAMP_OUTER, y0 - 0.02)
      const oTop1 = at(s1, RAMP_OUTER, y1 - 0.02)
      const midY0 = baseY + (y0 - 0.02 - baseY) * 0.4
      const midY1 = baseY + (y1 - 0.02 - baseY) * 0.4
      if (y0 - 0.02 > baseY + 0.01) {
        b.quad(oTop0, oTop1, at(s1, RAMP_OUTER + 0.02, midY1), at(s0, RAMP_OUTER + 0.02, midY0), side, out)
        b.quad(at(s0, RAMP_OUTER + 0.02, midY0), at(s1, RAMP_OUTER + 0.02, midY1), at(s1, RAMP_OUTER + 0.04, baseY), at(s0, RAMP_OUTER + 0.04, baseY), sideDark, out)
      }
    }
    const aEnd = ramp.a0 + (ramp.a1 - ramp.a0) * sMax
    const endDir = new THREE.Vector3(-Math.sin(aEnd), 0, Math.cos(aEnd)).multiplyScalar(Math.sign(ramp.a1 - ramp.a0))
    const yE = rampHeight(ramp, sMax)
    b.quad(at(sMax, RAMP_INNER, yE), at(sMax, RAMP_OUTER, yE - 0.02), at(sMax, RAMP_OUTER + 0.04, baseY), at(sMax, RAMP_INNER, baseY), side, endDir)

    const tierAt = (s: number) => {
      const a = ramp.a0 + (ramp.a1 - ramp.a0) * s
      return a
    }
    let acc = 0
    let prev = at(0, TRAIL_MID, 0)
    prev.y = 0
    for (let i = 1; i <= 400; i++) {
      const s = i / 400
      const p = at(s, TRAIL_MID, 0)
      acc += Math.hypot(p.x - prev.x, p.z - prev.z)
      prev = p
      if (acc >= 0.15 && s < 0.97) {
        acc = 0
        const a = tierAt(s)
        const y = rampHeight(ramp, s)
        const m = new THREE.Matrix4()
        const mid = at(s, (RAMP_INNER + 0.1 + RAMP_OUTER - 0.05) / 2, y + 0.012)
        m.compose(mid, new THREE.Quaternion().setFromAxisAngle(up, -a), new THREE.Vector3(RAMP_OUTER - 0.1, 1, 1))
        cleats.push(m)
      }
    }
  }
  return { geometry: b.build(), cleats }
}

const TRAIL_MID = (RAMP_INNER + RAMP_OUTER) / 2

export function buildPillarGeometry(layout: IslandLayout) {
  const b = new TriBuilder()
  const rand = mulberry32(layout.seed * 977)
  const up = new THREE.Vector3(0, 1, 0)
  const addPrism = (
    x: number,
    z: number,
    y0: number,
    y1: number,
    radius: number,
    sides: number,
    rot: number,
    capColor: THREE.Color,
    bands: [number, THREE.Color][],
    taper = 0.85,
  ) => {
    const radii = Array.from({ length: sides }, () => radius * (0.85 + rand() * 0.3))
    const pt = (i: number, y: number) => {
      const a = rot + (i / sides) * TAU
      const f = 1 - (1 - taper) * ((y - y0) / Math.max(0.01, y1 - y0))
      return new THREE.Vector3(x + Math.cos(a) * radii[i % sides] * f, y, z + Math.sin(a) * radii[i % sides] * f)
    }
    const c = new THREE.Vector3(x, y1, z)
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides
      b.tri(c, pt(i, y1), pt(i2, y1), capColor, capColor, capColor, up)
      const a = rot + ((i + 0.5) / sides) * TAU
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      const s = 1 + (rand() - 0.5) * 0.2
      let yPrev = y1
      for (const [frac, cc] of bands) {
        const yB = y0 + (y1 - y0) * frac
        b.quad(pt(i, yPrev), pt(i2, yPrev), pt(i2, yB), pt(i, yB), cc.clone().multiplyScalar(s), out)
        yPrev = yB
      }
    }
  }
  const rim = col(PALETTE.cliffRim)
  const main = col('#9C6A52')
  const dark = col(PALETTE.cliffDark)
  const grass = col(PALETTE.grass)
  const capRock = col('#B8836A')
  for (const p of layout.pillars) {
    if (p.boulder) {
      addPrism(p.x, p.z, p.base - 0.05, p.base + p.height, p.radius, p.sides, p.rot, capRock, [
        [0.55, main],
        [0, dark],
      ], 0.7)
      continue
    }
    addPrism(p.x, p.z, p.base - 0.1, p.base + p.height, p.radius, p.sides, p.rot, p.grassCap ? grass : capRock, [
      [0.92, p.grassCap ? grass : rim],
      [0.35, main],
      [0, dark],
    ])
  }
  for (const r of layout.waterRocks) {
    addPrism(r.x, r.z, WATER_Y - 0.2, WATER_Y + r.height, r.radius, 6, r.rot, capRock, [
      [0.75, main],
      [0, dark],
    ], 0.8)
  }
  return b.build()
}

export function buildRockFoamGeometry(layout: IslandLayout) {

  const pos: number[] = []
  const idx: number[] = []
  let base = 0
  const addRing = (x: number, z: number, r0: number, r1: number) => {
    const n = 18
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      pos.push(x + Math.cos(a) * r0, WATER_Y + 0.014, z + Math.sin(a) * r0)
      pos.push(x + Math.cos(a) * r1, WATER_Y + 0.014, z + Math.sin(a) * r1)
    }
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      idx.push(base + i * 2, base + i2 * 2, base + i * 2 + 1, base + i * 2 + 1, base + i2 * 2, base + i2 * 2 + 1)
    }
    base += n * 2
  }
  for (const r of layout.waterRocks) addRing(r.x, r.z, r.radius * 0.8, r.radius * 1.35 + 0.05)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  if (idx.length) fixUp(g)
  return g
}

export function buildWaterfallGeometry(layout: IslandLayout) {
  const wf = layout.waterfall
  if (!wf) return null
  const b = new TriBuilder()
  const tier: PolarTier = wf.tier
  const white = col('#FFFFFF')
  const blue = col(PALETTE.pool)
  const lanes = 5
  const r0 = radiusAt(tier, wf.angle)
  const halfA = wf.width / 2 / r0
  const t1 = layout.tiers[0]
  const prevTop = t1.top
  const leanRate = WALL_LEAN / Math.max(0.2, tier.top - prevTop)
  const yTop = tier.top - BEVEL
  const out = new THREE.Vector3(Math.cos(wf.angle), 0, Math.sin(wf.angle))
  const up = new THREE.Vector3(0, 1, 0)
  const wall = (a: number, y: number, extra: number) => {
    const r = radiusAt(tier, a) + 0.07 + leanRate * (yTop - y) + extra
    return new THREE.Vector3(tier.cx + Math.cos(a) * r, y, tier.cz + Math.sin(a) * r)
  }
  const rows = [yTop + 0.01, yTop - 0.25, wf.bottom + 0.35, wf.bottom + 0.02]
  for (let l = 0; l < lanes; l++) {
    const aA = wf.angle - halfA + (2 * halfA * l) / lanes
    const aB = wf.angle - halfA + (2 * halfA * (l + 1)) / lanes
    const c = l % 2 === 0 ? white : blue
    for (let r = 0; r < rows.length - 1; r++) {
      const e0 = r === 0 ? 0.0 : 0.02 * r
      const e1 = 0.02 * (r + 1)
      b.quad(wall(aA, rows[r], e0), wall(aB, rows[r], e0), wall(aB, rows[r + 1], e1), wall(aA, rows[r + 1], e1), c, out)
    }
  }
  // stream across the cap feeding the fall
  for (let l = 0; l < lanes; l++) {
    const aA = wf.angle - halfA + (2 * halfA * l) / lanes
    const aB = wf.angle - halfA + (2 * halfA * (l + 1)) / lanes
    const c = l % 2 === 0 ? blue : white
    const inner = (a: number) => {
      const [x, z] = pointAt(tier, a, -0.45)
      return new THREE.Vector3(x, tier.top + 0.006, z)
    }
    const rim = (a: number) => {
      const [x, z] = pointAt(tier, a, -BEVEL)
      return new THREE.Vector3(x, tier.top + 0.006, z)
    }
    b.quad(inner(aA), inner(aB), rim(aB), rim(aA), c, up)
    b.quad(rim(aA), rim(aB), wall(aB, yTop + 0.01, 0), wall(aA, yTop + 0.01, 0), c, new THREE.Vector3(out.x, 1, out.z))
  }
  // splash pool on the ledge below, clamped to the ledge
  const [bx, bz] = pointAt(tier, wf.angle, 0.28)
  const ledge = -signedDist(t1, bx, bz)
  const poolR = Math.max(0.12, Math.min(0.3, ledge - 0.05))
  const py = wf.bottom + 0.008
  const center = new THREE.Vector3(bx, py, bz)
  const n = 20
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU
    const a1 = ((i + 1) / n) * TAU
    const p0 = new THREE.Vector3(bx + Math.cos(a0) * poolR, py, bz + Math.sin(a0) * poolR)
    const p1 = new THREE.Vector3(bx + Math.cos(a1) * poolR, py, bz + Math.sin(a1) * poolR)
    b.tri(center, p0, p1, blue, blue, blue, up)
    const q0 = new THREE.Vector3(bx + Math.cos(a0) * (poolR + 0.05), py + 0.004, bz + Math.sin(a0) * (poolR + 0.05))
    const q1 = new THREE.Vector3(bx + Math.cos(a1) * (poolR + 0.05), py + 0.004, bz + Math.sin(a1) * (poolR + 0.05))
    b.quad(p0, q0, q1, p1, white, up)
  }

  return b.build()
}


export function buildCliffDecorGeometry(layout: IslandLayout) {
  const b = new TriBuilder()
  const vineC = col('#3F7A55')
  const leafC = col('#7BC98C')
  const caveC = col('#4A3128')
  const caveRim = col(PALETTE.cliffDark)
  const wallPoint = (k: number, a: number, y: number, extra: number) => {
    const tier = layout.tiers[k]
    const prevTop = k === 0 ? layout.beach.top : layout.tiers[k - 1].top
    const leanRate = WALL_LEAN / Math.max(0.2, tier.top - prevTop)
    const r = radiusAt(tier, a) + 0.04 + leanRate * (tier.top - BEVEL - y) + extra
    return new THREE.Vector3(tier.cx + Math.cos(a) * r, y, tier.cz + Math.sin(a) * r)
  }
  for (const v of layout.vines) {
    const tier = layout.tiers[v.tier]
    const r0 = radiusAt(tier, v.angle)
    const halfW = 0.014 / r0
    const out = new THREE.Vector3(Math.cos(v.angle), 0, Math.sin(v.angle))
    const segs = 8
    const yTop = tier.top - BEVEL + 0.02
    for (let i = 0; i < segs; i++) {
      const y0 = yTop - (v.length * i) / segs
      const y1 = yTop - (v.length * (i + 1)) / segs
      const sw0 = Math.sin(i * 1.3) * 0.012
      const sw1 = Math.sin((i + 1) * 1.3) * 0.012
      b.quad(wallPoint(v.tier, v.angle - halfW + sw0, y0, 0), wallPoint(v.tier, v.angle + halfW + sw0, y0, 0), wallPoint(v.tier, v.angle + halfW + sw1, y1, 0), wallPoint(v.tier, v.angle - halfW + sw1, y1, 0), vineC, out)
      if (i % 2 === 1) {
        const side = i % 4 === 1 ? 1 : -1
        const ly = (y0 + y1) / 2
        const la = v.angle + sw0 + side * (0.05 / r0)
        const c0 = wallPoint(v.tier, v.angle + sw0, ly, 0.004)
        const tip = wallPoint(v.tier, la, ly - 0.02, 0.004)
        const up = wallPoint(v.tier, (v.angle + sw0 + la) / 2, ly + 0.035, 0.004)
        const dn = wallPoint(v.tier, (v.angle + sw0 + la) / 2, ly - 0.05, 0.004)
        b.tri(c0, up, tip, leafC, leafC, leafC, out)
        b.tri(c0, tip, dn, leafC, leafC, leafC, out)
      }
    }
  }
  for (const c of layout.caves) {
    const tier = layout.tiers[c.tier]
    const base = layout.tiers[c.tier - 1].top
    const r0 = radiusAt(tier, c.angle)
    const halfA = c.width / 2 / r0
    const out = new THREE.Vector3(Math.cos(c.angle), 0, Math.sin(c.angle))
    const n = 12
    const center = wallPoint(c.tier, c.angle, base + 0.01, 0.012)
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI
      const t1 = ((i + 1) / n) * Math.PI
      const p = (t: number, grow: number) =>
        wallPoint(c.tier, c.angle - Math.cos(t) * halfA * grow, base + 0.01 + Math.sin(t) * c.height * grow, 0.012)
      b.tri(center, p(t0, 1), p(t1, 1), caveC, caveC, caveC, out)
      b.quad(p(t0, 1), p(t0, 1.22), p(t1, 1.22), p(t1, 1), caveRim, out)
    }
  }
  return b.build()
}
