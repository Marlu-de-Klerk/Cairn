// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/tundra/landmass.glb public/models TundraLandmass`
// (scripts/process-asset.mjs) — node/material names below are copied from that
// scaffold's generated GLTFResult type, not guessed. Same source geometry as
// JungleLandmass (Kenney's platform_grass.glb, see ASSETS.md), tinted differently
// via getBiomePalette by the consumer — the compressed .glb is processed and
// stored separately per-biome since gltf-transform re-runs its own dedupe/prune
// pass and the two components must be able to preload/dispose independently.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'
import { getBiomePalette } from '../../../lib/theme'

interface TundraLandmassGLTF extends GLTF {
  nodes: {
    Mesh_platform_grass: Mesh
    Mesh_platform_grass_1: Mesh
  }
  materials: {
    dirt: MeshStandardMaterial
    grass: MeshStandardMaterial
  }
}

export const TundraLandmass = forwardRef<Group, ThreeElements['group']>(function TundraLandmass(props, ref) {
  const { nodes, materials } = useGLTF('/models/TundraLandmass.glb') as unknown as TundraLandmassGLTF
  // Cloned once per mount (never on every render) so the tint doesn't mutate the
  // globally-cached GLTF materials shared with any other TundraLandmass instance.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('tundra')
    const dirt = materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    const grass = materials.grass.clone()
    grass.color.set(palette.landmass)
    return { dirt, grass }
  }, [])
  return (
    <group ref={ref} {...props} dispose={null}>
      <group position={[0.002, -0.009, 0.008]} scale={0.447}>
        <mesh geometry={nodes.Mesh_platform_grass.geometry} material={tinted.dirt} />
        <mesh geometry={nodes.Mesh_platform_grass_1.geometry} material={tinted.grass} />
      </group>
    </group>
  )
})

useGLTF.preload('/models/TundraLandmass.glb')
