import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, Quaternion, Shape, ShapeGeometry, SphereGeometry, Vector2, Vector3,
} from 'three'
import type { Group } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash01 } from '../../lib/archipelago'
import { CLOUD_COLOR, CLOUD_SHADE_COLOR } from './environmentColors'

// Life around the islands: drifting clouds, circling gulls, sailboats on the open water and hazy islets on the
// horizon. Placed deterministically (hash01) so the scene is the same on every visit. Built for few draw calls: all
// clouds are one mesh, all islets one mesh, each boat one vertex-coloured mesh, and the gulls are instanced.

interface OceanLifeProps {
  /** radius around the origin that holds every island */
  readonly extent: number
  readonly islands: readonly (readonly [number, number])[]
}

const vertexColored = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide })
const cloudMaterial = new MeshLambertMaterial({ color: CLOUD_COLOR, emissive: new Color(CLOUD_SHADE_COLOR), emissiveIntensity: 0.55, flatShading: true })

/** Transforms a geometry and paints it one colour, ready to merge with others. */
function part(geometry: BufferGeometry, matrix: Matrix4, color: string): BufferGeometry {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry).applyMatrix4(matrix)
  const c = new Color(color)
  const count = g.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.deleteAttribute('uv')
  return g
}

const m4 = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(sx, sy, sz))

/** All clouds as one merged mesh; the whole ring drifts slowly around the archipelago, outside the islands. */
function Clouds({ extent }: { extent: number }) {
  const ref = useRef<Group>(null)
  const geometry = useMemo(() => {
    const parts: BufferGeometry[] = []
    for (let c = 0; c < 9; c++) {
      const angle = (c / 9) * Math.PI * 2 + hash01(7, c, 1) * 0.5
      const radius = extent + 6 + hash01(7, c, 2) * 30
      const cx = Math.cos(angle) * radius
      const cz = Math.sin(angle) * radius
      const cy = 8 + hash01(7, c, 3) * 5
      const s = 0.9 + hash01(7, c, 4) * 0.9
      const rot = hash01(7, c, 5) * Math.PI
      const puffs = 4 + Math.floor(hash01(c + 11, 0, 1) * 3)
      for (let i = 0; i < puffs; i++) {
        const lx = ((i - 1.5) * 0.9 + (hash01(c + 11, i, 2) - 0.5) * 0.6) * s
        const lz = (hash01(c + 11, i, 4) - 0.5) * 0.9 * s
        const r = (0.7 + hash01(c + 11, i, 5) * 0.6) * s
        const x = cx + lx * Math.cos(rot) - lz * Math.sin(rot)
        const z = cz + lx * Math.sin(rot) + lz * Math.cos(rot)
        parts.push(new IcosahedronGeometry(1, 1).applyMatrix4(m4(x, cy + hash01(c + 11, i, 3) * 0.35 * s, z, r * 1.2, r * 0.75, r)))
      }
    }
    return mergeGeometries(parts)
  }, [extent])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.006
  })
  return (
    <group ref={ref}>
      <mesh geometry={geometry} material={cloudMaterial} raycast={() => null} />
    </group>
  )
}

const sailShape = new Shape([new Vector2(0, -0.38), new Vector2(0.42, -0.38), new Vector2(0, 0.42)])
const stripeShape = new Shape([new Vector2(0.02, -0.2), new Vector2(0.33, -0.2), new Vector2(0.29, -0.12), new Vector2(0.02, -0.12)])

function sailboatGeometry(): BufferGeometry {
  const sail = new Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0.55, 0.05)
  const stripe = new Matrix4().makeRotationY(Math.PI / 2).setPosition(0.002, 0.55, 0.05)
  return mergeGeometries([
    part(new CylinderGeometry(1, 0.55, 1, 6), m4(0, 0.06, 0, 0.22, 0.12, 0.6), '#8C5A3C'),
    part(new BoxGeometry(), m4(0, 0.125, 0, 0.19, 0.01, 0.5), '#D9B07A'),
    part(new CylinderGeometry(0.015, 0.02, 0.9, 5), m4(0, 0.55, 0.02), '#D9B07A'),
    part(new ShapeGeometry(sailShape), sail, '#FFF8EC'),
    part(new ShapeGeometry(stripeShape), stripe, '#F6A9A0'),
  ])
}

/** Sailboats tack slowly round the archipelago on the open water, bobbing and heeling. */
function Sailboats({ extent }: { extent: number }) {
  const refs = useRef<(Group | null)[]>([])
  const geometry = useMemo(sailboatGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const boats = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        radius: extent + 9 + hash01(3, i, 1) * 12,
        phase: (i / 4) * Math.PI * 2 + hash01(3, i, 2),
        speed: (0.012 + hash01(3, i, 3) * 0.01) * (i % 2 ? 1 : -1),
        scale: 0.9 + hash01(3, i, 4) * 0.4,
      })),
    [extent],
  )
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    boats.forEach((b, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = b.phase + t * b.speed
      g.position.set(Math.cos(a) * b.radius, -0.05 + Math.sin(t * 1.3 + i) * 0.025, Math.sin(a) * b.radius)
      // heading along the circle, heeled a little away from the wind
      g.rotation.set(Math.sin(t * 0.9 + i) * 0.05, -a + (b.speed > 0 ? Math.PI : 0), 0.12 * Math.sign(b.speed) + Math.sin(t * 1.1 + i * 2) * 0.04)
    })
  })
  return (
    <group>
      {boats.map((b, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }} scale={b.scale}>
          <mesh geometry={geometry} material={vertexColored} raycast={() => null} />
        </group>
      ))}
    </group>
  )
}

const wingL = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0.06, 0, 0, -0.06, 0.32, 0.02, -0.02]), 3))
const wingR = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, -0.06, 0, 0, 0.06, -0.32, 0.02, -0.02]), 3))
wingL.computeVertexNormals()
wingR.computeVertexNormals()
const gullBody = new SphereGeometry(1, 6, 4).applyMatrix4(m4(0, -0.01, 0.02, 0.025, 0.025, 0.1))
const gullWhite = new MeshLambertMaterial({ color: '#FFFFFF', side: DoubleSide, flatShading: true })
const gullDark = new MeshLambertMaterial({ color: '#3A3F44', flatShading: true })

/** Small flocks of gulls circling above a few islands, flapping now and then; three instanced draw calls in all. */
function Gulls({ islands }: { islands: readonly (readonly [number, number])[] }) {
  const left = useRef<InstancedMesh>(null)
  const right = useRef<InstancedMesh>(null)
  const body = useRef<InstancedMesh>(null)
  const birds = useMemo(() => {
    const hosts = islands.length ? islands.slice(0, 3) : [[0, 0] as const]
    return hosts.flatMap(([x, z], h) =>
      Array.from({ length: 3 }, (_, i) => ({
        cx: x, cz: z,
        radius: 2.6 + hash01(9, h * 3 + i, 1) * 1.6,
        height: 2.6 + hash01(9, h * 3 + i, 2) * 0.8,
        phase: hash01(9, h * 3 + i, 3) * Math.PI * 2,
        speed: 0.35 + hash01(9, h * 3 + i, 4) * 0.2,
      })),
    )
  }, [islands])
  const tmp = useMemo(() => ({ bird: new Object3D(), wing: new Object3D(), m: new Matrix4() }), [])
  useFrame(({ clock }) => {
    if (!left.current || !right.current || !body.current) return
    const t = clock.elapsedTime
    birds.forEach((b, i) => {
      const a = b.phase + t * b.speed
      tmp.bird.position.set(b.cx + Math.cos(a) * b.radius, b.height + Math.sin(t * 0.7 + i) * 0.15, b.cz + Math.sin(a) * b.radius)
      tmp.bird.rotation.set(0, -a, 0.35)
      tmp.bird.scale.setScalar(0.55)
      tmp.bird.updateMatrix()
      body.current!.setMatrixAt(i, tmp.bird.matrix)
      const flap = Math.sin(t * 7 + i * 1.7) * (0.5 + 0.5 * Math.sin(t * 0.8 + i)) * 0.6
      for (const [mesh, sign] of [[left.current!, 1], [right.current!, -1]] as const) {
        tmp.wing.rotation.set(0, 0, flap * sign)
        tmp.wing.updateMatrix()
        mesh.setMatrixAt(i, tmp.m.multiplyMatrices(tmp.bird.matrix, tmp.wing.matrix))
      }
    })
    left.current.instanceMatrix.needsUpdate = right.current.instanceMatrix.needsUpdate = body.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={left} args={[wingL, gullWhite, birds.length]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={right} args={[wingR, gullWhite, birds.length]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={body} args={[gullBody, gullDark, birds.length]} frustumCulled={false} raycast={() => null} />
    </group>
  )
}

/** Hazy islets far out on the water, so the horizon isn't empty; one merged mesh, faded into the sky by the fog. */
function Islets({ extent }: { extent: number }) {
  const geometry = useMemo(() => {
    const parts: BufferGeometry[] = []
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + hash01(5, i, 1) * 0.4
      const radius = extent + 70 + hash01(5, i, 2) * 90
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const h = 2 + hash01(5, i, 3) * 5
      const w = 4 + hash01(5, i, 4) * 6
      parts.push(part(new ConeGeometry(1, 1, 7, 1), m4(x, -0.2, z, w, h, w * 0.7), '#7FA3A3'))
      if (hash01(5, i, 5) > 0.4) {
        parts.push(part(new SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m4(x, -0.2 + h * 0.18, z, w * 0.75, h * 0.35, w * 0.55), '#86B79A'))
      }
    }
    return mergeGeometries(parts)
  }, [extent])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={vertexColored} raycast={() => null} />
}

export function OceanLife({ extent, islands }: OceanLifeProps) {
  return (
    <>
      <Clouds extent={extent} />
      <Sailboats extent={extent} />
      <Gulls islands={islands} />
      <Islets extent={extent} />
    </>
  )
}
