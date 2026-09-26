// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/desert/landmass.glb public/models DesertLandmass`
// (scripts/process-asset.mjs) — node/material names below are copied from that
// scaffold's generated GLTFResult type, not guessed.
import { forwardRef, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'
import { getBiomePalette } from '../../../lib/theme'

interface DesertLandmassGLTF extends GLTF {
  nodes: {
    platform_beach: Mesh
  }
  materials: {
    woodInner: MeshStandardMaterial
  }
}

export const DesertLandmass = forwardRef<Group, ThreeElements['group']>(function DesertLandmass(props, ref) {
  const { nodes, materials } = useGLTF('/models/DesertLandmass.glb') as unknown as DesertLandmassGLTF
  // Cloned once per mount (never on every render) so the tint doesn't mutate the
  // globally-cached GLTF material shared with any other DesertLandmass instance.
  const woodInner = useMemo(() => {
    const material = materials.woodInner.clone()
    material.color.set(getBiomePalette('desert').landmass)
    return material
  }, [])
  return (
    <group ref={ref} {...props} dispose={null}>
      <mesh geometry={nodes.platform_beach.geometry} material={woodInner} position={[0.002, -0.009, 0.008]} scale={0.447} />
    </group>
  )
})

useGLTF.preload('/models/DesertLandmass.glb')
