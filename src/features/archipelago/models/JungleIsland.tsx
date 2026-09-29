import { useGLTF } from '@react-three/drei'
import type { Material, Mesh } from 'three'
import type { GLTF } from 'three-stdlib'

// Built by scripts/blender/jungle_island.py on the JUNGLE_ISLAND_SEED layout, packed by `npm run island:pack`.
export const JUNGLE_ISLAND_URL = '/models/JungleIsland.glb'

type GLTFResult = GLTF & { nodes: { Lit: Mesh; Unlit: Mesh } }

interface JungleIslandProps {
  readonly litMaterial: Material
  readonly unlitMaterial: Material
}

/** The hand-built jungle island: one lit mesh (terrain and plants, vertex-coloured) and one unlit (water, falls, fire). */
export function JungleIsland({ litMaterial, unlitMaterial }: JungleIslandProps) {
  const { nodes } = useGLTF(JUNGLE_ISLAND_URL) as unknown as GLTFResult
  return (
    <group>
      {/* meshopt quantisation stores each mesh's placement on its node, so the node transform must be kept */}
      <mesh geometry={nodes.Lit.geometry} material={litMaterial} position={nodes.Lit.position} scale={nodes.Lit.scale} raycast={() => null} />
      <mesh geometry={nodes.Unlit.geometry} material={unlitMaterial} position={nodes.Unlit.position} scale={nodes.Unlit.scale} raycast={() => null} />
    </group>
  )
}
