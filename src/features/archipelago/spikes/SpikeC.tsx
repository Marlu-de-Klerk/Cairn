// Spike C: terraced heightfield island with a carved, walkable trail.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PCFSoftShadowMap,
  Quaternion,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three'
import { buildIslandLayout, type IslandLayout, type PropPlacement } from './spikeC-layout'
import { buildTerrainGeometry, buildWaterfallGeometry } from './spikeC-terrain'

const M = '/models/spikeC/'

type Recolor = Record<string, string>

const PALM: Recolor = { woodBark: '#B98452', leafsGreen: '#4E9A6E' }
const CANOPY: Recolor = { woodBark: '#8E6A4A', leafsGreen: '#3F7F86' }
const BUSH: Recolor = { grass: '#4F9A68' }
const FERN: Recolor = { leafsGreen: '#3E7F63' }
const GRASS: Recolor = { grass: '#5AA571' }
const FLOWER: Recolor = { grass: '#5FA877', colorRed: '#F6A9A0', colorYellow: '#F7E08A', colorPurple: '#C3B0E6' }
const SEA_ROCK: Recolor = { dirt: '#9C6A52', grass: '#9C6A52' }
const WOOD: Recolor = { woodBark: '#A8704E', woodInner: '#E3C49A', grass: '#7BC98C' }
const TENT: Recolor = { colorRed: '#F6A9A0', colorRedDark: '#D98A80', wood: '#B98452' }
const STONE: Recolor = { stone: '#C9C2B4', _defaultMat: '#F4EBDD', colorRed: '#E98C7E' }
const MOSS: Recolor = { grass: '#3F7F5E' }

const SELF_LIGHT = 0.28

const matCache = new Map<string, MeshLambertMaterial>()
function lambert(hex: string) {
  let m = matCache.get(hex)
  if (!m) {
    m = new MeshLambertMaterial({ color: new Color(hex), emissive: new Color(hex).multiplyScalar(SELF_LIGHT), flatShading: true })
    matCache.set(hex, m)
  }
  return m
}

function placementMatrix(p: PropPlacement) {
  const q = new Quaternion().setFromEuler(new Euler(p.tiltX ?? 0, p.rotY, p.tiltZ ?? 0, 'YXZ'))
  return new Matrix4().compose(new Vector3(p.x, p.y, p.z), q, new Vector3(p.scale, p.scale, p.scale))
}

function KenneyInstances({ file, placements, recolor }: { file: string; placements: PropPlacement[]; recolor: Recolor }) {
  const { scene } = useGLTF(M + file)
  const meshes = useMemo(() => {
    if (placements.length === 0) return []
    scene.updateMatrixWorld(true)
    const out: InstancedMesh[] = []
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as Material & { name: string; color?: Color }
      const hex = recolor[src.name] ?? `#${src.color?.getHexString() ?? 'ffffff'}`
      const inst = new InstancedMesh(mesh.geometry, lambert(hex), placements.length)
      placements.forEach((p, i) => inst.setMatrixAt(i, placementMatrix(p).multiply(mesh.matrixWorld)))
      inst.instanceMatrix.needsUpdate = true
      inst.castShadow = true
      inst.receiveShadow = true
      inst.computeBoundingSphere()
      out.push(inst)
    })
    return out
  }, [scene, placements, recolor])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

function split<T>(list: T[] | undefined, n: number, k: number) {
  return (list ?? []).filter((_, i) => i % n === k)
}

function Props({ layout }: { layout: IslandLayout }) {
  const p = layout.props
  const mossPlacements = useMemo<PropPlacement[]>(
    () =>
      layout.moss.map((m) => {
        const s = m.scale
        const ox = Math.sin(m.rotY)
        const oz = Math.cos(m.rotY)
        return { x: m.x + ox * (0.012 - 0.485 * s), y: m.y - 0.48 * s + 0.01, z: m.z + oz * (0.012 - 0.485 * s), rotY: m.rotY, scale: s }
      }),
    [layout],
  )
  const waterRockPlacements = useMemo<PropPlacement[]>(
    () => layout.waterRocks.map((w, i) => ({ x: w.x, y: -0.13, z: w.z, rotY: i * 1.7, scale: w.r })),
    [layout],
  )
  const groups = useMemo(
    () => ({
      palm: [split(p.palm, 3, 0), split(p.palm, 3, 1), split(p.palm, 3, 2)],
      canopy: [split(p.canopy, 2, 0), split(p.canopy, 2, 1)],
      bush: [split(p.bush, 2, 0), split(p.bush, 2, 1), p.bushEdge ?? []],
      fern: [split(p.fern, 2, 0), split(p.fern, 2, 1)],
      grass: [split(p.grass, 2, 0), split(p.grass, 2, 1)],
      flower: [split(p.flower, 3, 0), split(p.flower, 3, 1), split(p.flower, 3, 2)],
      rocks: [split(waterRockPlacements, 2, 0), split(waterRockPlacements, 2, 1)],
    }),
    [p, waterRockPlacements],
  )
  return (
    <>
      <KenneyInstances file="tree_palm.glb" placements={groups.palm[0]} recolor={PALM} />
      <KenneyInstances file="tree_palmTall.glb" placements={groups.palm[1]} recolor={PALM} />
      <KenneyInstances file="tree_palmBend.glb" placements={groups.palm[2]} recolor={PALM} />
      <KenneyInstances file="tree_fat.glb" placements={groups.canopy[0]} recolor={CANOPY} />
      <KenneyInstances file="tree_oak.glb" placements={groups.canopy[1]} recolor={CANOPY} />
      <KenneyInstances file="plant_bush.glb" placements={groups.bush[0]} recolor={BUSH} />
      <KenneyInstances file="plant_bushLarge.glb" placements={groups.bush[1]} recolor={BUSH} />
      <KenneyInstances file="plant_bushDetailed.glb" placements={groups.bush[2]} recolor={BUSH} />
      <KenneyInstances file="plant_flatShort.glb" placements={groups.fern[0]} recolor={FERN} />
      <KenneyInstances file="plant_flatTall.glb" placements={groups.fern[1]} recolor={FERN} />
      <KenneyInstances file="grass_leafs.glb" placements={groups.grass[0]} recolor={GRASS} />
      <KenneyInstances file="grass_leafsLarge.glb" placements={groups.grass[1]} recolor={GRASS} />
      <KenneyInstances file="flower_redA.glb" placements={groups.flower[0]} recolor={FLOWER} />
      <KenneyInstances file="flower_yellowA.glb" placements={groups.flower[1]} recolor={FLOWER} />
      <KenneyInstances file="flower_purpleA.glb" placements={groups.flower[2]} recolor={FLOWER} />
      <KenneyInstances file="mushroom_redGroup.glb" placements={p.mushroom ?? []} recolor={STONE} />
      <KenneyInstances file="log.glb" placements={p.log ?? []} recolor={WOOD} />
      <KenneyInstances file="stump_old.glb" placements={p.stump_old ?? []} recolor={WOOD} />
      <KenneyInstances file="tent_smallOpen.glb" placements={p.tent_smallOpen ?? []} recolor={TENT} />
      <KenneyInstances file="campfire_stones.glb" placements={p.campfire_stones ?? []} recolor={STONE} />
      <KenneyInstances file="hanging_moss.glb" placements={mossPlacements} recolor={MOSS} />
      <KenneyInstances file="rock_smallA.glb" placements={groups.rocks[0]} recolor={SEA_ROCK} />
      <KenneyInstances file="rock_smallC.glb" placements={groups.rocks[1]} recolor={SEA_ROCK} />
      <WaterRockFoam layout={layout} />
      {(p.rock_largeA ?? []).map((r, i) => (
        <MossMound key={i} p={r} />
      ))}
    </>
  )
}

function MossMound({ p }: { p: PropPlacement }) {
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.rotY, 0]} scale={p.scale * 0.1}>
      <mesh position={[0, 0.55, 0]} scale={[1.25, 0.95, 1.1]} castShadow receiveShadow material={lambert('#A8735A')}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <mesh position={[0.05, 1.28, 0.02]} scale={[0.85, 0.32, 0.75]} castShadow material={lambert('#9FD27A')}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}

function WaterRockFoam({ layout }: { layout: IslandLayout }) {
  const mesh = useMemo(() => {
    const geo = new CircleGeometry(1, 20).rotateX(-Math.PI / 2)
    const inst = new InstancedMesh(geo, new MeshBasicMaterial({ color: '#FFFFFF' }), Math.max(1, layout.waterRocks.length))
    const o = new Object3D()
    layout.waterRocks.forEach((w, i) => {
      o.position.set(w.x, -0.041, w.z)
      o.scale.setScalar(0.2 * w.r)
      o.updateMatrix()
      inst.setMatrixAt(i, o.matrix)
    })
    inst.count = layout.waterRocks.length
    return inst
  }, [layout])
  return <primitive object={mesh} />
}

const TRAIL_CLEARANCE = 0.055

function Trail({ layout }: { layout: IslandLayout }) {
  const { curve, tube } = useMemo(() => {
    const pts: Vector3[] = []
    let lastS = -1
    for (const p of layout.path) {
      if (p.s - lastS >= 0.12 || p === layout.path[layout.path.length - 1]) {
        pts.push(new Vector3(p.x, p.y + TRAIL_CLEARANCE, p.z))
        lastS = p.s
      }
    }
    const c = new CatmullRomCurve3(pts, false, 'centripetal')
    return { curve: c, tube: new TubeGeometry(c, 480, 0.05, 8, false) }
  }, [layout])
  const milestones = [1, 2, 3, 4].map((i) => curve.getPointAt(i / 5))
  const start = curve.getPointAt(0)
  const end = curve.getPointAt(1)
  const colors = ['#FFD27A', '#FFD27A', '#F6A9A0', '#F4F1EA']
  return (
    <group>
      <mesh geometry={tube}>
        <meshLambertMaterial color="#FFF1CF" emissive="#6B5320" emissiveIntensity={0.25} />
      </mesh>
      {milestones.map((m, i) => (
        <group key={i} position={[m.x, m.y - TRAIL_CLEARANCE, m.z]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.13, 0.15, 0.06, 12]} />
            <meshLambertMaterial color="#EDE6D6" />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <sphereGeometry args={[0.1, 14, 12]} />
            <meshLambertMaterial color={colors[i]} emissive={colors[i]} emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
      <group position={[start.x, start.y - TRAIL_CLEARANCE, start.z]}>
        {[
          [0.13, 0.05],
          [0.1, 0.13],
          [0.07, 0.2],
        ].map(([r, y], i) => (
          <mesh key={i} position={[0, y, 0]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[r, 10, 8]} />
            <meshLambertMaterial color="#D9D2C3" flatShading />
          </mesh>
        ))}
      </group>
      <Flag position={[end.x, end.y - TRAIL_CLEARANCE, end.z]} />
    </group>
  )
}

function Flag({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.6, 6]} />
        <meshLambertMaterial color="#8E6A4A" />
      </mesh>
      <mesh position={[0.13, 0.5, 0]}>
        <boxGeometry args={[0.24, 0.15, 0.015]} />
        <meshLambertMaterial color="#F6A9A0" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.04, 10]} />
        <meshLambertMaterial color="#D9D2C3" />
      </mesh>
    </group>
  )
}

// Water.tsx spins its disc with rotation.y on an X-rotated mesh, which tilts the
// plane over time (0.4 rad after the 20 s render budget) and floods one side of
// the island. Keep it level while this spike is mounted.
function LevelWater() {
  const scene = useThree((s) => s.scene)
  useFrame(() => {
    scene.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && m.geometry?.type === 'CircleGeometry' && (m.geometry as CircleGeometry).parameters.radius === 60) m.rotation.y = 0
    })
  })
  return null
}

function Lighting() {
  const gl = useThree((s) => s.gl)
  useMemo(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = PCFSoftShadowMap
  }, [gl])
  return (
    <>
      <directionalLight
        position={[-4, 12, 7]}
        intensity={0.7}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
    </>
  )
}

// The island brightens itself instead of adding scene lights, so the shared water keeps its token colour.
function selfLitVertexColors() {
  const m = new MeshLambertMaterial({ vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * ${SELF_LIGHT.toFixed(3)};`,
    )
  }
  return m
}

export default function SpikeC({ seed }: { seed: number }) {
  const layout = useMemo(() => buildIslandLayout(seed), [seed])
  const terrain = useMemo(() => buildTerrainGeometry(layout), [layout])
  const waterfall = useMemo(() => buildWaterfallGeometry(layout), [layout])
  const landMat = useMemo(() => selfLitVertexColors(), [])
  return (
    <group>
      <Lighting />
      <LevelWater />
      <mesh geometry={terrain.land} material={landMat} castShadow receiveShadow />
      <mesh geometry={terrain.flat}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh geometry={waterfall}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <Props layout={layout} />
      <Trail layout={layout} />
    </group>
  )
}
