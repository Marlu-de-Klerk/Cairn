// Hand-authored from the gltfjsx scaffolds produced by
// `npm run assets:process -- assets-raw/highlands/prop_{rock_large,stone_tall,bush}.glb
// public/models Highlands{RockLarge,StoneTall,Bush}` (scripts/process-asset.mjs) —
// node/material names below are copied from those scaffolds' generated
// GLTFResult types.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { getBiomePalette } from '../../../lib/theme'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

interface HighlandsRockLargeGLTF extends GLTF {
  nodes: {
    Mesh_rock_largeA: Mesh
    Mesh_rock_largeA_1: Mesh
  }
  materials: {
    dirt: MeshStandardMaterial
    grass: MeshStandardMaterial
  }
}

interface HighlandsStoneTallGLTF extends GLTF {
  nodes: {
    Mesh_stone_tallB: Mesh
    Mesh_stone_tallB_1: Mesh
  }
  materials: {
    stone: MeshStandardMaterial
    _defaultMat: MeshStandardMaterial
  }
}

interface HighlandsBushGLTF extends GLTF {
  nodes: {
    plant_bushSmall: Mesh
  }
  materials: {
    grass: MeshStandardMaterial
  }
}

interface HighlandsPropsProps {
  seed: number
  count: number
}

export function HighlandsProps({ seed, count }: HighlandsPropsProps) {
  const rockLarge = useGLTF('/models/HighlandsRockLarge.glb') as unknown as HighlandsRockLargeGLTF
  const stoneTall = useGLTF('/models/HighlandsStoneTall.glb') as unknown as HighlandsStoneTallGLTF
  const bush = useGLTF('/models/HighlandsBush.glb') as unknown as HighlandsBushGLTF

  // Kenney's shared grass/dirt materials render turquoise-green/salmon
  // untinted, identical to every other biome's rock prop — tinted to match
  // HighlandsLandmass.tsx's own tint so highlands' large rocks read as the
  // same grey-purple stone. stoneTall/bush are left untouched here: neither
  // was named in the review's specific findings, and stoneTall's own `stone`
  // material isn't the shared grass/dirt culprit those findings were about.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('highlands')
    const dirt = rockLarge.materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    const grass = rockLarge.materials.grass.clone()
    grass.color.set(palette.landmass)
    return { dirt, grass }
  }, [])

  const [rockLargeCount, stoneTallCount, bushCount] = useMemo(() => splitCount(count, 3), [count])

  const rockLargePlacements = useMemo(
    () => scatterPlacements(seed, 0, rockLargeCount).map((p) => withLocalOffset(p, [0, 0.08, 0], 0.508)),
    [seed, rockLargeCount],
  )
  const stoneTallPlacements = useMemo(
    () => scatterPlacements(seed, 1, stoneTallCount).map((p) => withLocalOffset(p, [0, 0.392, 0], 0.442)),
    [seed, stoneTallCount],
  )
  const bushPlacements = useMemo(
    () => scatterPlacements(seed, 2, bushCount).map((p) => withLocalOffset(p, [0, 0.054, 0], 0.191)),
    [seed, bushCount],
  )

  return (
    <group>
      <PropPart geometry={rockLarge.nodes.Mesh_rock_largeA.geometry} material={tinted.dirt} placements={rockLargePlacements} />
      <PropPart geometry={rockLarge.nodes.Mesh_rock_largeA_1.geometry} material={tinted.grass} placements={rockLargePlacements} />

      <PropPart geometry={stoneTall.nodes.Mesh_stone_tallB.geometry} material={stoneTall.materials.stone} placements={stoneTallPlacements} />
      <PropPart
        geometry={stoneTall.nodes.Mesh_stone_tallB_1.geometry}
        material={stoneTall.materials._defaultMat}
        placements={stoneTallPlacements}
      />

      <PropPart geometry={bush.nodes.plant_bushSmall.geometry} material={bush.materials.grass} placements={bushPlacements} />
    </group>
  )
}

useGLTF.preload('/models/HighlandsRockLarge.glb')
useGLTF.preload('/models/HighlandsStoneTall.glb')
useGLTF.preload('/models/HighlandsBush.glb')
