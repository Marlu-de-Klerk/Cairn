// Spike C: one seeded island plan that drives terrain, trail and props.
// Pure maths only (no React / three) so terrain and trail cannot drift apart.

export type P2 = [number, number]
export type P3 = [number, number, number]

export const LEVEL = { shallow: 0, foam: 1, beach: 2, lawn: 3, mid: 4, summit: 5 } as const
export const LEVEL_Y = [-0.046, -0.04, 0.04, 0.16, 1.02, 1.9]
export const LEVEL_COUNT = LEVEL_Y.length
export const FIELD_SOFTNESS = 0.11
export const PATH_HALF_WIDTH = 0.19
const MAX_SLOPE = Math.tan((25 * Math.PI) / 180)

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

export function hash2(seed: number, x: number, y: number) {
  let h = (seed * 374761393 + x * 668265263 + y * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function makeNoise(seed: number) {
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x: number, z: number) => {
    const xi = Math.floor(x)
    const zi = Math.floor(z)
    const fx = smooth(x - xi)
    const fz = smooth(z - zi)
    const a = hash2(seed, xi, zi)
    const b = hash2(seed, xi + 1, zi)
    const c = hash2(seed, xi, zi + 1)
    const d = hash2(seed, xi + 1, zi + 1)
    return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1
  }
}

interface Harmonic { n: number; a: number; phi: number }
interface Lobe { x: number; z: number; r: number }
export interface Blob { cx: number; cz: number; R: number; harmonics: Harmonic[]; lobes: Lobe[] }

function blobSd(b: Blob, x: number, z: number) {
  const dx = x - b.cx
  const dz = z - b.cz
  const th = Math.atan2(dz, dx)
  let r = b.R
  for (const h of b.harmonics) r += b.R * h.a * Math.cos(h.n * th + h.phi)
  let sd = r - Math.hypot(dx, dz)
  for (const l of b.lobes) sd = Math.max(sd, l.r - Math.hypot(x - l.x, z - l.z))
  return sd
}

export interface PathPoint { x: number; z: number; y: number; s: number }

export interface PropPlacement { x: number; y: number; z: number; rotY: number; scale: number; tiltX?: number; tiltZ?: number }

export interface IslandLayout {
  seed: number
  front: number
  centers: { beach: P2; mid: P2; summit: P2 }
  /** signed distances per level (positive = inside that level's region), nested by construction */
  sdChain: (x: number, z: number) => number[]
  /** continuous level field; region of level L is h in [L+0.5, L+1.5) */
  fieldAt: (x: number, z: number) => number
  levelAt: (x: number, z: number) => number
  /** terrace height ignoring the carved path */
  terraceY: (x: number, z: number) => number
  /** walkable trail centreline, beach (t=0) to summit (t=1), ground height already slope-limited */
  path: PathPoint[]
  pathDistance: (x: number, z: number) => number
  extent: number
  props: Record<string, PropPlacement[]>
  moss: { x: number; y: number; z: number; rotY: number; scale: number }[]
  waterRocks: { x: number; z: number; r: number }[]
  waterfall: { samples: { x: number; z: number; y: number }[]; dir: P2 } | null
  pillars: { x: number; z: number; r: number; baseY: number; topY: number; sides: number; seed: number; grassCap: boolean }[]
}

function harmonics(rand: () => number, amp: number): Harmonic[] {
  return [2, 3, 4, 5].map((n) => ({ n, a: amp * (0.35 + rand()) / n ** 0.6, phi: rand() * Math.PI * 2 }))
}

const polar = (c: P2, th: number, r: number): P2 => [c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)]

export function buildIslandLayout(seed: number): IslandLayout {
  const rand = mulberry32(seed * 9973 + 17)
  const noise = makeNoise(seed * 31 + 7)
  const side = rand() < 0.5 ? 1 : -1
  const front = Math.atan2(11, 9) + (rand() - 0.5) * 0.5
  const drift = front + Math.PI - side * (0.55 + rand() * 0.35)
  const dv: P2 = [Math.cos(drift), Math.sin(drift)]

  const beachBlob: Blob = {
    cx: 0,
    cz: 0,
    R: 2.55 + rand() * 0.2,
    harmonics: harmonics(rand, 0.1),
    lobes: [
      // big front lawn lobe, a side arm and a small spit give the peanut outline
      { ...pt(polar([0, 0], front + side * (rand() - 0.5) * 0.5, 1.15)), r: 2.05 + rand() * 0.2 },
      { ...pt(polar([0, 0], front - side * (1.35 + rand() * 0.4), 1.75)), r: 1.35 + rand() * 0.25 },
      { ...pt(polar([0, 0], front + side * (1.9 + rand() * 0.5), 2.55)), r: 0.6 + rand() * 0.2 },
    ],
  }
  const midC: P2 = [dv[0] * 0.62, dv[1] * 0.62]
  const midBlob: Blob = {
    cx: midC[0],
    cz: midC[1],
    R: 1.95 + rand() * 0.2,
    harmonics: harmonics(rand, 0.09),
    lobes: [{ ...pt(polar(midC, drift + side * (1.3 + rand() * 0.4), 1.25)), r: 0.75 + rand() * 0.15 }],
  }
  const sumC: P2 = [midC[0] + dv[0] * 0.5, midC[1] + dv[1] * 0.5]
  const sumBlob: Blob = { cx: sumC[0], cz: sumC[1], R: 1.25 + rand() * 0.12, harmonics: harmonics(rand, 0.08), lobes: [] }

  const beachWidth = (x: number, z: number) => {
    const th = Math.atan2(z, x)
    const facing = 0.5 + 0.5 * Math.cos(th - front)
    return 0.16 + 0.34 * facing * facing + 0.06 * noise(x * 1.3 + 40, z * 1.3)
  }

  const sdChain = (x: number, z: number) => {
    const wob = 0.09 * noise(x * 1.1, z * 1.1) + 0.035 * noise(x * 3.1 + 11, z * 3.1)
    const beach = blobSd(beachBlob, x, z) + wob
    const lawn = beach - beachWidth(x, z)
    // ledges are wide where the trail climbs (front), narrow at the back like the reference
    const facing = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - front)
    const crag = 0.07 * noise(x * 4.3 + 23, z * 4.3 - 9)
    const mid = Math.min(blobSd(midBlob, x, z) + 0.8 * wob + crag, lawn - 0.28 - 0.62 * facing)
    const summit = Math.min(blobSd(sumBlob, x, z) + 0.6 * wob + crag, mid - 0.3 - 0.55 * facing)
    return [beach + 0.42, beach + 0.12, beach, lawn, mid, summit]
  }
  const fieldAt = (x: number, z: number) => {
    const sd = sdChain(x, z)
    let h = 0
    for (const v of sd) h += Math.min(1, Math.max(0, v / FIELD_SOFTNESS + 0.5))
    return h
  }
  const levelAt = (x: number, z: number) => {
    const sd = sdChain(x, z)
    let n = 0
    while (n < sd.length && sd[n] > 0) n++
    return n - 1
  }
  const terraceY = (x: number, z: number) => {
    const l = levelAt(x, z)
    return l < 0 ? -0.3 : LEVEL_Y[l]
  }

  const rayExit = (c: P2, th: number, level: number) => {
    const cs = Math.cos(th)
    const sn = Math.sin(th)
    for (let r = 0; r < 6; r += 0.01) if (sdChain(c[0] + cs * r, c[1] + sn * r)[level] <= 0) return r
    return 6
  }
  const ledgeRadius = (c: P2, th: number, upper: number) => {
    const rin = rayExit(c, th, upper)
    const rout = rayExit(c, th, upper - 1)
    return rin + Math.min(0.42, (rout - rin) * 0.5)
  }

  // --- trail plan (2D), computed before any mesh: beach -> lawn -> ramp -> mid -> ramp -> summit
  const pts: P2[] = []
  const pushLine = (a: P2, b: P2) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.04))
    for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  }
  const pushArc = (c: P2, a0: number, a1: number, radius: (a: number, u: number) => number) => {
    const approxLen = Math.abs(a1 - a0) * radius(a0, 0)
    const n = Math.max(4, Math.ceil(approxLen / 0.04))
    for (let i = 1; i <= n; i++) {
      const u = i / n
      const a = a0 + (a1 - a0) * u
      pts.push(polar(c, a, radius(a, u)))
    }
  }
  const angleFrom = (c: P2, p: P2) => Math.atan2(p[1] - c[1], p[0] - c[0])
  const last = () => pts[pts.length - 1]

  const startTh = front - side * 0.3
  const rLawn = rayExit([0, 0], startTh, LEVEL.lawn)
  const rBeach = rayExit([0, 0], startTh, LEVEL.beach)
  const start = polar([0, 0], startTh, rLawn + (rBeach - rLawn) * 0.55)
  const a1 = angleFrom(midC, start)
  pushLine(start, polar(midC, a1, ledgeRadius(midC, a1, LEVEL.mid)))
  const aRamp1 = a1 - side * (0.45 + rand() * 0.2)
  pushArc(midC, a1, aRamp1, (a) => ledgeRadius(midC, a, LEVEL.mid))
  const rinMid = rayExit(midC, aRamp1, LEVEL.mid)
  const ramp1Span = 2.3 / (rinMid + 0.1)
  pushArc(midC, aRamp1, aRamp1 - side * ramp1Span, (a, u) => {
    const lr = ledgeRadius(midC, a, LEVEL.mid)
    return lr + (rayExit(midC, a, LEVEL.mid) - 0.42 - lr) * u
  })
  const b1 = angleFrom(sumC, last())
  pushLine(last(), polar(sumC, b1, ledgeRadius(sumC, b1, LEVEL.summit)))
  let b2 = front + side * (0.35 + rand() * 0.25)
  while (side * (b2 - b1) < 0.8) b2 += side * Math.PI * 2
  while (side * (b2 - b1) > Math.PI * 2 + 0.8) b2 -= side * Math.PI * 2
  pushArc(sumC, b1, b2, (a) => ledgeRadius(sumC, a, LEVEL.summit))
  const rinSum = rayExit(sumC, b2, LEVEL.summit)
  const ramp2Span = 2.2 / (rinSum + 0.1)
  pushArc(sumC, b2, b2 + side * ramp2Span, (a, u) => {
    const rin = rayExit(sumC, a, LEVEL.summit)
    const lr = ledgeRadius(sumC, a, LEVEL.summit)
    return lr + (rin - 0.38 - lr) * u
  })
  pushLine(last(), [sumC[0] + dv[0] * -0.15, sumC[1] + dv[1] * -0.15])

  // round off the plan's corners so the carved strip never pinches
  for (let pass = 0; pass < 40; pass++) {
    const prev = pts.map((p) => [p[0], p[1]] as P2)
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i] = [0.25 * prev[i - 1][0] + 0.5 * prev[i][0] + 0.25 * prev[i + 1][0], 0.25 * prev[i - 1][1] + 0.5 * prev[i][1] + 0.25 * prev[i + 1][1]]
    }
  }

  // ground height along the plan: terrace level, made monotonic, then slope-limited into ramps
  const raw = pts.map(([x, z]) => Math.max(LEVEL_Y[LEVEL.beach], terraceY(x, z)))
  for (let i = 1; i < raw.length; i++) raw[i] = Math.max(raw[i], raw[i - 1])
  const s: number[] = [0]
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const g = 2 * MAX_SLOPE
  const yf = raw.slice()
  for (let i = 1; i < yf.length; i++) yf[i] = Math.min(raw[i], yf[i - 1] + g * (s[i] - s[i - 1]))
  const yb = raw.slice()
  for (let i = yb.length - 2; i >= 0; i--) yb[i] = Math.max(raw[i], yb[i + 1] - g * (s[i + 1] - s[i]))
  let ys = yf.map((v, i) => (v + yb[i]) / 2)
  for (let pass = 0; pass < 3; pass++) ys = ys.map((v, i) => (i === 0 || i === ys.length - 1 ? v : 0.25 * ys[i - 1] + 0.5 * v + 0.25 * ys[i + 1]))
  const path: PathPoint[] = pts.map(([x, z], i) => ({ x, z, y: ys[i], s: s[i] }))

  const pathDistance = (x: number, z: number) => {
    let best = Infinity
    for (let i = 0; i < path.length - 1; i += 2) {
      const a = path[i]
      const b = path[Math.min(i + 2, path.length - 1)]
      const ex = b.x - a.x
      const ez = b.z - a.z
      const l2 = ex * ex + ez * ez || 1e-9
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2))
      const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t)
      if (d < best) best = d
    }
    return best
  }

  // --- props, scattered by level with density rules, corridor kept clear
  const props: Record<string, PropPlacement[]> = {}
  const taken: { x: number; z: number; r: number }[] = []

  // waterfall: a spring on the summit lip, dropping at every terrace edge until it would reach the trail
  let waterfall: IslandLayout['waterfall'] = null
  {
    const walk = (th: number) => {
      const rs = rayExit(sumC, th, LEVEL.summit)
      const samples: { x: number; z: number; y: number }[] = []
      for (let r = Math.max(0.2, rs - 0.4); r < 6; r += 0.03) {
        const [x, z] = polar(sumC, th, r)
        const l = levelAt(x, z)
        if (l < LEVEL.beach || pathDistance(x, z) < PATH_HALF_WIDTH + 0.12) break
        samples.push({ x, z, y: LEVEL_Y[l] })
      }
      return samples
    }
    let best = -Infinity
    let bestSamples: { x: number; z: number; y: number }[] = []
    let bestTh = 0
    for (let k = 0; k < 90; k++) {
      const th = (k / 90) * Math.PI * 2
      const rs = rayExit(sumC, th, LEVEL.summit)
      const spring = polar(sumC, th, rs - 0.35)
      if (pathDistance(spring[0], spring[1]) < PATH_HALF_WIDTH + 0.4) continue
      const samples = walk(th)
      const drops = new Set(samples.map((q) => q.y)).size - 1
      if (drops < 1) continue
      const last = samples[samples.length - 1]
      const pool = last.y > LEVEL_Y[LEVEL.beach] ? 1 : 0
      const score = -Math.abs(Math.cos(th - front) - 0.75) * 2.5 + drops * 0.5 - pool * 0.2
      if (score > best) {
        best = score
        bestSamples = samples
        bestTh = th
      }
    }
    if (bestSamples.length > 1) {
      for (const q of bestSamples) taken.push({ x: q.x, z: q.z, r: 0.2 })
      waterfall = { samples: bestSamples, dir: [Math.cos(bestTh), Math.sin(bestTh)] }
    }
  }
  // keep the start cairn and the summit flag readable
  taken.push({ x: path[0].x, z: path[0].z, r: 0.45 }, { x: path[path.length - 1].x, z: path[path.length - 1].z, r: 0.7 })
  const free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r)
  const scatter = (
    name: string,
    count: number,
    opts: {
      levels: number[]
      spacing: number
      pathClear: number
      edge?: [number, number]
      cliffFoot?: [number, number]
      cliffClear?: number
      facing?: (dot: number) => boolean
      scale: [number, number]
      tilt?: number
    },
  ) => {
    const list: PropPlacement[] = (props[name] ??= [])
    for (let tries = 0; tries < count * 120 && list.length < count; tries++) {
      const r = Math.sqrt(rand()) * 3.9
      const th = rand() * Math.PI * 2
      const x = r * Math.cos(th)
      const z = r * Math.sin(th)
      const sd = sdChain(x, z)
      const lvl = levelAt(x, z)
      if (!opts.levels.includes(lvl)) continue
      const edgeDist = sd[lvl]
      const upperDist = lvl + 1 < sd.length ? -sd[lvl + 1] : 9
      if (opts.edge && (edgeDist < opts.edge[0] || edgeDist > opts.edge[1])) continue
      if (opts.cliffFoot && (upperDist < opts.cliffFoot[0] || upperDist > opts.cliffFoot[1])) continue
      if (upperDist < (opts.cliffClear ?? 0.12)) continue
      if (edgeDist < 0.08) continue
      if (opts.facing) {
        const len = Math.hypot(x, z) || 1
        if (!opts.facing((x * Math.cos(front) + z * Math.sin(front)) / len)) continue
      }
      if (pathDistance(x, z) < PATH_HALF_WIDTH + opts.pathClear) continue
      if (!free(x, z, opts.spacing * 0.5)) continue
      taken.push({ x, z, r: opts.spacing * 0.5 })
      const sc = opts.scale[0] + (opts.scale[1] - opts.scale[0]) * rand()
      const tilt = opts.tilt ?? 0
      list.push({
        x,
        y: LEVEL_Y[lvl],
        z,
        rotY: rand() * Math.PI * 2,
        scale: sc,
        tiltX: (rand() - 0.5) * tilt,
        tiltZ: (rand() - 0.5) * tilt,
      })
    }
  }

  const landmarks = (name: string, x: number, z: number, scale: number) => {
    const lvl = levelAt(x, z)
    if (lvl < LEVEL.beach || pathDistance(x, z) < PATH_HALF_WIDTH + 0.25) return
    taken.push({ x, z, r: 0.35 })
    ;(props[name] ??= []).push({ x, y: LEVEL_Y[lvl], z, rotY: rand() * Math.PI * 2, scale })
  }
  // summit stump and a camp on the mid tier as human-scale cues
  landmarks('stump_old', sumC[0] + dv[1] * 0.45 * side, sumC[1] - dv[0] * 0.45 * side, 1.1)
  {
    const campTh = drift + Math.PI + side * 0.1
    const cp = polar(midC, campTh, rayExit(midC, campTh, LEVEL.mid) - 0.35)
    landmarks('tent_smallOpen', cp[0], cp[1], 0.45)
    landmarks('campfire_stones', cp[0] + 0.35 * Math.cos(campTh + 1.2), cp[1] + 0.35 * Math.sin(campTh + 1.2), 0.4)
  }
  {
    const rockTh = front + side * 0.55
    const rp = polar([0, 0], rockTh, rayExit([0, 0], rockTh, LEVEL.lawn) - 0.75)
    landmarks('rock_largeA', rp[0], rp[1], 2.6)
  }

  // fluted rock columns: some hugging the cliffs, a couple standing free on the lawn rim
  const pillars: IslandLayout['pillars'] = []
  const addPillars = (count: number, levels: number[], test: (sd: number[], lvl: number) => boolean, height: (lvl: number) => number, radius: [number, number]) => {
    for (let tries = 0; tries < 500 && count > 0; tries++) {
      const r = Math.sqrt(rand()) * 3.8
      const th = rand() * Math.PI * 2
      const x = r * Math.cos(th)
      const z = r * Math.sin(th)
      const lvl = levelAt(x, z)
      if (!levels.includes(lvl)) continue
      const sd = sdChain(x, z)
      if (!test(sd, lvl)) continue
      const pr = radius[0] + (radius[1] - radius[0]) * rand()
      if (pathDistance(x, z) < PATH_HALF_WIDTH + pr + 0.25 || !free(x, z, pr + 0.1)) continue
      taken.push({ x, z, r: pr + 0.1 })
      pillars.push({ x, z, r: pr, baseY: LEVEL_Y[lvl], topY: LEVEL_Y[lvl] + height(lvl), sides: 6 + Math.floor(rand() * 2), seed: Math.floor(rand() * 1e6), grassCap: rand() < 0.5 })
      count--
    }
  }
  const tierGap = (lvl: number) => LEVEL_Y[lvl + 1] - LEVEL_Y[lvl]
  addPillars(3, [LEVEL.lawn, LEVEL.mid], (sd, l) => -sd[l + 1] > 0.1 && -sd[l + 1] < 0.2, (l) => tierGap(l) * (0.7 + rand() * 0.35), [0.17, 0.25])
  addPillars(2, [LEVEL.lawn], (sd, l) => sd[l] > 0.16 && sd[l] < 0.3, () => 0.45 + rand() * 0.35, [0.11, 0.16])

  scatter('palm', 8, { levels: [LEVEL.lawn, LEVEL.mid, LEVEL.summit], spacing: 0.8, pathClear: 0.3, edge: [0.12, 0.4], cliffClear: 0.35, scale: [0.44, 0.56], tilt: 0.25 })
  scatter('canopy', 22, { levels: [LEVEL.lawn, LEVEL.mid, LEVEL.summit], spacing: 0.36, pathClear: 0.28, edge: [0.08, 9], cliffClear: 0.12, facing: (d) => d < 0.1, scale: [0.5, 0.78] })
  scatter('bush', 18, { levels: [LEVEL.lawn, LEVEL.mid], spacing: 0.35, pathClear: 0.12, cliffFoot: [0.12, 0.4], scale: [0.6, 0.9] })
  scatter('bushEdge', 6, { levels: [LEVEL.lawn, LEVEL.mid, LEVEL.summit], spacing: 0.35, pathClear: 0.12, edge: [0.1, 0.3], scale: [0.55, 0.8] })
  scatter('fern', 12, { levels: [LEVEL.lawn, LEVEL.mid, LEVEL.summit], spacing: 0.5, pathClear: 0.1, edge: [0.2, 9], scale: [0.5, 0.7] })
  scatter('grass', 12, { levels: [LEVEL.lawn, LEVEL.mid, LEVEL.summit], spacing: 0.3, pathClear: 0.04, edge: [0.1, 9], scale: [0.5, 0.8] })
  scatter('flower', 9, { levels: [LEVEL.lawn, LEVEL.mid], spacing: 0.25, pathClear: 0.06, edge: [0.15, 9], scale: [0.7, 1.0] })
  scatter('mushroom', 3, { levels: [LEVEL.mid, LEVEL.lawn], spacing: 0.3, pathClear: 0.1, cliffFoot: [0.12, 0.35], scale: [0.7, 0.9] })
  scatter('log', 1, { levels: [LEVEL.lawn], spacing: 0.6, pathClear: 0.25, edge: [0.3, 9], cliffClear: 0.4, scale: [0.8, 0.9] })

  // vines hanging from cliff lips, facing out along the level's outward normal
  const moss: IslandLayout['moss'] = []
  for (const [lvl, c] of [
    [LEVEL.summit, sumC],
    [LEVEL.mid, midC],
  ] as const) {
    let placed = 0
    for (let tries = 0; tries < 300 && placed < 8; tries++) {
      const th = rand() * Math.PI * 2
      const r = rayExit(c, th, lvl)
      const [x, z] = polar(c, th, r - 0.005)
      if (pathDistance(x, z) < PATH_HALF_WIDTH + 0.3) continue
      const e = 0.02
      const nx = sdChain(x - e, z)[lvl] - sdChain(x + e, z)[lvl]
      const nz = sdChain(x, z - e)[lvl] - sdChain(x, z + e)[lvl]
      const nl = Math.hypot(nx, nz) || 1
      if (moss.some((m) => Math.hypot(m.x - x, m.z - z) < 0.5) || !free(x, z, 0.1)) continue
      moss.push({ x, y: LEVEL_Y[lvl], z, rotY: Math.atan2(nx / nl, nz / nl), scale: 0.75 + rand() * 0.5 })
      placed++
    }
  }

  const waterRocks: IslandLayout['waterRocks'] = []
  for (let tries = 0; tries < 400 && waterRocks.length < 5; tries++) {
    const th = rand() * Math.PI * 2
    const r = rayExit([0, 0], th, LEVEL.foam) + 0.12 + rand() * 0.35
    const [x, z] = polar([0, 0], th, r)
    if (waterRocks.some((w) => Math.hypot(w.x - x, w.z - z) < 0.5)) continue
    waterRocks.push({ x, z, r: 1.2 + rand() * 0.8 })
  }

  return {
    seed,
    front,
    centers: { beach: [0, 0], mid: midC, summit: sumC },
    sdChain,
    fieldAt,
    levelAt,
    terraceY,
    path,
    pathDistance,
    extent: 4.7,
    props,
    moss,
    waterRocks,
    waterfall,
    pillars,
  }
}

function pt(p: P2) {
  return { x: p[0], z: p[1] }
}
