// Procedural shoreline + real Quaternius rock models — 2026-09-15 visual
// redesign (see docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md).
// v2: the first pass (a single faceted icosahedron standing in for "rock")
// read as one smooth primitive blob and was rejected by the user against
// the reference image. This version composites two real, CC0, textured
// Quaternius rock models (see ASSETS.md) at different positions/scales for
// genuine multi-tier terrain — the procedural ring/tide-pool are kept as-is,
// since the ring's size-derived-from-the-hero-feature fix for the M4
// water/shoreline bug was never what the user objected to.
//
// Authored in real, world-ready units and rendered unscaled — Island.tsx
// gives this biome scale 1 (see ISLAND_SCALE_BY_BIOME there), unlike the
// five GLTF-sourced biomes still riding the shared 4.4x multiplier.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { DataTexture, DoubleSide, NearestFilter, RedFormat, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'

// The shoreline ring's outer edge is the island's whole footprint radius —
// JungleProps' prop scatter radii are chosen relative to this one value.
export const JUNGLE_ISLAND_RADIUS = 2
const RING_TUBE_RADIUS = 0.4
const RING_CENTER_RADIUS = JUNGLE_ISLAND_RADIUS - RING_TUBE_RADIUS
// Matches Water.tsx's plane exactly, so the ring's underside meets the
// water surface with no gap and no clipping.
const WATER_Y = -0.05
const POOL_RADIUS = 0.42
const POOL_Y = WATER_Y + 0.06

interface JungleRockAGLTF extends GLTF {
  nodes: { Rock_Medium_1: Mesh }
  materials: { Rocks: MeshStandardMaterial }
}
interface JungleRockBGLTF extends GLTF {
  nodes: { Rock_Medium_2: Mesh }
  materials: { Rocks: MeshStandardMaterial }
}

/**
 * A small hard-stepped gradient for MeshToonMaterial — three.js falls back
 * to a smooth, PBR-ish look without one. Used only for the procedural
 * ring/pool; the real rock models bring their own baked PBR textures.
 */
function useToonGradient(): DataTexture {
  return useMemo(() => {
    const data = new Uint8Array([70, 170, 255])
    const texture = new DataTexture(data, data.length, 1, RedFormat)
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.needsUpdate = true
    return texture
  }, [])
}

export const JungleLandmass = forwardRef<Group, ThreeElements['group']>(function JungleLandmass(props, ref) {
  const gradientMap = useToonGradient()
  const rockA = useGLTF('/models/JungleRockA.glb') as unknown as JungleRockAGLTF
  const rockB = useGLTF('/models/JungleRockB.glb') as unknown as JungleRockBGLTF

  return (
    <group ref={ref} {...props}>
      <mesh position={[0, WATER_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_CENTER_RADIUS, RING_TUBE_RADIUS, 12, 28]} />
        <meshToonMaterial color="#EFCB8E" gradientMap={gradientMap} side={DoubleSide} />
      </mesh>

      {/* Hero rock — the tallest tier, roughly centered. */}
      <group position={[-0.15, WATER_Y, 0.05]} scale={0.62} rotation={[0, 0.4, 0]}>
        <group position={[-0.115, 0.859, 0.345]} scale={1.613}>
          <mesh geometry={rockA.nodes.Rock_Medium_1.geometry} material={rockA.materials.Rocks} />
        </group>
      </group>

      {/* Second, smaller/lower rock offset from the hero rock — real terrain
          variety instead of one uniform mound. */}
      <group position={[0.55, WATER_Y, -0.35]} scale={0.38} rotation={[0, 2.1, 0]}>
        <group position={[-0.189, 0.899, 0.08]} scale={1.524}>
          <mesh geometry={rockB.nodes.Rock_Medium_2.geometry} material={rockB.materials.Rocks} />
        </group>
      </group>

      <mesh position={[0.4, POOL_Y, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[POOL_RADIUS, 24]} />
        <meshToonMaterial color="#BEE8EA" gradientMap={gradientMap} side={DoubleSide} />
      </mesh>
    </group>
  )
})

useGLTF.preload('/models/JungleRockA.glb')
useGLTF.preload('/models/JungleRockB.glb')
