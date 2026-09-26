// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/reef/landmass.glb public/models ReefLandmass`
// (scripts/process-asset.mjs) — node/material names below are copied from that
// scaffold's generated GLTFResult type, not guessed. Same source geometry as
// DesertLandmass (Kenney's platform_beach.glb, see ASSETS.md), tinted turquoise
// by the consumer via getBiomePalette.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'
import { getBiomePalette } from '../../../lib/theme'

interface ReefLandmassGLTF extends GLTF {
  nodes: {
    platform_beach: Mesh
  }
  materials: {
    woodInner: MeshStandardMaterial
  }
}

export const ReefLandmass = forwardRef<Group, ThreeElements['group']>(function ReefLandmass(props, ref) {
  const { nodes, materials } = useGLTF('/models/ReefLandmass.glb') as unknown as ReefLandmassGLTF
  // Cloned once per mount (never on every render) so the tint doesn't mutate the
  // globally-cached GLTF material shared with any other ReefLandmass instance.
  const woodInner = useMemo(() => {
    const material = materials.woodInner.clone()
    material.color.set(getBiomePalette('reef').landmass)
    return material
  }, [])
  return (
    <group ref={ref} {...props} dispose={null}>
      <mesh geometry={nodes.platform_beach.geometry} material={woodInner} position={[0.002, -0.009, 0.008]} scale={0.447} />
    </group>
  )
})

useGLTF.preload('/models/ReefLandmass.glb')
