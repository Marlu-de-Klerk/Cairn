import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { BufferGeometry, Material, Mesh } from 'three'
import type { GLTF } from 'three-stdlib'
import type { Biome } from '../../../lib/island/types'
import { HAND_BUILT } from '../../../lib/island/fixedIslands'
import { flowTime } from '../terrain/materials'

// Built by scripts/blender/<biome>_island.py on the biome's fixed layout seed (HAND_BUILT), packed by `npm run island:pack`.
// Blender's exporter drops an empty mesh, so a biome without soft foliage has no Soft node.
type GLTFResult = GLTF & { nodes: { Lit: Mesh; Soft?: Mesh; Unlit: Mesh } }

interface HandBuiltIslandProps {
  readonly url: string
  readonly litMaterial: Material
  /** smooth diffuse for tree crowns and bushes, which the toon ramp would band; also sways smoke */
  readonly softMaterial: Material
  /** unlit water, lava and fire; animates the parts the Blender script tagged as flowing */
  readonly unlitMaterial: Material
}

/** The Blender script writes each moving part's flow tag as the mesh's only texcoord; the flow materials read it as 'flow'. */
function withFlow(geometry: BufferGeometry): BufferGeometry {
  const uv = geometry.getAttribute('uv')
  if (uv && !geometry.getAttribute('flow')) geometry.setAttribute('flow', uv)
  return geometry
}

/** A hand-built island: lit (terrain, plants), soft (tree crowns, bushes, smoke) and unlit (water, lava, fire) meshes. */
export function HandBuiltIsland({ url, litMaterial, softMaterial, unlitMaterial }: HandBuiltIslandProps) {
  const { nodes } = useGLTF(url) as unknown as GLTFResult
  // one shared clock for every island's falls, lava, flames and smoke
  useFrame(({ clock }) => {
    flowTime.value = clock.elapsedTime
  })
  return (
    <group>
      {/* meshopt quantisation stores each mesh's placement on its node, so the node transform must be kept */}
      <mesh geometry={nodes.Lit.geometry} material={litMaterial} position={nodes.Lit.position} scale={nodes.Lit.scale} raycast={() => null} />
      {nodes.Soft ? <mesh geometry={withFlow(nodes.Soft.geometry)} material={softMaterial} position={nodes.Soft.position} scale={nodes.Soft.scale} raycast={() => null} /> : null}
      <mesh geometry={withFlow(nodes.Unlit.geometry)} material={unlitMaterial} position={nodes.Unlit.position} scale={nodes.Unlit.scale} raycast={() => null} />
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
