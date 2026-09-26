// Spike B: one seeded grid layout drives terrain tiles, props AND the trail waypoints.
// Pure data, no three.js, so terrain and trail cannot drift apart.

export const CELL = 0.5
export const GRID = 18
export const WATER_Y = -0.05
export const BLOCK_BOTTOM = -0.25
export const SAND_TOP = 0.05
export const TIER_TOP = [0.13, 1.12, 2.12] as const

export type Dir = readonly [number, number]
export const DIRS4: Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export interface Ramp {
  tier: number // rises from tier-1 to tier
  width: number
  origin: [number, number]
  d: Dir
  p: Dir
  cells: [number, number][]
  low: [number, number, number]
  high: [number, number, number]
  center: [number, number]
}

export interface Facade {
  i: number
  j: number
  d: Dir // from this (lower) cell toward the higher cell
  yBottom: number
  yTop: number
  upperLevel: number
  kind: 'plain' | 'cave' | 'waterfall'
}

export interface Corner {
  i: number
  j: number
  toward: Dir // diagonal direction toward the higher cell
  yBottom: number
  yTop: number
}

export interface Diag {
  i: number
  j: number
  a: Dir
  b: Dir
  lower: number
  upper: number
}

export interface PropSlot {
  kind: string
  x: number
  y: number
  z: number
  rot: number
  scale: number
}

export interface IslandLayoutB {
  level: number[][] // -1 water, 0..2 tier (ramp cells hold the lower tier)
  rampAt: number[][] // -1 or ramp index
  ramps: Ramp[]
  facades: Facade[]
  corners: Corner[]
  diags: Diag[]
  sandDiscs: { x: number; z: number; r: number }[]
  lawnDiscs: { x: number; z: number; r: number }[]
  trail: [number, number, number][] // ground-surface waypoints, beach -> summit
  trailCells: Set<number>
  props: PropSlot[]
  waterfall: { pool: [number, number, number]; top: [number, number, number]; d: Dir } | null
  front: [number, number]
  rotation: number // island yaw; layout coords are pre-rotation
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(i: number, j: number, s: number) {
  let h = Math.imul(i * 374761393 + j * 668265263 + s * 2147483647, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function valueNoise(x: number, z: number, s: number) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash2(xi, zi, s)
  const b = hash2(xi + 1, zi, s)
  const c = hash2(xi, zi + 1, s)
  const d = hash2(xi + 1, zi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export const cellX = (i: number) => (i - (GRID - 1) / 2) * CELL
export const cellZ = (j: number) => (j - (GRID - 1) / 2) * CELL
export const key = (i: number, j: number) => i * GRID + j
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < GRID && j < GRID

interface Lobe {
  x: number
  z: number
  r: number
}

function lobeField(x: number, z: number, lobes: Lobe[]) {
  let best = -Infinity
  for (const l of lobes) best = Math.max(best, 1 - Math.hypot(x - l.x, z - l.z) / l.r)
  return best
}

function makeGrid<T>(v: T): T[][] {
  return Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => v))
}

function cleanMask(mask: boolean[][]) {
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) {
        let n = 0
        for (const [di, dj] of DIRS4) if (inGrid(i + di, j + dj) && mask[i + di][j + dj]) n++
        if (mask[i][j] && n <= 1) mask[i][j] = false
        else if (!mask[i][j] && n >= 3) mask[i][j] = true
      }
  }
  // keep the largest connected component
  const seen = makeGrid(false)
  let best: [number, number][] = []
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      if (!mask[i][j] || seen[i][j]) continue
      const comp: [number, number][] = []
      const stack: [number, number][] = [[i, j]]
      seen[i][j] = true
      while (stack.length) {
        const [a, b] = stack.pop()!
        comp.push([a, b])
        for (const [di, dj] of DIRS4) {
          const c = a + di
          const e = b + dj
          if (inGrid(c, e) && mask[c][e] && !seen[c][e]) {
            seen[c][e] = true
            stack.push([c, e])
          }
        }
      }
      if (comp.length > best.length) best = comp
    }
  const out = makeGrid(false)
  for (const [a, b] of best) out[a][b] = true
  return out
}

function tierMask(lobes: Lobe[], parent: boolean[][] | null, erode: number, seed: number, noiseAmp: number) {
  const mask = makeGrid(false)
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const x = cellX(i)
      const z = cellZ(j)
      const f = lobeField(x, z, lobes) + (valueNoise(x * 1.2, z * 1.2, seed) - 0.5) * noiseAmp + (valueNoise(x * 2.6, z * 2.6, seed + 99) - 0.5) * noiseAmp * 0.4
      if (f <= 0 || Math.hypot(x, z) > 3.25) continue
      if (parent) {
        let ok = parent[i][j]
        for (let di = -erode; di <= erode && ok; di++)
          for (let dj = -erode; dj <= erode && ok; dj++) {
            if (Math.abs(di) + Math.abs(dj) > erode) continue
            if (!inGrid(i + di, j + dj) || !parent[i + di][j + dj]) ok = false
          }
        if (!ok) continue
      }
      mask[i][j] = true
    }
  return cleanMask(mask)
}

function rot(v: [number, number], a: number): [number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

export function buildLayoutB(seed: number): IslandLayoutB {
  const rand = mulberry32(seed * 7919 + 17)
  const rotation = 0.42 + rand() * 0.3
  const front = rot([0.633, 0.774], rotation) // toward the hero camera, in layout space
  const back = rot([-front[0], -front[1]], (rand() - 0.5) * 0.9)
  const side: [number, number] = [-back[1], back[0]]

  const lat1 = (rand() - 0.5) * 0.9
  const t1Lobes: Lobe[] = [{ x: front[0] * 0.45 + side[0] * lat1, z: front[1] * 0.45 + side[1] * lat1, r: 2.75 + rand() * 0.2 }]
  const extra = 3 + Math.floor(rand() * 2)
  for (let k = 0; k < extra; k++) {
    const a = rand() * Math.PI * 2
    const dist = 1.5 + rand() * 0.5
    t1Lobes.push({ x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: 1.05 + rand() * 0.45 })
  }
  const lat2 = (rand() - 0.5) * 1.1
  const t2Lobes: Lobe[] = [
    { x: back[0] * 0.6 + side[0] * lat2, z: back[1] * 0.6 + side[1] * lat2, r: 1.95 + rand() * 0.15 },
  ]
  for (let k = 0; k < 2; k++) {
    const a = rand() * Math.PI * 2
    t2Lobes.push({ x: t2Lobes[0].x + Math.cos(a) * 0.75, z: t2Lobes[0].z + Math.sin(a) * 0.75, r: 0.85 + rand() * 0.3 })
  }
  const lat3 = (rand() - 0.5) * 0.9
  const t3Lobes: Lobe[] = [
    { x: back[0] * 1.2 + side[0] * lat3, z: back[1] * 1.2 + side[1] * lat3, r: 1.2 + rand() * 0.1 },
  ]
  {
    const a = rand() * Math.PI * 2
    t3Lobes.push({ x: t3Lobes[0].x + Math.cos(a) * 0.5, z: t3Lobes[0].z + Math.sin(a) * 0.5, r: 0.65 + rand() * 0.15 })
  }

  const m1 = tierMask(t1Lobes, null, 0, seed * 3 + 1, 0.4)
  const m2 = tierMask(t2Lobes, m1, 0, seed * 3 + 2, 0.36)
  const m3 = tierMask(t3Lobes, m2, 0, seed * 3 + 3, 0.22)

  const level = makeGrid(-1)
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) level[i][j] = m3[i][j] ? 2 : m2[i][j] ? 1 : m1[i][j] ? 0 : -1
  const lv = (i: number, j: number) => (inGrid(i, j) ? level[i][j] : -1)

  const lawnRadius = (x: number, z: number) => 0.36 + valueNoise(x * 1.7 + 3, z * 1.7, seed + 7) * 0.16
  const rampAt = makeGrid(-1)
  const ramps: Ramp[] = []

  const rampPref = rand() * Math.PI * 2
  const placeRamp = (tier: number, avoidNear: [number, number] | null): boolean => {
    let bestScore = -Infinity
    let best: Ramp | null = null
    for (const w of [1, 2])
      for (let oi = 0; oi < GRID; oi++)
        for (let oj = 0; oj < GRID; oj++)
          for (const d of DIRS4) {
            const p: Dir = [-d[1], d[0]]
            const cells: [number, number][] = []
            let ok = true
            let notch = 0
            for (let a = 0; a < 3 && ok; a++)
              for (let b = 0; b < w && ok; b++) {
                const ci = oi + a * d[0] + b * p[0]
                const cj = oj + a * d[1] + b * p[1]
                const l = lv(ci, cj)
                if (l !== tier && l !== tier - 1) ok = false
                else if (rampAt[ci]?.[cj] !== -1) ok = false
                else {
                  if (l === tier) notch++
                  cells.push([ci, cj])
                }
              }
            if (!ok) continue
            for (let b = 0; b < w && ok; b++) {
              const fi = oi - d[0] + b * p[0]
              const fj = oj - d[1] + b * p[1]
              if (lv(fi, fj) !== tier - 1 || rampAt[fi]?.[fj] !== -1) ok = false
              const li = oi + 3 * d[0] + b * p[0]
              const lj = oj + 3 * d[1] + b * p[1]
              if (lv(li, lj) !== tier || rampAt[li]?.[lj] !== -1) ok = false
            }
            if (!ok) continue
            // a protruding ramp must lean on the cliff along its whole length
            let wall = 0
            for (let a = 0; a < 3; a++)
              for (const b of [-1, w]) {
                const ci = oi + a * d[0] + b * p[0]
                const cj = oj + a * d[1] + b * p[1]
                if (lv(ci, cj) >= tier && rampAt[ci]?.[cj] === -1) wall++
              }
            if (notch === 0 && wall < 3) continue
            const half = (w - 1) / 2
            const cx = cellX(oi + d[0] + half * p[0])
            const cz = cellZ(oj + d[1] + half * p[1])
            const facing = -(d[0] * front[0] + d[1] * front[1])
            if (facing < -0.25) continue
            let score = facing * 0.6 + wall * 0.45 - notch * 0.4 + (w === 1 ? 0.5 : 0)
            score += hash2(oi * 4 + w, oj * 4 + DIRS4.indexOf(d), seed * 13 + tier) * 1.6
            score += (cx * front[0] + cz * front[1]) * 0.3
            score += Math.cos(Math.atan2(cz, cx) - rampPref - tier * 2.1) * 0.8
            if (avoidNear) {
              const dd = Math.hypot(cx - avoidNear[0], cz - avoidNear[1])
              score += Math.min(dd, 2.4) * 1.1
            }
            if (score > bestScore) {
              bestScore = score
              best = {
                tier,
                width: w,
                origin: [oi, oj],
                d,
                p,
                cells,
                low: [cellX(oi + half * p[0] - 0.5 * d[0]), TIER_TOP[tier - 1], cellZ(oj + half * p[1] - 0.5 * d[1])],
                high: [cellX(oi + half * p[0] + 2.5 * d[0]), TIER_TOP[tier], cellZ(oj + half * p[1] + 2.5 * d[1])],
                center: [cx, cz],
              }
            }
          }
    if (!best) return false
    for (const [ci, cj] of best.cells) {
      rampAt[ci][cj] = ramps.length
      level[ci][cj] = tier - 1
    }
    ramps.push(best)
    return true
  }

  placeRamp(1, null)
  placeRamp(2, ramps[0] ? [ramps[0].high[0], ramps[0].high[2]] : null)

  // A* over one tier's walkable cells
  const walkable = (i: number, j: number, tier: number) => lv(i, j) === tier && rampAt[i][j] === -1
  const edgeCost = (i: number, j: number) => {
    let c = 0
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue
        const l = lv(i + di, j + dj)
        if (l < level[i][j]) c = Math.max(c, 3)
        else if (l > level[i][j]) c = Math.max(c, 1.4)
      }
    return c
  }
  const astar = (tier: number, from: [number, number], to: [number, number]): [number, number][] => {
    const dist = new Map<number, number>()
    const prev = new Map<number, number>()
    const open: [number, number, number][] = [[0, from[0], from[1]]]
    dist.set(key(from[0], from[1]), 0)
    while (open.length) {
      open.sort((a, b) => a[0] - b[0])
      const [, i, j] = open.shift()!
      if (i === to[0] && j === to[1]) break
      const g = dist.get(key(i, j))!
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue
          const ni = i + di
          const nj = j + dj
          const isGoal = ni === to[0] && nj === to[1]
          if (!isGoal && !walkable(ni, nj, tier)) continue
          if (di && dj && (!walkable(i + di, j, tier) || !walkable(i, j + dj, tier))) continue
          const ng = g + Math.hypot(di, dj) + edgeCost(ni, nj)
          const k = key(ni, nj)
          if (ng < (dist.get(k) ?? Infinity)) {
            dist.set(k, ng)
            prev.set(k, key(i, j))
            open.push([ng + Math.hypot(to[0] - ni, to[1] - nj), ni, nj])
          }
        }
    }
    const path: [number, number][] = []
    let k: number | undefined = key(to[0], to[1])
    if (!prev.has(k) && !(from[0] === to[0] && from[1] === to[1])) return [from, to]
    while (k !== undefined) {
      path.unshift([Math.floor(k / GRID), k % GRID])
      if (k === key(from[0], from[1])) break
      k = prev.get(k)
    }
    return path
  }

  const chaikin = (pts: [number, number][], iters: number) => {
    let p = pts
    for (let it = 0; it < iters; it++) {
      if (p.length < 3) return p
      const out: [number, number][] = [p[0]]
      for (let k = 0; k < p.length - 1; k++) {
        const a = p[k]
        const b = p[k + 1]
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
      }
      out.push(p[p.length - 1])
      p = out
    }
    return p
  }

  // trail start: frontmost beach cell
  let startCell: [number, number] = [0, 0]
  let bestFront = -Infinity
  const startBias = (rand() - 0.5) * 0.6
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      if (!walkable(i, j, 0)) continue
      const waterN = DIRS4.filter(([di, dj]) => lv(i + di, j + dj) === -1).length
      if (!waterN) continue
      const x = cellX(i)
      const z = cellZ(j)
      const s = x * front[0] + z * front[1] + (x * -front[1] + z * front[0]) * startBias
      if (s > bestFront) {
        bestFront = s
        startCell = [i, j]
      }
    }
  let nx = 0
  let nz = 0
  for (const [di, dj] of DIRS4)
    if (lv(startCell[0] + di, startCell[1] + dj) === -1) {
      nx += di
      nz += dj
    }
  const nl = Math.hypot(nx, nz) || 1
  nx /= nl
  nz /= nl

  const trailCells = new Set<number>()
  const trail: [number, number, number][] = []
  const pushFlat = (cells: [number, number][], y: number, head?: [number, number], tail?: [number, number]) => {
    for (const [i, j] of cells) trailCells.add(key(i, j))
    let pts = cells.map(([i, j]) => [cellX(i), cellZ(j)] as [number, number])
    if (head) pts[0] = head
    if (tail) pts[pts.length - 1] = tail
    pts = chaikin(pts, 3)
    for (const [x, z] of pts) trail.push([x, y, z])
  }

  const sx = cellX(startCell[0])
  const sz = cellZ(startCell[1])
  const startR = lawnRadius(sx, sz)
  trail.push([sx + nx * (startR + 0.42), SAND_TOP, sz + nz * (startR + 0.42)])
  trail.push([sx + nx * (startR + 0.1), SAND_TOP + 0.03, sz + nz * (startR + 0.1)])
  trail.push([sx + nx * (startR - 0.04), TIER_TOP[0], sz + nz * (startR - 0.04)])

  const footCell = (r: Ramp): [number, number] => [r.origin[0] - r.d[0], r.origin[1] - r.d[1]]
  const landCell = (r: Ramp): [number, number] => [r.origin[0] + 3 * r.d[0], r.origin[1] + 3 * r.d[1]]
  const footPt = (r: Ramp): [number, number] => [r.low[0] - r.d[0] * CELL * 0.6, r.low[2] - r.d[1] * CELL * 0.6]
  const landPt = (r: Ramp): [number, number] => [r.high[0] + r.d[0] * CELL * 0.6, r.high[2] + r.d[1] * CELL * 0.6]

  const r1 = ramps[0]
  const r2 = ramps[1]
  let summitCell: [number, number] = startCell
  if (r1) {
    pushFlat(astar(0, startCell, footCell(r1)), TIER_TOP[0], [sx + nx * (startR - 0.2), sz + nz * (startR - 0.2)], footPt(r1))
    trail.push(r1.low)
    trail.push(r1.high)
    for (const c of r1.cells) trailCells.add(key(c[0], c[1]))
    if (r2) {
      pushFlat(astar(1, landCell(r1), footCell(r2)), TIER_TOP[1], landPt(r1), footPt(r2))
      trail.push(r2.low)
      trail.push(r2.high)
      for (const c of r2.cells) trailCells.add(key(c[0], c[1]))
      // summit: the T3 cell farthest from any edge
      let bestD = -Infinity
      for (let i = 0; i < GRID; i++)
        for (let j = 0; j < GRID; j++) {
          if (!walkable(i, j, 2)) continue
          let dmin = Infinity
          for (let a = 0; a < GRID; a++)
            for (let b = 0; b < GRID; b++)
              if (lv(a, b) < 2 || rampAt[a][b] !== -1) dmin = Math.min(dmin, Math.hypot(a - i, b - j))
          const lc = landCell(r2)
          const score = dmin + Math.min(Math.hypot(lc[0] - i, lc[1] - j), 3) * 0.4
          if (score > bestD) {
            bestD = score
            summitCell = [i, j]
          }
        }
      pushFlat(astar(2, landCell(r2), summitCell), TIER_TOP[2], landPt(r2))
    }
  }

  // 45-degree chamfers on convex corners break up the square silhouette
  const diags: Diag[] = []
  const diagAt = new Map<number, Diag>()
  const noRamp = (i: number, j: number) => !inGrid(i, j) || rampAt[i][j] === -1
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const u = level[i][j]
      if (u < 1 || rampAt[i][j] !== -1 || trailCells.has(key(i, j))) continue
      search: for (const a of [[1, 0], [-1, 0]] as Dir[])
        for (const b of [[0, 1], [0, -1]] as Dir[]) {
          const la = lv(i + a[0], j + a[1])
          const lb = lv(i + b[0], j + b[1])
          if (la !== lb || la >= u) continue
          if (lv(i + a[0] + b[0], j + a[1] + b[1]) > la) continue
          if (lv(i - a[0], j - a[1]) < u || lv(i - b[0], j - b[1]) < u) continue
          if (!noRamp(i + a[0], j + a[1]) || !noRamp(i + b[0], j + b[1])) continue
          if (!noRamp(i - a[0], j - a[1]) || !noRamp(i - b[0], j - b[1])) continue
          const dg = { i, j, a, b, lower: la, upper: u }
          diags.push(dg)
          diagAt.set(key(i, j), dg)
          break search
        }
    }

  // facades & corners
  const facades: Facade[] = []
  const corners: Corner[] = []
  const topOf = (l: number) => (l < 0 ? BLOCK_BOTTOM : TIER_TOP[l])
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const l = level[i][j]
      for (const d of DIRS4) {
        const ui = i + d[0]
        const uj = j + d[1]
        const ul = lv(ui, uj)
        if (ul < 1 || ul <= l) continue
        const ra = inGrid(i, j) ? rampAt[i][j] : -1
        if (ra !== -1 && ramps[ra].d[0] === d[0] && ramps[ra].d[1] === d[1]) continue
        const dg = diagAt.get(key(ui, uj))
        if (dg && ((dg.a[0] === -d[0] && dg.a[1] === -d[1]) || (dg.b[0] === -d[0] && dg.b[1] === -d[1]))) continue
        facades.push({ i, j, d, yBottom: topOf(l), yTop: TIER_TOP[ul], upperLevel: ul, kind: 'plain' })
      }
      for (const a of [[1, 0], [-1, 0]] as Dir[])
        for (const b of [[0, 1], [0, -1]] as Dir[]) {
          const ui = i - a[0] - b[0]
          const uj = j - a[1] - b[1]
          const ul = lv(ui, uj)
          if (ul < 1) continue
          const la = lv(ui + a[0], uj + a[1])
          const lb = lv(ui + b[0], uj + b[1])
          if (la >= ul || lb >= ul || l >= ul) continue
          if (rampAt[i][j] !== -1 || diagAt.has(key(ui, uj))) continue
          if (inGrid(ui + a[0], uj + a[1]) && rampAt[ui + a[0]][uj + a[1]] !== -1) continue
          if (inGrid(ui + b[0], uj + b[1]) && rampAt[ui + b[0]][uj + b[1]] !== -1) continue
          corners.push({ i, j, toward: [-a[0] - b[0], -a[1] - b[1]], yBottom: topOf(Math.min(l, la, lb)), yTop: TIER_TOP[ul] })
        }
    }

  // hero details: a cave and a waterfall on camera-facing cliffs away from the trail
  const nearTrail = (i: number, j: number, r: number) => {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (trailCells.has(key(i + a, j + b))) return true
    return false
  }
  const facing = (f: Facade) => -(f.d[0] * front[0] + f.d[1] * front[1])
  const pick = (pred: (f: Facade) => boolean, salt: number) => {
    let best: Facade | null = null
    let bs = -Infinity
    for (const f of facades) {
      if (f.kind !== 'plain' || !pred(f)) continue
      const s = facing(f) + hash2(f.i, f.j, seed * 31 + salt) * 0.8
      if (s > bs) {
        bs = s
        best = f
      }
    }
    return best
  }
  const cave = pick((f) => f.upperLevel === 2 && f.yBottom === TIER_TOP[1] && !nearTrail(f.i, f.j, 0) && facing(f) > 0.3, 1)
  if (cave) cave.kind = 'cave'
  const fall = pick(
    (f) => f.upperLevel >= 1 && f.yBottom >= 0 && !nearTrail(f.i, f.j, 0) && !trailCells.has(key(f.i + f.d[0], f.j + f.d[1])) && facing(f) > 0.3 && (!cave || Math.hypot(cave.i - f.i, cave.j - f.j) > 3),
    2,
  )
  if (fall) fall.kind = 'waterfall'

  // beach: sand discs around every T1-boundary cell
  const sandDiscs: { x: number; z: number; r: number }[] = []
  const lawnDiscs: { x: number; z: number; r: number }[] = []
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      if (lv(i, j) < 0) continue
      let waterN = false
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (lv(i + di, j + dj) === -1) waterN = true
      if (!waterN) continue
      const x = cellX(i)
      const z = cellZ(j)
      const facingFront = x * front[0] + z * front[1]
      const lr = level[i][j] === 0 ? lawnRadius(x, z) : 0.3
      if (level[i][j] === 0) lawnDiscs.push({ x, z, r: lr })
      const r = lr + 0.16 + valueNoise(x * 1.3 + 7, z * 1.3, seed) * 0.3 + Math.max(0, facingFront) * 0.05
      sandDiscs.push({ x, z, r })
    }

  // props
  const props: PropSlot[] = []
  const occupied = new Set<number>()
  let waterfall: IslandLayoutB['waterfall'] = null
  if (fall) {
    occupied.add(key(fall.i, fall.j))
    occupied.add(key(fall.i + fall.d[0], fall.j + fall.d[1]))
    occupied.add(key(fall.i + 2 * fall.d[0], fall.j + 2 * fall.d[1]))
    waterfall = {
      pool: [cellX(fall.i) - fall.d[0] * 0.08, fall.yBottom, cellZ(fall.j) - fall.d[1] * 0.08],
      top: [cellX(fall.i + fall.d[0]), fall.yTop, cellZ(fall.j + fall.d[1])],
      d: fall.d,
    }
  }
  const cellsWhere = (pred: (i: number, j: number) => boolean) => {
    const out: [number, number][] = []
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) if (pred(i, j)) out.push([i, j])
    return out
  }
  const shuffle = <T,>(a: T[]) => {
    for (let k = a.length - 1; k > 0; k--) {
      const m = Math.floor(rand() * (k + 1))
      ;[a[k], a[m]] = [a[m], a[k]]
    }
    return a
  }
  const isEdge = (i: number, j: number) => DIRS4.some(([di, dj]) => lv(i + di, j + dj) < level[i][j])
  const nearWall = (i: number, j: number) => DIRS4.some(([di, dj]) => lv(i + di, j + dj) > level[i][j])
  const frontness = (i: number, j: number) => cellX(i) * front[0] + cellZ(j) * front[1]
  const open = (i: number, j: number, r = 1) => !nearTrail(i, j, r) && !occupied.has(key(i, j)) && !diagAt.has(key(i, j)) && rampAt[i][j] === -1 && level[i][j] >= 0
  const place = (kind: string, i: number, j: number, scale: number, jitter = 0.08, yOff = 0) => {
    occupied.add(key(i, j))
    props.push({
      kind,
      x: cellX(i) + (rand() - 0.5) * 2 * jitter,
      y: TIER_TOP[level[i][j]] + yOff,
      z: cellZ(j) + (rand() - 0.5) * 2 * jitter,
      rot: rand() * Math.PI * 2,
      scale: scale * (0.88 + rand() * 0.24),
    })
  }
  const take = (cands: [number, number][], n: number, fn: (i: number, j: number) => void) => {
    let c = 0
    for (const [i, j] of cands) {
      if (c >= n) break
      if (occupied.has(key(i, j))) continue
      fn(i, j)
      c++
    }
  }

  // dark canopy backdrop behind the summit and along the back
  take(
    cellsWhere((i, j) => open(i, j, 0) && frontness(i, j) < -0.2 && !DIRS4.some(([di, dj]) => trailCells.has(key(i + di, j + dj)))).sort(
      (a, b) => frontness(...a) - frontness(...b) + (hash2(a[0], a[1], seed) - hash2(b[0], b[1], seed)) * 1.4,
    ),
    15,
    (i, j) => { const r = rand(); place(r < 0.45 ? 'treeDetailed' : r < 0.75 ? 'treePlateau' : 'treeFat', i, j, 0.72 + level[i][j] * 0.04) },
  )
  // palms at edges, leaning outward
  const palmKinds = ['palm', 'palmBend', 'palmTall']
  take(
    shuffle(cellsWhere((i, j) => open(i, j, 1) && isEdge(i, j) && frontness(i, j) > -1.6)),
    7,
    (i, j) => place(palmKinds[Math.floor(rand() * 3)], i, j, 0.6 + (level[i][j] === 2 ? 0.05 : 0)),
  )
  // pillars on cliff edges
  take(
    shuffle(cellsWhere((i, j) => open(i, j, 1) && isEdge(i, j) && level[i][j] >= 1)),
    2,
    (i, j) => place('pillar', i, j, 0.55),
  )
  // bushes against cliff bases and edges
  take(
    shuffle(cellsWhere((i, j) => open(i, j, 0) && (nearWall(i, j) || isEdge(i, j)))),
    24,
    (i, j) => place(rand() < 0.5 ? 'bushDetailed' : rand() < 0.5 ? 'bush' : 'bushLarge', i, j, 0.9),
  )
  // star ferns on the lawns
  take(
    shuffle(cellsWhere((i, j) => open(i, j, 0) && !nearWall(i, j))),
    13,
    (i, j) => place('fern', i, j, 0.85, 0.15),
  )
  take(shuffle(cellsWhere((i, j) => open(i, j, 0))), 10, (i, j) =>
    place(rand() < 0.4 ? 'grass' : rand() < 0.5 ? 'flowerRed' : 'flowerYellow', i, j, 0.9, 0.18),
  )
  take(shuffle(cellsWhere((i, j) => open(i, j, 0) && level[i][j] >= 1)), 2, (i, j) => place('mushroom', i, j, 0.9, 0.15))
  // hero mossy rock on the front lawn
  take(
    cellsWhere((i, j) => open(i, j, 1) && level[i][j] === 0 && !isEdge(i, j)).sort((a, b) => frontness(...b) - frontness(...a)).slice(2),
    1,
    (i, j) => place('mossRock', i, j, 0.6),
  )
  // summit stump next to the trail's end
  take(
    cellsWhere((i, j) => level[i][j] === 2 && rampAt[i][j] === -1 && !trailCells.has(key(i, j)) && !occupied.has(key(i, j))).sort(
      (a, b) => Math.hypot(a[0] - summitCell[0], a[1] - summitCell[1]) - Math.hypot(b[0] - summitCell[0], b[1] - summitCell[1]),
    ),
    1,
    (i, j) => place('stump', i, j, 0.8, 0.04),
  )
  // stones and lilies in the water
  let stones = 0
  for (const disc of shuffle([...sandDiscs])) {
    if (stones >= 4) break
    const l = Math.hypot(disc.x, disc.z) || 1
    const x = disc.x + (disc.x / l) * (disc.r + 0.45)
    const z = disc.z + (disc.z / l) * (disc.r + 0.45)
    const clear = sandDiscs.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 0.25)
    if (!clear) continue
    props.push({ kind: stones % 2 ? 'lily' : 'waterStone', x, y: WATER_Y, z, rot: rand() * 6.28, scale: stones % 2 ? 1.1 : 0.55 + rand() * 0.25 })
    stones++
  }

  return { level, rampAt, ramps, facades, corners, diags, sandDiscs, lawnDiscs, trail, trailCells, props, front, rotation, waterfall }
}
