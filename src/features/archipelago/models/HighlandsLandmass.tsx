// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/highlands/landmass.glb public/models HighlandsLandmass`
// (scripts/process-asset.mjs) — node/material names below are copied from that
// scaffold's generated GLTFResult type, not guessed.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'
import { getBiomePalette } from '../../../lib/theme'

interface HighlandsLandmassGLTF extends GLTF {
  nodes: {
    Mesh_platform_stone: Mesh
    Mesh_platform_stone_1: Mesh
  }
  materials: {
    stoneDark: MeshStandardMaterial
    stone: MeshStandardMaterial
  }
}

export const HighlandsLandmass = forwardRef<Group, ThreeElements['group']>(function HighlandsLandmass(props, ref) {
  const { nodes, materials } = useGLTF('/models/HighlandsLandmass.glb') as unknown as HighlandsLandmassGLTF
  // Cloned once per mount (never on every render) so the tint doesn't mutate the
  // globally-cached GLTF materials shared with any other HighlandsLandmass instance.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('highlands')
    const stoneDark = materials.stoneDark.clone()
    stoneDark.color.set(palette.landmassShadow)
    const stone = materials.stone.clone()
    stone.color.set(palette.landmass)
    return { stoneDark, stone }
  }, [])
  return (
    <group ref={ref} {...props} dispose={null}>
      <group position={[0.002, -0.009, 0.008]} scale={0.447}>
        <mesh geometry={nodes.Mesh_platform_stone.geometry} material={tinted.stoneDark} />
        <mesh geometry={nodes.Mesh_platform_stone_1.geometry} material={tinted.stone} />
      </group>
    </group>
  )
})

useGLTF.preload('/models/HighlandsLandmass.glb')
