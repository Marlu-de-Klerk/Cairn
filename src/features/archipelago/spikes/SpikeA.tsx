// Spike A: procedural extruded terraces. Throwaway prototype.
import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TRAIL_CLEARANCE, buildIslandLayout, type IslandLayout, type PropKind } from './spikeA-layout'
import {
  PALETTE,
  buildBeachGeometry,
  buildCliffDecorGeometry,
  buildFoamGeometry,
  buildHaloGeometry,
  buildPillarGeometry,
  buildRampGeometry,
  buildRockFoamGeometry,
  buildTierGeometry,
  buildWaterfallGeometry,
} from './spikeA-geometry'

const FACE_CAMERA_YAW = Math.atan2(9, 11)

const PROP_FILES: Record<PropKind, string> = {
  palmTall: 'tree_palmTall',
  palmBend: 'tree_palmBend',
  palmDetailed: 'tree_palmDetailedTall',
  darkTree: 'tree_fat',
  roundTree: 'tree_default',
  bush: 'plant_bush',
  bushBig: 'plant_bushDetailed',
  fern: 'plant_flatShort',
  fernTall: 'plant_flatTall',
  stump: 'stump_roundDetailed',
  heroRock: 'rock_largeA',
  flower: 'flower_redA',
  mushroom: 'mushroom_redGroup',
  grassTuft: 'grass_leafsLarge',
  lily: 'lily_large',
  log: 'log',
}

const PALM = { leafsGreen: '#4E9A6C', woodBark: '#B98452' }
const PROP_COLORS: Record<PropKind, Record<string, string>> = {
  palmTall: PALM,
  palmBend: PALM,
  palmDetailed: PALM,
  darkTree: { leafsGreen: '#3F7F86', woodBark: '#8B6B4A' },
  roundTree: { leafsGreen: '#43877A', woodBark: '#8B6B4A' },
  bush: { grass: '#5FA877' },
  bushBig: { grass: '#57A073' },
  fern: { leafsGreen: '#3E7F62' },
  fernTall: { leafsGreen: '#447F5E' },
  stump: { woodBark: '#B98452', woodInner: '#E3B884' },
  heroRock: { dirt: '#A8735A', grass: '#9FD27A' },
  flower: { grass: '#5FA877', colorRed: '#F6A9A0' },
  mushroom: { _defaultMat: '#F4EBDD', colorRed: '#E9776B' },
  grassTuft: { grass: '#62AE78' },
  lily: { leafsGreen: '#5FA877', colorRed: '#F6A9A0', leafsDark: '#3E7F62' },
  log: { woodBark: '#B98452', woodInner: '#E3B884' },
}

const PROCEDURAL: PropKind[] = ['darkTree', 'roundTree']
const KINDS = (Object.keys(PROP_FILES) as PropKind[]).filter((k) => !PROCEDURAL.includes(k))
for (const k of KINDS) useGLTF.preload(`/models/spikeA/${PROP_FILES[k]}.glb`)

function terrainMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
}

function PropSet({ kind, layout }: { kind: PropKind; layout: IslandLayout }) {
  const gltf = useGLTF(`/models/spikeA/${PROP_FILES[kind]}.glb`)
  const items = useMemo(() => layout.props.filter((p) => p.kind === kind), [layout, kind])
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      const name = mats[0]?.name ?? ''
      const hex = PROP_COLORS[kind][name] ?? '#7FB08A'
      out.push({ geometry: m.geometry, material: new THREE.MeshLambertMaterial({ color: hex, flatShading: true }), matrix: m.matrixWorld.clone() })
    })
    return out
  }, [gltf, kind])

  const meshes = useMemo(() => {
    if (!items.length) return []
    return parts.map((part) => {
      const im = new THREE.InstancedMesh(part.geometry, part.material, items.length)
      items.forEach((p, i) => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tiltX ?? 0, p.rot, p.tiltZ ?? 0, 'XYZ'))
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y + 0.05 * p.scale - 0.015, p.z),
          q,
          new THREE.Vector3(p.scale, p.scale * (p.scaleY ?? 1), p.scale),
        )
        m.multiply(part.matrix)
        im.setMatrixAt(i, m)
      })
      im.castShadow = true
      im.receiveShadow = true
      im.instanceMatrix.needsUpdate = true
      return im
    })
  }, [parts, items])

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

function Trail({ layout }: { layout: IslandLayout }) {
  const data = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      layout.trail.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'centripetal',
    )
    const tube = new THREE.TubeGeometry(curve, 600, 0.045, 8, false)

    const samples = curve.getSpacedPoints(500)
    const pos: number[] = []
    const idx: number[] = []
    const half = 0.12
    samples.forEach((p, i) => {
      const t = curve.getTangentAt(i / 500)
      const side = new THREE.Vector3(-t.z, 0, t.x).normalize()
      for (const s of [-1, 1]) {
        const x = p.x + side.x * half * s
        const z = p.z + side.z * half * s
        const gy = Math.min(layout.groundHeightAt(x, z), p.y - TRAIL_CLEARANCE + 0.03)
        pos.push(x, Math.max(gy, p.y - TRAIL_CLEARANCE - 0.03) + 0.012, z)
      }
      if (i < samples.length - 1) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
    const ribbon = new THREE.BufferGeometry()
    ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    ribbon.setIndex(idx)
    ribbon.computeVertexNormals()

    const milestones = [1, 2, 3, 4].map((i) => curve.getPointAt(i / 5))
    const start = curve.getPointAt(0)
    const end = curve.getPointAt(1)
    return { tube, ribbon, milestones, start, end }
  }, [layout])

  return (
    <group>
      <mesh geometry={data.ribbon} receiveShadow>
        <meshLambertMaterial color={PALETTE.path} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={data.tube} castShadow>
        <meshLambertMaterial color="#FFF1CF" emissive="#6b5530" emissiveIntensity={0.15} />
      </mesh>
      {data.milestones.map((p, i) => (
        <group key={i} position={[p.x, p.y - TRAIL_CLEARANCE, p.z]}>
          <group scale={1.3}>
            <Cairn done={i < 2} />
          </group>
        </group>
      ))}
      <group position={[data.start.x, data.start.y - TRAIL_CLEARANCE, data.start.z]}>
        <mesh position={[0, 0.01, 0]} receiveShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.03, 12]} />
          <meshLambertMaterial color="#E8E2D4" />
        </mesh>
        <mesh position={[0.12, 0.16, 0]} castShadow>
          <boxGeometry args={[0.035, 0.32, 0.035]} />
          <meshLambertMaterial color={PALETTE.wood} />
        </mesh>
        <mesh position={[0.12, 0.27, 0.05]} castShadow>
          <boxGeometry args={[0.03, 0.08, 0.16]} />
          <meshLambertMaterial color="#D8A56E" />
        </mesh>
      </group>
      <group position={[data.end.x, data.end.y - TRAIL_CLEARANCE, data.end.z]}>
        <SummitFlag />
      </group>
    </group>
  )
}

function Camp({ layout }: { layout: IslandLayout }) {
  const tent = useMemo(() => {
    const w = 0.13
    const h = 0.2
    const d = 0.3
    const v = [
      [-w, 0, -d / 2], [w, 0, -d / 2], [0, h, -d / 2],
      [-w, 0, d / 2], [w, 0, d / 2], [0, h, d / 2],
    ]
    const tris = [[0, 2, 5], [0, 5, 3], [1, 4, 5], [1, 5, 2], [0, 1, 2], [3, 5, 4]]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap((i) => v[i]), 3))
    g.computeVertexNormals()
    return g
  }, [])
  if (!layout.camp) return null
  const { x, y, z, rot } = layout.camp
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh geometry={tent} position={[-0.12, 0, -0.04]} castShadow receiveShadow>
        <meshLambertMaterial color="#F6A9A0" flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.12, 0.012, 0.1]} receiveShadow>
        <cylinderGeometry args={[0.07, 0.075, 0.024, 8]} />
        <meshLambertMaterial color="#CFC6B4" flatShading />
      </mesh>
      <mesh position={[0.12, 0.06, 0.1]}>
        <coneGeometry args={[0.035, 0.09, 5]} />
        <meshBasicMaterial color="#F7B35B" />
      </mesh>
      <mesh position={[0.12, 0.2, 0.1]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshBasicMaterial color="#E6EEEE" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

function SummitFlag() {
  const pennant = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, 0, 0.36, 0, 0.22, 0.44, 0.02], 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group>
      <mesh position={[0, 0.03, 0]} scale={[1, 0.45, 1]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshLambertMaterial color="#CFC6B4" flatShading />
      </mesh>
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.013, 0.016, 0.5, 6]} />
        <meshLambertMaterial color="#8B6B4A" />
      </mesh>
      <mesh geometry={pennant} castShadow>
        <meshLambertMaterial color="#F28C7F" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

const CANOPY_BLOBS: [number, number, number, number][][] = [
  [
    [0, 0.62, 0, 0.3],
    [0.2, 0.52, 0.06, 0.21],
    [-0.19, 0.54, -0.07, 0.22],
    [0.03, 0.86, -0.03, 0.2],
    [0.02, 0.5, 0.2, 0.18],
  ],
  [
    [0, 0.58, 0, 0.27],
    [0.17, 0.72, -0.04, 0.2],
    [-0.15, 0.48, 0.1, 0.19],
    [-0.06, 0.8, 0.12, 0.16],
  ],
]

function canopyGeometry(variant: number, leaf: string, rimLeaf: string) {
  const parts: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    g.deleteAttribute('uv')
    return g
  }
  parts.push(paint(new THREE.CylinderGeometry(0.04, 0.065, 0.5, 6).translate(0, 0.25, 0).toNonIndexed(), '#8B6B4A'))
  CANOPY_BLOBS[variant].forEach(([x, y, z, r], i) => {
    parts.push(paint(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), i === 3 ? rimLeaf : leaf))
  })
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

function CanopyTrees({ layout }: { layout: IslandLayout }) {
  const meshes = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    const groups: [PropKind, string, string][] = [
      ['darkTree', '#3F7F86', '#4E8F96'],
      ['roundTree', '#4A8E78', '#5A9E86'],
    ]
    return groups.flatMap(([kind, leaf, rim], gi) => {
      const items = layout.props.filter((p) => p.kind === kind)
      return [0, 1].map((variant) => {
        const mine = items.filter((_, i) => i % 2 === variant)
        const im = new THREE.InstancedMesh(canopyGeometry(variant, leaf, rim), mat, Math.max(1, mine.length))
        mine.forEach((p, i) => {
          const s = p.scale * (gi === 0 ? 1.15 : 1.0)
          im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(s, s, s)))
        })
        im.count = mine.length
        im.castShadow = true
        im.receiveShadow = true
        return im
      })
    })
  }, [layout])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

function Cairn({ done }: { done: boolean }) {
  const stone = done ? '#F2D48A' : '#E8E2D4'
  return (
    <group>
      <mesh position={[0, 0.05, 0]} scale={[1, 0.55, 1]} castShadow>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshLambertMaterial color="#CFC6B4" flatShading />
      </mesh>
      <mesh position={[0, 0.13, 0]} scale={[1, 0.6, 1]} castShadow>
        <dodecahedronGeometry args={[0.075, 0]} />
        <meshLambertMaterial color={stone} flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0]} scale={[1, 0.7, 1]} castShadow>
        <dodecahedronGeometry args={[0.05, 0]} />
        <meshLambertMaterial color={stone} flatShading emissive={done ? '#8a6a20' : '#000000'} emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

function Terrain({ layout }: { layout: IslandLayout }) {
  const geo = useMemo(() => {
    const ramps = buildRampGeometry(layout)
    return {
      tiers: [...layout.tiers.map((_, k) => buildTierGeometry(layout, k)), ...(layout.shelf ? [buildTierGeometry(layout, 2, layout.shelf)] : [])],
      beach: buildBeachGeometry(layout),
      foam: buildFoamGeometry(layout),
      halo: buildHaloGeometry(layout),
      ramps,
      pillars: buildPillarGeometry(layout),
      rockFoam: buildRockFoamGeometry(layout),
      waterfall: buildWaterfallGeometry(layout),
      decor: buildCliffDecorGeometry(layout),
    }
  }, [layout])
  const mat = useMemo(terrainMaterial, [])
  const cleats = useMemo(() => {
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.03, 0.045),
      new THREE.MeshLambertMaterial({ color: PALETTE.wood }),
      Math.max(1, geo.ramps.cleats.length),
    )
    geo.ramps.cleats.forEach((m, i) => im.setMatrixAt(i, m))
    im.count = geo.ramps.cleats.length
    im.castShadow = true
    im.receiveShadow = true
    return im
  }, [geo])

  return (
    <group>
      {geo.tiers.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />
      ))}
      <mesh geometry={geo.beach} material={mat} receiveShadow />
      <mesh geometry={geo.ramps.geometry} material={mat} castShadow receiveShadow />
      <primitive object={cleats} />
      <mesh geometry={geo.pillars} material={mat} castShadow receiveShadow />
      <mesh geometry={geo.decor} material={mat} />
      {geo.waterfall && (
        <mesh geometry={geo.waterfall}>
          <meshBasicMaterial vertexColors />
        </mesh>
      )}
      <mesh geometry={geo.foam}>
        <meshBasicMaterial color={PALETTE.foam} />
      </mesh>
      <mesh geometry={geo.rockFoam}>
        <meshBasicMaterial color={PALETTE.foam} />
      </mesh>
      <mesh geometry={geo.halo} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

function Lighting() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
  }, [gl])
  // Water.tsx spins via rotation.y on a disc already rotated -PI/2 about X, which in XYZ
  // order tilts the disc over time; YXZ turns the same spin into a flat in-plane rotation.
  useFrame(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry instanceof THREE.CircleGeometry && m.geometry.parameters.radius === 60) m.rotation.order = 'YXZ'
    })
  })
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e0', 0.9)
    l.position.set(-9, 10, 1)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera
    c.left = -6
    c.right = 6
    c.top = 6
    c.bottom = -6
    c.near = 1
    c.far = 30
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return <primitive object={light} />
}

export default function SpikeA({ seed }: { seed: number }) {
  const layout = useMemo(() => buildIslandLayout(seed), [seed])
  const mirror = seed % 2 === 0 ? -1 : 1
  return (
    <>
      <Lighting />
      <group rotation={[0, FACE_CAMERA_YAW, 0]}>
        <group scale={[mirror, 1, 1]}>
          <Terrain layout={layout} />
          {KINDS.map((k) => (
            <PropSet key={k} kind={k} layout={layout} />
          ))}
          <CanopyTrees layout={layout} />
          <Camp layout={layout} />
          <Trail layout={layout} />
        </group>
      </group>
    </>
  )
}
