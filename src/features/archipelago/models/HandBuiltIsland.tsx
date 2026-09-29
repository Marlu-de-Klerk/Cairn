import { useGLTF } from '@react-three/drei'
import type { Material, Mesh } from 'three'
import type { GLTF } from 'three-stdlib'
import type { Biome } from '../../../lib/island/types'
import { HAND_BUILT } from '../../../lib/island/fixedIslands'

// Built by scripts/blender/<biome>_island.py on the biome's fixed layout seed (HAND_BUILT), packed by `npm run island:pack`.
type GLTFResult = GLTF & { nodes: { Lit: Mesh; Soft: Mesh; Unlit: Mesh } }

interface HandBuiltIslandProps {
  readonly url: string
  readonly litMaterial: Material
  /** smooth diffuse for tree crowns and bushes, which the toon ramp would band */
  readonly softMaterial: Material
  readonly unlitMaterial: Material
}

/** A hand-built island: lit (terrain, plants), soft (tree crowns, bushes) and unlit (water, falls, fire) meshes. */
export function HandBuiltIsland({ url, litMaterial, softMaterial, unlitMaterial }: HandBuiltIslandProps) {
  const { nodes } = useGLTF(url) as unknown as GLTFResult
  return (
    <group>
      {/* meshopt quantisation stores each mesh's placement on its node, so the node transform must be kept */}
      <mesh geometry={nodes.Lit.geometry} material={litMaterial} position={nodes.Lit.position} scale={nodes.Lit.scale} raycast={() => null} />
      <mesh geometry={nodes.Soft.geometry} material={softMaterial} position={nodes.Soft.position} scale={nodes.Soft.scale} raycast={() => null} />
      <mesh geometry={nodes.Unlit.geometry} material={unlitMaterial} position={nodes.Unlit.position} scale={nodes.Unlit.scale} raycast={() => null} />
    </group>
  )
}

/** Starts fetching the hand-built models for the biomes in the archipelago, and only those. */
export function preloadHandBuiltIslands(biomes: Iterable<Biome>): void {
  for (const biome of new Set(biomes)) {
    const url = HAND_BUILT[biome]?.url
    if (url) useGLTF.preload(url)
  }
}
