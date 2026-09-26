// Spike B: Kenney Nature Kit modular cliff island. Throwaway prototype.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BLOCK_BOTTOM,
  CELL,
  GRID,
  SAND_TOP,
  TIER_TOP,
  buildLayoutB,
  cellX,
  cellZ,
  valueNoise,
  type IslandLayoutB,
} from './spikeB-layout'

type Colors = Record<string, string>
interface Item {
  m: THREE.Matrix4
  tint?: number
  colors?: Colors
}

const DIRT_LIKE = new Set(['dirt', 'dirtDark', 'stone', 'stoneDark'])

function useKitParts(name: string, gradient: boolean) {
  const { scene } = useGLTF(`/models/spikeB/${name}.glb`)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const parts: { geometry: THREE.BufferGeometry; mat: string; vc: boolean }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      g.translate(0, 0.05, 0)
      const matName = (mesh.material as THREE.Material).name
      const vc = gradient && DIRT_LIKE.has(matName)
      if (vc) {
        const pos = g.getAttribute('position')
        const col = new Float32Array(pos.count * 3)
        for (let k = 0; k < pos.count; k++) {
          const y = pos.getY(k)
          const f = 0.66 + 0.4 * THREE.MathUtils.smoothstep(y, 0.0, 0.85) + (y > 0.97 ? 0.08 : 0)
          col[k * 3] = f
          col[k * 3 + 1] = f
          col[k * 3 + 2] = f
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      }
      parts.push({ geometry: g, mat: matName, vc })
    })
    return parts
  }, [scene, gradient])
}

function KitPart({
  geometry,
  mat,
  vc,
  items,
  colors,
  cast = true,
}: {
  geometry: THREE.BufferGeometry
  mat: string
  vc: boolean
  items: Item[]
  colors: Colors
  cast?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(
    () =>
      mat === 'water'
        ? new THREE.MeshBasicMaterial({ color: '#ffffff' })
        : new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: vc }),
    [vc, mat],
  )
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    const c = new THREE.Color()
    items.forEach((it, k) => {
      im.setMatrixAt(k, it.m)
      c.set(it.colors?.[mat] ?? colors[mat] ?? '#ff00ff').multiplyScalar(it.tint ?? 1)
      im.setColorAt(k, c)
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
  }, [items, colors, mat])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} castShadow={cast} receiveShadow />
}

function Kit({ name, items, colors, gradient = false, cast = true }: { name: string; items: Item[]; colors: Colors; gradient?: boolean; cast?: boolean }) {
  const parts = useKitParts(name, gradient)
  return (
    <>
      {parts.map((p, k) => (
        <KitPart key={k} geometry={p.geometry} mat={p.mat} vc={p.vc} items={items} colors={colors} cast={cast} />
      ))}
    </>
  )
}

const _q = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)
function mat(x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number) {
  _q.setFromAxisAngle(_up, rotY)
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz))
}
const dirAngle = (d: readonly [number, number]) => Math.atan2(d[0], d[1])

const PAL = {
  grass: ['#68B97C', '#5FB277', '#67BA7E'],
  cliff: '#A8735A',
  t1Side: '#C9A26E',
  sand: '#EFCB8E',
  foam: '#FFFFFF',
  shallow: '#8FD4D9',
  path: '#D9C08A',
  trail: '#F7E7BF',
}

function tint(x: number, z: number, seed: number, amp: number) {
  return 1 + (valueNoise(x * 0.8, z * 0.8, seed * 97 + 5) - 0.5) * amp
}

function Terrain({ L, seed }: { L: IslandLayoutB; seed: number }) {
  const { blocks, diagBlocks, diagFacades, facades, caves, falls, corners, ramps, moss } = useMemo(() => {
    const blocks: Item[] = []
    const diagBlocks: Item[] = []
    const diagFacades: Item[] = []
    const diagSet = new Set(L.diags.map((d) => d.i * GRID + d.j))
    const diagRot: Record<string, number> = { '1,-1': 0, '-1,-1': Math.PI / 2, '-1,1': Math.PI, '1,1': -Math.PI / 2 }
    for (const dg of L.diags) {
      const x = cellX(dg.i)
      const z = cellZ(dg.j)
      const lowTop = dg.lower < 0 ? BLOCK_BOTTOM : TIER_TOP[dg.lower]
      const top = TIER_TOP[dg.upper]
      const rotY = diagRot[`${dg.a[0] + dg.b[0]},${dg.a[1] + dg.b[1]}`]
      if (dg.lower >= 0)
        blocks.push({
          m: mat(x, BLOCK_BOTTOM, z, 0, CELL, lowTop - BLOCK_BOTTOM, CELL),
          tint: tint(x, z, seed, 0.06),
          colors: { grass: PAL.grass[dg.lower], dirt: dg.lower === 0 ? PAL.t1Side : PAL.cliff },
        })
      diagBlocks.push({
        m: mat(x, lowTop, z, rotY, CELL, top - lowTop, CELL),
        tint: tint(x, z, seed, 0.06),
        colors: { grass: PAL.grass[dg.upper], dirt: dg.upper === 0 ? PAL.t1Side : PAL.cliff },
      })
      if (dg.upper >= 1)
        diagFacades.push({ m: mat(x, lowTop, z, rotY, CELL, top - lowTop, CELL), colors: { grass: PAL.grass[dg.upper] } })
    }
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) {
        const l = L.level[i][j]
        if (l < 0 || diagSet.has(i * GRID + j)) continue
        const x = cellX(i)
        const z = cellZ(j)
        const top = TIER_TOP[l]
        blocks.push({
          m: mat(x, BLOCK_BOTTOM, z, 0, CELL * 1.012, top - BLOCK_BOTTOM, CELL * 1.012),
          tint: l === 0 ? 1 : tint(x, z, seed, 0.07),
          colors: { grass: PAL.grass[l], dirt: l === 0 ? PAL.t1Side : PAL.cliff },
        })
      }
    const facades: Item[] = []
    const caves: Item[] = []
    const falls: Item[] = []
    const moss: Item[] = []
    let fi = 0
    for (const f of L.facades) {
      const x = cellX(f.i)
      const z = cellZ(f.j)
      const h = f.yTop - f.yBottom
      const rotY = dirAngle(f.d)
      const item: Item = {
        m: mat(x, f.yBottom, z, rotY, CELL, h, CELL),
        tint: 0.92 + ((fi * 2654435761) % 1000) / 1000 * 0.16,
        colors: { grass: PAL.grass[f.upperLevel] },
      }
      fi++
      ;(f.kind === 'cave' ? caves : f.kind === 'waterfall' ? falls : facades).push(item)
      const facingFront = -(f.d[0] * L.front[0] + f.d[1] * L.front[1])
      if (f.kind === 'plain' && facingFront > 0.1 && h > 0.8 && (fi * 7919) % 3 === 0) {
        const off = (((fi * 131) % 7) / 7 - 0.5) * 0.6
        const local = new THREE.Vector3(off * CELL, 0, -0.29 * CELL).applyAxisAngle(_up, rotY)
        const s = 1.1 + ((fi * 17) % 5) * 0.12
        moss.push({ m: mat(x + local.x, f.yTop - 0.04 - 0.478 * s, z + local.z, rotY, s, s, s) })
      }
    }
    const corners: Item[] = []
    const cornerRot: Record<string, number> = { '-1,1': 0, '1,1': Math.PI / 2, '1,-1': Math.PI, '-1,-1': -Math.PI / 2 }
    for (const c of L.corners) {
      corners.push({
        m: mat(cellX(c.i), c.yBottom, cellZ(c.j), cornerRot[`${c.toward[0]},${c.toward[1]}`], CELL, c.yTop - c.yBottom, CELL),
        colors: { grass: PAL.grass[Math.round(c.yTop) >= 2 ? 2 : 1] },
      })
    }
    const ramps: Item[] = L.ramps.map((r) => ({
      m: mat(r.center[0], TIER_TOP[r.tier - 1], r.center[1], dirAngle(r.d), r.width * CELL, TIER_TOP[r.tier] - TIER_TOP[r.tier - 1], 3 * CELL),
      colors: { grass: PAL.grass[r.tier] },
    }))
    return { blocks, diagBlocks, diagFacades, facades, caves, falls, corners, ramps, moss }
  }, [L, seed])

  const rock = { grass: PAL.grass[1], dirt: PAL.cliff }
  return (
    <>
      <Kit name="cliff_block_rock" items={blocks} colors={rock} gradient cast={false} />
      <Kit name="cliff_blockDiagonal_rock" items={diagBlocks} colors={rock} gradient />
      <Kit name="cliff_topDiagonal_rock" items={diagFacades} colors={rock} gradient />
      <Kit name="cliff_top_rock" items={facades} colors={rock} gradient />
      <Kit name="cliff_cave_rock" items={caves} colors={rock} gradient />
      <Kit name="cliff_waterfall_rock" items={falls} colors={{ ...rock, water: '#E6F6F7', _defaultMat: '#FFFFFF' }} gradient />
      <Kit name="cliff_cornerTop_rock" items={corners} colors={rock} gradient />
      <Kit name="cliff_blockSlope_rock" items={ramps} colors={rock} gradient />
      <Kit name="hanging_moss" items={moss} colors={{ grass: '#4E8F6E' }} />
      {L.waterfall && <WaterfallBits w={L.waterfall} />}
      <GrassCaps L={L} seed={seed} />
    </>
  )
}

function grassShade(x: number, z: number, seed: number) {
  return 1 + (valueNoise(x * 0.9, z * 0.9, seed * 31 + 1) - 0.5) * 0.18 + (valueNoise(x * 2.3, z * 2.3, seed * 31 + 2) - 0.5) * 0.07
}

// Seamless grass caps over the tile tops: shared-vertex grid with smooth blotches and contact darkening at cliff bases.
function GrassCaps({ L, seed }: { L: IslandLayoutB; seed: number }) {
  const geo = useMemo(() => {
    const diagSet = new Set(L.diags.map((d) => d.i * GRID + d.j))
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const c = new THREE.Color()
    const lvAt = (i: number, j: number) => (i >= 0 && j >= 0 && i < GRID && j < GRID ? L.level[i][j] : -1)
    for (let k = 0; k < 3; k++) {
      const vmap = new Map<number, number>()
      const vert = (vi: number, vj: number) => {
        const id = vi * (GRID + 1) + vj
        const got = vmap.get(id)
        if (got !== undefined) return got
        const x = cellX(vi) - CELL / 2
        const z = cellZ(vj) - CELL / 2
        let ao = 1
        for (const [a, b] of [[vi - 1, vj - 1], [vi, vj - 1], [vi - 1, vj], [vi, vj]]) if (lvAt(a, b) > k) ao = 0.84
        c.set(PAL.grass[k]).multiplyScalar(grassShade(x, z, seed) * ao)
        pos.push(x, TIER_TOP[k] + 0.003, z)
        col.push(c.r, c.g, c.b)
        const n = pos.length / 3 - 1
        vmap.set(id, n)
        return n
      }
      for (let i = 0; i < GRID; i++)
        for (let j = 0; j < GRID; j++) {
          if (L.level[i][j] !== k || L.rampAt[i][j] !== -1 || diagSet.has(i * GRID + j)) continue
          const a = vert(i, j)
          const b = vert(i + 1, j)
          const cc = vert(i + 1, j + 1)
          const d = vert(i, j + 1)
          idx.push(a, d, cc, a, cc, b)
        }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [L, seed])
  return (
    <mesh geometry={geo} receiveShadow castShadow>
      <meshLambertMaterial vertexColors shadowSide={THREE.DoubleSide} />
    </mesh>
  )
}

function WaterfallBits({ w }: { w: NonNullable<IslandLayoutB['waterfall']> }) {
  const rotY = dirAngle(w.d)
  return (
    <>
      <mesh position={[w.pool[0], w.pool[1] + 0.006, w.pool[2]]} receiveShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.012, 24]} />
        <meshLambertMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[w.pool[0], w.pool[1] + 0.01, w.pool[2]]} receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.012, 24]} />
        <meshLambertMaterial color="#BEE8EA" />
      </mesh>
      <mesh position={[w.top[0] - Math.sin(rotY) * 0.05, w.top[1] + 0.006, w.top[2] - Math.cos(rotY) * 0.05]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[0.2, 0.012, 0.62]} />
        <meshLambertMaterial color="#BEE8EA" />
      </mesh>
    </>
  )
}

function Discs({ items, color, ratio = 0.8, side, tints }: { items: THREE.Matrix4[]; color: string; ratio?: number; side?: string; tints?: number[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.CylinderGeometry(ratio, 1, 1, 28, 1).translate(0, 0.5, 0), [ratio])
  const m = useMemo(() => {
    if (!side) return new THREE.MeshLambertMaterial({ color })
    return [new THREE.MeshLambertMaterial({ color: side }), new THREE.MeshLambertMaterial({ color }), new THREE.MeshLambertMaterial({ color: side })]
  }, [color, side])
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    const c = new THREE.Color()
    items.forEach((mm, k) => {
      im.setMatrixAt(k, mm)
      if (tints) im.setColorAt(k, c.setScalar(tints[k]))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [items, tints])
  return <instancedMesh ref={ref} args={[geo, m, items.length]} frustumCulled={false} receiveShadow />
}

function Beach({ L, seed }: { L: IslandLayoutB; seed: number }) {
  const { lawn, lawnTint, sand, foam, shallow } = useMemo(() => {
    const lawn: THREE.Matrix4[] = []
    const lawnTint: number[] = []
    for (const d of L.lawnDiscs) {
      lawn.push(mat(d.x, -0.1, d.z, 0, d.r, TIER_TOP[0] + 0.097, d.r))
      lawnTint.push(grassShade(d.x, d.z, seed))
    }
    const sand: THREE.Matrix4[] = []
    const foam: THREE.Matrix4[] = []
    const shallow: THREE.Matrix4[] = []
    const stones = L.props.filter((p) => p.kind === 'waterStone')
    for (const d of L.sandDiscs) {
      sand.push(mat(d.x, -0.14, d.z, 0, d.r / 0.8, SAND_TOP + 0.14, d.r / 0.8))
      foam.push(mat(d.x, -0.1, d.z, 0, d.r / 0.8 + 0.12, 0.075, d.r / 0.8 + 0.12))
      shallow.push(mat(d.x, -0.1, d.z, 0, d.r + 0.6, 0.062, d.r + 0.6))
    }
    for (const s of stones) foam.push(mat(s.x, -0.1, s.z, 0, 0.22 * s.scale, 0.075, 0.22 * s.scale))
    return { lawn, lawnTint, sand, foam, shallow }
  }, [L, seed])
  return (
    <>
      <Discs items={lawn} color={PAL.grass[0]} ratio={0.97} side={PAL.t1Side} tints={lawnTint} />
      <Discs items={sand} color={PAL.sand} />
      <Discs items={foam} color={PAL.foam} />
      <Discs items={shallow} color={PAL.shallow} />
    </>
  )
}

const PROP_MODELS: Record<string, { model: string; colors: Colors }> = {
  treeDetailed: { model: 'tree_detailed', colors: { leafsGreen: '#437F86', woodBark: '#8B6B4A' } },
  treePlateau: { model: 'tree_plateau', colors: { leafsGreen: '#3B737A', woodBark: '#8B6B4A' } },
  treeFat: { model: 'tree_fat', colors: { leafsGreen: '#4A8A8C', woodBark: '#8B6B4A' } },
  treeOak: { model: 'tree_oak', colors: { leafsGreen: '#3C7A7E', woodBark: '#8B6B4A' } },
  palm: { model: 'tree_palm', colors: { leafsGreen: '#4E8F6E', woodBark: '#B98452' } },
  palmBend: { model: 'tree_palmBend', colors: { leafsGreen: '#4E8F6E', woodBark: '#B98452' } },
  palmTall: { model: 'tree_palmTall', colors: { leafsGreen: '#4E8F6E', woodBark: '#B98452' } },
  pillar: { model: 'rock_tallB', colors: { dirt: '#9C6A52', grass: '#7BC98C', _defaultMat: '#9C6A52' } },
  bush: { model: 'plant_bush', colors: { grass: '#5FA877' } },
  bushDetailed: { model: 'plant_bushDetailed', colors: { grass: '#57A072' } },
  bushLarge: { model: 'plant_bushLarge', colors: { grass: '#63AC7A' } },
  fern: { model: 'plant_flatShort', colors: { leafsGreen: '#3E7F62' } },
  grass: { model: 'grass_leafs', colors: { grass: '#5FA877' } },
  flowerRed: { model: 'flower_redA', colors: { grass: '#5FA877', colorRed: '#F6A9A0' } },
  flowerYellow: { model: 'flower_yellowA', colors: { grass: '#5FA877', colorYellow: '#F5E6A6' } },
  mushroom: { model: 'mushroom_redGroup', colors: { _defaultMat: '#F3E9DC', colorRed: '#E07A6E' } },
  mossRock: { model: 'rock_tallA', colors: { dirt: '#A8735A', grass: '#9FD27A', _defaultMat: '#A8735A' } },
  stump: { model: 'stump_old', colors: { woodBark: '#B98452' } },
  waterStone: { model: 'rock_smallA', colors: { dirt: '#9A6750', grass: '#8FC58A' } },
  lily: { model: 'lily_large', colors: { leafsGreen: '#7BC98C', leafsDark: '#4E8F6E', colorRed: '#F6A9A0' } },
}

function Props({ L }: { L: IslandLayoutB }) {
  const groups = useMemo(() => {
    const g: Record<string, Item[]> = {}
    for (const p of L.props) {
      ;(g[p.kind] ??= []).push({ m: mat(p.x, p.y, p.z, p.rot, p.scale, p.scale, p.scale) })
    }
    return g
  }, [L])
  return (
    <>
      {Object.entries(groups).map(([kind, items]) => (
        <Kit key={kind} name={PROP_MODELS[kind].model} items={items} colors={PROP_MODELS[kind].colors} />
      ))}
    </>
  )
}

const TRAIL_LIFT = 0.06

function buildCurve(L: IslandLayoutB) {
  const pts: THREE.Vector3[] = []
  for (let k = 0; k < L.trail.length - 1; k++) {
    const a = new THREE.Vector3(...L.trail[k])
    const b = new THREE.Vector3(...L.trail[k + 1])
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.06))
    for (let s = 0; s < n; s++) pts.push(a.clone().lerp(b, s / n))
  }
  pts.push(new THREE.Vector3(...L.trail[L.trail.length - 1]))
  for (const p of pts) p.y += TRAIL_LIFT
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  curve.arcLengthDivisions = Math.max(2000, pts.length * 8)
  return curve
}

function ribbonGeometry(curve: THREE.Curve<THREE.Vector3>, width: number, lift: number) {
  const n = 700
  const pos: number[] = []
  const idx: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(width / 2)
    const y = p.y - TRAIL_LIFT + lift
    pos.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z)
    if (k < n) {
      const a = k * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function Cairn({ position, accent }: { position: THREE.Vector3; accent: string }) {
  const y = position.y - TRAIL_LIFT
  return (
    <group position={[position.x, y, position.z]} scale={1.45}>
      <mesh position={[0, 0.045, 0]} scale={[1, 0.55, 1]}>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshLambertMaterial color="#D8CFC0" flatShading />
      </mesh>
      <mesh position={[0, 0.12, 0]} scale={[1, 0.6, 1]} rotation={[0, 0.6, 0]}>
        <dodecahedronGeometry args={[0.075, 0]} />
        <meshLambertMaterial color="#E9E2D6" flatShading />
      </mesh>
      <mesh position={[0, 0.185, 0]}>
        <dodecahedronGeometry args={[0.045, 0]} />
        <meshLambertMaterial color={accent} flatShading />
      </mesh>
    </group>
  )
}

function Trail({ L }: { L: IslandLayoutB }) {
  const { curve, tube, ribbon } = useMemo(() => {
    const curve = buildCurve(L)
    return {
      curve,
      tube: new THREE.TubeGeometry(curve, 900, 0.05, 8, false),
      ribbon: ribbonGeometry(curve, 0.24, 0.018),
    }
  }, [L])
  const start = curve.getPointAt(0)
  const end = curve.getPointAt(1)
  return (
    <>
      <mesh geometry={ribbon} receiveShadow>
        <meshLambertMaterial color={PAL.path} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={tube} castShadow receiveShadow>
        <meshLambertMaterial color={PAL.trail} />
      </mesh>
      {[1, 2, 3, 4].map((i) => (
        <Cairn key={i} position={curve.getPointAt(i / 5)} accent={i <= 2 ? '#F2C879' : '#E9E2D6'} />
      ))}
      <group position={[start.x, start.y - TRAIL_LIFT, start.z]}>
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.16, 0.18, 0.024, 20]} />
          <meshLambertMaterial color="#F6A9A0" />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
          <meshLambertMaterial color="#8B6B4A" />
        </mesh>
        <mesh position={[0.06, 0.26, 0]}>
          <boxGeometry args={[0.16, 0.08, 0.02]} />
          <meshLambertMaterial color="#D9B98A" />
        </mesh>
      </group>
      <group position={[end.x, end.y - TRAIL_LIFT, end.z]}>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.06, 7]} />
          <meshLambertMaterial color="#D8CFC0" flatShading />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.6, 6]} />
          <meshLambertMaterial color="#8B6B4A" />
        </mesh>
        <mesh position={[0.13, 0.52, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.09, 0.26, 3]} />
          <meshLambertMaterial color="#F6A9A0" flatShading />
        </mesh>
      </group>
    </>
  )
}

// Water.tsx spins rotation.y on an XYZ-ordered Euler after rotation.x=-PI/2, which tilts the disc over time.
function FlattenHarnessWater() {
  useFrame(({ scene }) => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry instanceof THREE.CircleGeometry && m.geometry.parameters.radius === 60 && m.rotation.order !== 'YXZ') {
        m.rotation.reorder('YXZ')
        m.rotation.set(-Math.PI / 2, 0, 0, 'YXZ')
      }
    })
  })
  return null
}

export default function SpikeB({ seed }: { seed: number }) {
  const L = useMemo(() => buildLayoutB(seed), [seed])
  const gl = useThree((s) => s.gl)
  gl.shadowMap.enabled = true
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  return (
    <>
      <group rotation={[0, L.rotation, 0]}>
        <Terrain L={L} seed={seed} />
        <Beach L={L} seed={seed} />
        <Props L={L} />
        <Trail L={L} />
      </group>
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[-5.9, 10, 2.3]}
        intensity={1.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <FlattenHarnessWater />
    </>
  )
}
