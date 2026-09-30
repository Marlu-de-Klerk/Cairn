import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, MeshLambertMaterial, Shape, Vector2 } from 'three'
import type { Group } from 'three'
import { hash01 } from '../../lib/archipelago'
import { CLOUD_COLOR, CLOUD_SHADE_COLOR } from './environmentColors'

// Life around the islands: drifting clouds, circling gulls, sailboats on the open water and hazy islets on the
// horizon. Everything is placed deterministically (hash01) so the scene is the same on every visit, and animates in
// useFrame — which, under the focused view's demand frameloop, only runs when something else requests a frame.

interface OceanLifeProps {
  /** radius around the origin that holds every island */
  readonly extent: number
  readonly islands: readonly (readonly [number, number])[]
}

const cloudMaterial = new MeshLambertMaterial({ color: CLOUD_COLOR, emissive: new Color(CLOUD_SHADE_COLOR), emissiveIntensity: 0.55, flatShading: true })
const hullMaterial = new MeshLambertMaterial({ color: '#8C5A3C', flatShading: true })
const deckMaterial = new MeshLambertMaterial({ color: '#D9B07A', flatShading: true })
const sailMaterial = new MeshLambertMaterial({ color: '#FFF8EC', side: DoubleSide, flatShading: true })
const stripeMaterial = new MeshLambertMaterial({ color: '#F6A9A0', side: DoubleSide, flatShading: true })
const gullMaterial = new MeshLambertMaterial({ color: '#FFFFFF', side: DoubleSide, flatShading: true })
const gullTipMaterial = new MeshLambertMaterial({ color: '#3A3F44', side: DoubleSide, flatShading: true })
const isletRock = new MeshLambertMaterial({ color: '#7FA3A3', flatShading: true })
const isletGreen = new MeshLambertMaterial({ color: '#86B79A', flatShading: true })

function Cloud({ seed }: { seed: number }) {
  const puffs = useMemo(
    () =>
      Array.from({ length: 4 + Math.floor(hash01(seed, 0, 1) * 3) }, (_, i) => ({
        x: (i - 1.5) * 0.9 + (hash01(seed, i, 2) - 0.5) * 0.6,
        y: hash01(seed, i, 3) * 0.35,
        z: (hash01(seed, i, 4) - 0.5) * 0.9,
        r: 0.7 + hash01(seed, i, 5) * 0.6,
      })),
    [seed],
  )
  return (
    <group>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} scale={[p.r * 1.2, p.r * 0.75, p.r]} material={cloudMaterial} raycast={() => null}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}

/** Clouds drift slowly around the archipelago, low enough to be seen from above but outside the islands' ring. */
function Clouds({ extent }: { extent: number }) {
  const ref = useRef<Group>(null)
  const clouds = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const angle = (i / 9) * Math.PI * 2 + hash01(7, i, 1) * 0.5
        const radius = extent + 6 + hash01(7, i, 2) * 30
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: 8 + hash01(7, i, 3) * 5, s: 0.9 + hash01(7, i, 4) * 0.9, rot: hash01(7, i, 5) * Math.PI }
      }),
    [extent],
  )
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.006
  })
  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} rotation={[0, c.rot, 0]} scale={c.s}>
          <Cloud seed={i + 11} />
        </group>
      ))}
    </group>
  )
}

function Sailboat() {
  return (
    <group>
      <mesh material={hullMaterial} position={[0, 0.06, 0]} scale={[0.22, 0.12, 0.6]} raycast={() => null}>
        <cylinderGeometry args={[1, 0.55, 1, 6]} />
      </mesh>
      <mesh material={deckMaterial} position={[0, 0.125, 0]} scale={[0.19, 0.01, 0.5]} raycast={() => null}>
        <boxGeometry />
      </mesh>
      <mesh material={deckMaterial} position={[0, 0.55, 0.02]} raycast={() => null}>
        <cylinderGeometry args={[0.015, 0.02, 0.9, 5]} />
      </mesh>
      <mesh material={sailMaterial} position={[0, 0.55, 0.05]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <shapeGeometry args={[sailShape]} />
      </mesh>
      <mesh material={stripeMaterial} position={[0.001, 0.55, 0.05]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <shapeGeometry args={[stripeShape]} />
      </mesh>
    </group>
  )
}

const sailShape = new Shape([new Vector2(0, -0.38), new Vector2(0.42, -0.38), new Vector2(0, 0.42)])
const stripeShape = new Shape([new Vector2(0.02, -0.2), new Vector2(0.33, -0.2), new Vector2(0.29, -0.12), new Vector2(0.02, -0.12)])

/** Sailboats tack slowly round the archipelago on the open water, bobbing and heeling. */
function Sailboats({ extent }: { extent: number }) {
  const refs = useRef<(Group | null)[]>([])
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
          <Sailboat />
        </group>
      ))}
    </group>
  )
}

function Gull() {
  return (
    <group>
      <mesh material={gullMaterial} raycast={() => null} name="wingL">
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0.06, 0, 0, -0.06, 0.32, 0.02, -0.02]), 3]} />
        </bufferGeometry>
      </mesh>
      <mesh material={gullMaterial} raycast={() => null} name="wingR">
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, -0.06, 0, 0, 0.06, -0.32, 0.02, -0.02]), 3]} />
        </bufferGeometry>
      </mesh>
      <mesh material={gullTipMaterial} position={[0, -0.01, 0.02]} scale={[0.025, 0.025, 0.1]} raycast={() => null}>
        <sphereGeometry args={[1, 6, 4]} />
      </mesh>
    </group>
  )
}

/** Small flocks of gulls circling above a few islands, flapping now and then. */
function Gulls({ islands }: { islands: readonly (readonly [number, number])[] }) {
  const refs = useRef<(Group | null)[]>([])
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
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    birds.forEach((b, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = b.phase + t * b.speed
      g.position.set(b.cx + Math.cos(a) * b.radius, b.height + Math.sin(t * 0.7 + i) * 0.15, b.cz + Math.sin(a) * b.radius)
      g.rotation.set(0, -a, 0.35)
      const flap = Math.sin(t * 7 + i * 1.7) * (0.5 + 0.5 * Math.sin(t * 0.8 + i)) * 0.6
      const [l, r] = [g.children[0].children[0], g.children[0].children[1]]
      l.rotation.z = flap
      r.rotation.z = -flap
    })
  })
  return (
    <group>
      {birds.map((_, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }} scale={0.55}>
          <Gull />
        </group>
      ))}
    </group>
  )
}

/** Hazy islets far out on the water, so the horizon isn't empty; the scene fog fades them into the sky. */
function Islets({ extent }: { extent: number }) {
  const islets = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2 + hash01(5, i, 1) * 0.4
        const radius = extent + 70 + hash01(5, i, 2) * 90
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, h: 2 + hash01(5, i, 3) * 5, w: 4 + hash01(5, i, 4) * 6, green: hash01(5, i, 5) > 0.4 }
      }),
    [extent],
  )
  return (
    <group>
      {islets.map((s, i) => (
        <group key={i} position={[s.x, -0.2, s.z]}>
          <mesh material={isletRock} scale={[s.w, s.h, s.w * 0.7]} raycast={() => null}>
            <coneGeometry args={[1, 1, 7, 1]} />
          </mesh>
          {s.green ? (
            <mesh material={isletGreen} position={[0, s.h * 0.18, 0]} scale={[s.w * 0.75, s.h * 0.35, s.w * 0.55]} raycast={() => null}>
              <sphereGeometry args={[1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  )
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
