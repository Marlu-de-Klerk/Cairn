// Hand-authored from the gltfjsx scaffolds produced by
// `npm run assets:process -- assets-raw/reef/prop_{lily,coral_cluster,rock_flat}.glb
// public/models Reef{Lily,CoralCluster,RockFlat}` (scripts/process-asset.mjs) —
// node/material names below are copied from those scaffolds' generated
// GLTFResult types. ReefCoralCluster reuses Kenney's mushroom_tanGroup mesh
// (tinted coral/turquoise by the consumer) — no dedicated CC0 coral asset
// was found, see ASSETS.md.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { getBiomePalette } from '../../../lib/theme'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

interface ReefLilyGLTF extends GLTF {
  nodes: {
    Mesh_lily_large: Mesh
    Mesh_lily_large_1: Mesh
    Mesh_lily_large_2: Mesh
  }
  materials: {
    leafsGreen: MeshStandardMaterial
    colorRed: MeshStandardMaterial
    leafsDark: MeshStandardMaterial
  }
}

interface ReefCoralClusterGLTF extends GLTF {
  nodes: {
    Mesh_mushroom_tanGroup: Mesh
    Mesh_mushroom_tanGroup_1: Mesh
  }
  materials: {
    _defaultMat: MeshStandardMaterial
    colorTan: MeshStandardMaterial
  }
}

interface ReefRockFlatGLTF extends GLTF {
  nodes: {
    Mesh_rock_smallFlatA: Mesh
    Mesh_rock_smallFlatA_1: Mesh
  }
  materials: {
    dirt: MeshStandardMaterial
    grass: MeshStandardMaterial
  }
}

interface ReefPropsProps {
  seed: number
  count: number
}

export function ReefProps({ seed, count }: ReefPropsProps) {
  const lily = useGLTF('/models/ReefLily.glb') as unknown as ReefLilyGLTF
  const coralCluster = useGLTF('/models/ReefCoralCluster.glb') as unknown as ReefCoralClusterGLTF
  const rockFlat = useGLTF('/models/ReefRockFlat.glb') as unknown as ReefRockFlatGLTF

  // The coral cluster stands in for real coral (no CC0 coral asset was found,
  // see ASSETS.md) — tinted toward the reef accent so it reads as coral rather
  // than Kenney's raw tan mushroom color. rockFlat's shared grass/dirt render
  // turquoise-green/salmon untinted, same as ReefLandmass.tsx's own tint.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('reef')
    const colorTan = coralCluster.materials.colorTan.clone()
    colorTan.color.set(palette.accent)
    const grass = rockFlat.materials.grass.clone()
    grass.color.set(palette.landmass)
    const dirt = rockFlat.materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    return { colorTan, grass, dirt }
  }, [])

  const [lilyCount, coralClusterCount, rockFlatCount] = useMemo(() => splitCount(count, 3), [count])

  const lilyPlacements = useMemo(
    () => scatterPlacements(seed, 0, lilyCount).map((p) => withLocalOffset(p, [0, -0.001, 0], 0.157)),
    [seed, lilyCount],
  )
  const coralClusterPlacements = useMemo(
    () => scatterPlacements(seed, 1, coralClusterCount).map((p) => withLocalOffset(p, [-0.002, 0.075, 0.015], 0.135)),
    [seed, coralClusterCount],
  )
  const rockFlatPlacements = useMemo(
    () => scatterPlacements(seed, 2, rockFlatCount).map((p) => withLocalOffset(p, [0, -0.018, 0], 0.248)),
    [seed, rockFlatCount],
  )

  return (
    <group>
      <PropPart geometry={lily.nodes.Mesh_lily_large.geometry} material={lily.materials.leafsGreen} placements={lilyPlacements} />
      <PropPart geometry={lily.nodes.Mesh_lily_large_1.geometry} material={lily.materials.colorRed} placements={lilyPlacements} />
      <PropPart geometry={lily.nodes.Mesh_lily_large_2.geometry} material={lily.materials.leafsDark} placements={lilyPlacements} />

      <PropPart
        geometry={coralCluster.nodes.Mesh_mushroom_tanGroup.geometry}
        material={coralCluster.materials._defaultMat}
        placements={coralClusterPlacements}
      />
      <PropPart
        geometry={coralCluster.nodes.Mesh_mushroom_tanGroup_1.geometry}
        material={tinted.colorTan}
        placements={coralClusterPlacements}
      />

      <PropPart geometry={rockFlat.nodes.Mesh_rock_smallFlatA.geometry} material={tinted.dirt} placements={rockFlatPlacements} />
      <PropPart geometry={rockFlat.nodes.Mesh_rock_smallFlatA_1.geometry} material={tinted.grass} placements={rockFlatPlacements} />
    </group>
  )
}

useGLTF.preload('/models/ReefLily.glb')
useGLTF.preload('/models/ReefCoralCluster.glb')
useGLTF.preload('/models/ReefRockFlat.glb')
