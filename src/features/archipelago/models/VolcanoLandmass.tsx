// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/volcano/landmass.glb public/models VolcanoLandmass`
// (scripts/process-asset.mjs) — node/material names below are copied from that
// scaffold's generated GLTFResult type, not guessed.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'
import { getBiomePalette } from '../../../lib/theme'

interface VolcanoLandmassGLTF extends GLTF {
  nodes: {
    Mesh_cliff_block_rock: Mesh
    Mesh_cliff_block_rock_1: Mesh
  }
  materials: {
    grass: MeshStandardMaterial
    dirt: MeshStandardMaterial
  }
}

export const VolcanoLandmass = forwardRef<Group, ThreeElements['group']>(function VolcanoLandmass(props, ref) {
  const { nodes, materials } = useGLTF('/models/VolcanoLandmass.glb') as unknown as VolcanoLandmassGLTF
  // Cloned once per mount (never on every render) so the tint doesn't mutate the
  // globally-cached GLTF materials shared with any other VolcanoLandmass instance.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('volcano')
    const grass = materials.grass.clone()
    grass.color.set(palette.landmass)
    const dirt = materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    return { grass, dirt }
  }, [])
  // Non-uniform scale: x/z match the five flat-platform biomes' own half-width
  // (0.447, see Island.tsx's ISLAND_SCALE comment) so volcano's footprint reads
  // as the same family once the shared outer scale is applied, while y is cut
  // down from the raw cube's [-1, 1] range (2 units) to 0.1245 so the resulting
  // height, after that same outer 4.4x, comes out to about 3x its siblings'
  // height (0.1245 * 2 * 4.4 = 1.0956, vs 0.365) - taller and rockier, not 12x
  // taller. Position.y (0.0745) keeps the mesh's own local bottom at y = -0.05,
  // the same pre-outer-scale water-flush alignment the five siblings use.
  return (
    <group ref={ref} {...props} dispose={null}>
      <group position={[0, 0.0745, 0]} scale={[0.447, 0.1245, 0.447]}>
        <mesh geometry={nodes.Mesh_cliff_block_rock.geometry} material={tinted.grass} />
        <mesh geometry={nodes.Mesh_cliff_block_rock_1.geometry} material={tinted.dirt} />
      </group>
    </group>
  )
})

useGLTF.preload('/models/VolcanoLandmass.glb')
