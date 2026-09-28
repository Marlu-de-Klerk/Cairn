import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, BoxGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash01 } from '../../../lib/archipelago'
import type { Biome, PropKind } from '../../../lib/island/types'
import { BIOME_TERRAIN, SHARED_PALETTE, propRule } from '../../../lib/island/biomes'

const TAU = Math.PI * 2

/** Non-indexed copy with one flat colour, uv dropped so every part merges cleanly. */
function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  flat.deleteAttribute('uv')
  flat.deleteAttribute('normal')
  const c = new Color(hex)
  const n = flat.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  flat.setAttribute('color', new Float32BufferAttribute(col, 3))
  return flat
}

/** A free-form triangle list with per-triangle colours. */
function tris(list: readonly [Vector3, Vector3, Vector3, string][]): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  for (const [a, b, c, hex] of list) {
    const k = new Color(hex)
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

function jitter(g: BufferGeometry, amount: number, salt: number): BufferGeometry {
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(pos.getX(i) * 1000) * 7 + Math.round(pos.getY(i) * 1000) * 13 + Math.round(pos.getZ(i) * 1000) * 17
    const k = 1 + (hash01(key, 0, salt) - 0.5) * 2 * amount
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k)
  }
  return g
}

function palm(f: Record<string, string>): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const bez = (t: number) => new Vector3(0.12 * t * t, t, 0)
  for (let i = 0; i < 7; i++) {
    const a = bez(i / 7)
    const b = bez((i + 1) / 7)
    const seg = new CylinderGeometry(0.045 - 0.003 * (i + 1), 0.05 - 0.003 * i, b.distanceTo(a), 6)
    seg.rotateZ(-Math.atan2(b.x - a.x, b.y - a.y))
    seg.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
    parts.push(paint(seg, i % 2 === 0 ? f.palmTrunk : f.palmRing))
  }
  const crown = bez(1)
  const fronds: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-dir.z, 0, dir.x)
    let prev = crown.clone()
    for (let s = 1; s <= 4; s++) {
      const u = s / 4
      const next = crown.clone().addScaledVector(dir, 0.42 * u).add(new Vector3(0, 0.1 * u - 0.32 * u * u, 0))
      const w = 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.2))
      const hex = s === 4 ? f.frondTip : f.frond
      const mid = prev.clone().lerp(next, 0.5).add(new Vector3(0, 0.02, 0))
      fronds.push([prev, mid.clone().addScaledVector(side, w), next, hex], [prev, next, mid.clone().addScaledVector(side, -w), hex])
      prev = next
    }
  }
  parts.push(tris(fronds))
  return parts
}

const CANOPY_BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.62, 0, 0.3],
  [0.2, 0.52, 0.06, 0.21],
  [-0.19, 0.54, -0.07, 0.22],
  [0.03, 0.86, -0.03, 0.2],
  [0.02, 0.5, 0.2, 0.18],
]

function canopy(f: Record<string, string>): BufferGeometry[] {
  const parts = [paint(new CylinderGeometry(0.04, 0.065, 0.5, 6).translate(0, 0.25, 0), f.canopyTrunk)]
  CANOPY_BLOBS.forEach(([x, y, z, r], i) => {
    const hex = i === 3 ? f.canopyTop : i % 2 === 0 ? f.canopy : f.canopyShade
    parts.push(paint(jitter(new IcosahedronGeometry(r, 1).translate(x, y, z), 0.06, 20 + i), hex))
  })
  return parts
}

function bush(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(jitter(new IcosahedronGeometry(0.12, 1).translate(0, 0.1, 0), 0.08, 30), f.bush),
    paint(jitter(new IcosahedronGeometry(0.09, 0).translate(0.09, 0.08, 0.03), 0.08, 31), f.bush),
    paint(jitter(new IcosahedronGeometry(0.08, 0).translate(-0.07, 0.07, -0.05), 0.08, 32), f.bush),
  ]
}

function fern(f: Record<string, string>): BufferGeometry[] {
  const leaves: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-dir.z, 0, dir.x)
    const base = new Vector3(0, 0.01, 0)
    const mid = dir.clone().multiplyScalar(0.05).add(new Vector3(0, 0.05, 0))
    const tip = dir.clone().multiplyScalar(0.09).add(new Vector3(0, 0.03, 0))
    leaves.push([base, mid.clone().addScaledVector(side, 0.025), tip, f.fern], [base, tip, mid.clone().addScaledVector(side, -0.025), f.fern])
  }
  return [tris(leaves)]
}

function flower(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.006, 0.008, 0.1, 4).translate(0, 0.05, 0), f.grass ?? f.fern),
    paint(new CylinderGeometry(0.035, 0.035, 0.012, 6).translate(0, 0.106, 0), f.flower),
    paint(new CylinderGeometry(0.012, 0.012, 0.014, 5).translate(0, 0.114, 0), f.flowerCentre),
  ]
}

function mushroom(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.015, 0.02, 0.06, 6).translate(0, 0.03, 0), f.mushroomStem),
    paint(new ConeGeometry(0.045, 0.04, 7).translate(0, 0.08, 0), f.mushroom),
  ]
}

function grass(f: Record<string, string>): BufferGeometry[] {
  const blades: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3
    const d = new Vector3(Math.cos(a), 0, Math.sin(a))
    const side = new Vector3(-d.z, 0, d.x).multiplyScalar(0.012)
    const tip = d.clone().multiplyScalar(0.03).add(new Vector3(0, 0.1, 0))
    blades.push([side.clone(), side.clone().negate(), tip, f.grass ?? f.fern])
  }
  return [tris(blades)]
}

function stump(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.09, 0.11, 0.14, 8).translate(0, 0.07, 0), f.stump),
    paint(new CylinderGeometry(0.075, 0.075, 0.01, 8).translate(0, 0.145, 0), f.stumpInner),
    paint(new CylinderGeometry(0.05, 0.05, 0.02, 6).translate(0.03, 0.15, 0.02), f.stumpMoss),
  ]
}

function heroRock(f: Record<string, string>): BufferGeometry[] {
  return [
    paint(jitter(new IcosahedronGeometry(1, 1).scale(0.3, 0.22, 0.26).translate(0, 0.2, 0), 0.1, 40), f.heroRock),
    paint(jitter(new IcosahedronGeometry(1, 1).scale(0.2, 0.08, 0.18).translate(0.01, 0.34, 0.005), 0.08, 41), f.heroRockMoss),
  ]
}

function log(f: Record<string, string>): BufferGeometry[] {
  return [paint(new CylinderGeometry(0.05, 0.05, 0.36, 7).rotateZ(Math.PI / 2).translate(0, 0.05, 0), f.log ?? f.stump)]
}

function lily(f: Record<string, string>): BufferGeometry[] {
  const pads: [Vector3, Vector3, Vector3, string][] = []
  for (let k = 0; k < 7; k++) {
    const a0 = 0.5 + (k / 7) * (TAU - 0.5)
    const a1 = 0.5 + ((k + 1) / 7) * (TAU - 0.5)
    pads.push([new Vector3(0, 0.02, 0), new Vector3(Math.cos(a0) * 0.1, 0.02, Math.sin(a0) * 0.1), new Vector3(Math.cos(a1) * 0.1, 0.02, Math.sin(a1) * 0.1), f.lily ?? f.bush])
  }
  pads.push([new Vector3(0, 0, 0), new Vector3(0.01, 0.02, 0), new Vector3(0, 0.02, 0.01), f.lily ?? f.bush])
  return [tris(pads)]
}

function tent(f: Record<string, string>): BufferGeometry[] {
  const w = 0.13
  const h = 0.2
  const d = 0.3
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
  const [a, b, c, e, g, k] = [v(-w, 0, -d / 2), v(w, 0, -d / 2), v(0, h, -d / 2), v(-w, 0, d / 2), v(w, 0, d / 2), v(0, h, d / 2)]
  const door = [v(-0.05, 0, d / 2 + 0.002), v(0.05, 0, d / 2 + 0.002), v(0, 0.11, d / 2 + 0.002)] as const
  return [tris([[a, c, k, f.tent], [a, k, e, f.tent], [b, g, k, f.tent], [b, k, c, f.tent], [a, b, c, f.tent], [e, k, g, f.tent], [door[0], door[1], door[2], f.tentDoor]])]
}

function campfire(f: Record<string, string>): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    parts.push(paint(new IcosahedronGeometry(0.018, 0).translate(Math.cos(a) * 0.045, 0.012, Math.sin(a) * 0.045), f.campfireStone))
  }
  parts.push(paint(new ConeGeometry(0.025, 0.06, 5).translate(0, 0.03, 0), f.ember))
  return parts
}

function signpost(): BufferGeometry[] {
  return [
    paint(new CylinderGeometry(0.014, 0.016, 0.34, 5).translate(0, 0.17, 0), SHARED_PALETTE.pennantPole),
    paint(new BoxGeometry(0.16, 0.06, 0.012).translate(0.05, 0.28, 0), '#B98452'),
  ]
}

function summitCairn(): BufferGeometry[] {
  const radii = [0.1, 0.085, 0.07, 0.055, 0.04]
  let y = 0
  return radii.map((r, i) => {
    const g = jitter(new IcosahedronGeometry(r, 0).scale(1, 0.55, 1).translate(0, y + r * 0.5, 0), 0.08, 50 + i)
    y += r * 1.05
    return paint(g, i === radii.length - 1 ? SHARED_PALETTE.cairnDone : SHARED_PALETTE.cairnPending)
  })
}

function fallback(hex: string): BufferGeometry[] {
  return [paint(jitter(new IcosahedronGeometry(0.2, 0).translate(0, 0.2, 0), 0.1, 60), hex)]
}

function build(kind: PropKind, f: Record<string, string>): BufferGeometry[] {
  switch (kind) {
    case 'palm': return palm(f)
    case 'canopyTree': return canopy(f)
    case 'bush': return bush(f)
    case 'fernRosette': return fern(f)
    case 'flower': return flower(f)
    case 'mushroom': return mushroom(f)
    case 'grassTuft': return grass(f)
    case 'stump': return stump(f)
    case 'heroRock': return heroRock(f)
    case 'log': return log(f)
    case 'lily': return lily(f)
    case 'tent': return tent(f)
    case 'campfire': return campfire(f)
    case 'signpost': return signpost()
    case 'summitCairn': return summitCairn()
    default: return fallback(Object.values(f)[0] ?? '#7FA36A')
  }
}

const cache = new Map<string, BufferGeometry>()

/**
 * One vertex-coloured, non-indexed geometry per kind and biome (spec §3.9), base at y = 0 and height exactly
 * propRule(biome, kind).height, so instance scale maps straight onto the scale caps. Cached for the app's lifetime.
 */
export function getPropGeometry(kind: PropKind, biome: Biome): BufferGeometry {
  const key = `${biome}:${kind}`
  let g = cache.get(key)
  if (g) return g
  const f = BIOME_TERRAIN[biome].palette.foliage as Record<string, string>
  g = mergeGeometries(build(kind, f))!
  g.computeBoundingBox()
  const box = g.boundingBox!
  const target = propRule(biome, kind)?.height ?? box.max.y - box.min.y
  const k = target / Math.max(1e-6, box.max.y - box.min.y)
  g.translate(0, -box.min.y, 0)
  g.scale(k, k, k)
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  cache.set(key, g)
  return g
}
