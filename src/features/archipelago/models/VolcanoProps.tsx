// Hand-authored from the gltfjsx scaffolds produced by
// `npm run assets:process -- assets-raw/volcano/prop_{rock_tall,rock_tall2,stone}.glb
// public/models Volcano{RockTall,RockTall2,Stone}` (scripts/process-asset.mjs) —
// node/material names below are copied from those scaffolds' generated
// GLTFResult types.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { getBiomePalette } from '../../../lib/theme'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

interface VolcanoRockTallGLTF extends GLTF {
  nodes: {
    Mesh_rock_tallA: Mesh
    Mesh_rock_tallA_1: Mesh
    Mesh_rock_tallA_2: Mesh
  }
  materials: {
    dirt: MeshStandardMaterial
    grass: MeshStandardMaterial
    _defaultMat: MeshStandardMaterial
  }
}

interface VolcanoRockTall2GLTF extends GLTF {
  nodes: {
    Mesh_rock_tallB: Mesh
    Mesh_rock_tallB_1: Mesh
    Mesh_rock_tallB_2: Mesh
  }
  materials: {
    dirt: MeshStandardMaterial
    grass: MeshStandardMaterial
    _defaultMat: MeshStandardMaterial
  }
}

interface VolcanoStoneGLTF extends GLTF {
  nodes: {
    stone_largeC: Mesh
  }
  materials: {
    stone: MeshStandardMaterial
  }
}

interface VolcanoPropsProps {
  seed: number
  count: number
}

export function VolcanoProps({ seed, count }: VolcanoPropsProps) {
  const rockTall = useGLTF('/models/VolcanoRockTall.glb') as unknown as VolcanoRockTallGLTF
  const rockTall2 = useGLTF('/models/VolcanoRockTall2.glb') as unknown as VolcanoRockTall2GLTF
  const stone = useGLTF('/models/VolcanoStone.glb') as unknown as VolcanoStoneGLTF

  // Kenney's shared `grass`/`dirt` materials render bright turquoise-green and
  // salmon untinted — the same tint VolcanoLandmass.tsx already applies to its
  // own grass/dirt, so the rocks read as volcano rock rather than as any other
  // biome's grass. Cloned once per mount, matching the *Landmass.tsx pattern.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('volcano')
    const grass = rockTall.materials.grass.clone()
    grass.color.set(palette.landmass)
    const dirt = rockTall.materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    const grass2 = rockTall2.materials.grass.clone()
    grass2.color.set(palette.landmass)
    const dirt2 = rockTall2.materials.dirt.clone()
    dirt2.color.set(palette.landmassShadow)
    return { grass, dirt, grass2, dirt2 }
  }, [])

  const [rockTallCount, rockTall2Count, stoneCount] = useMemo(() => splitCount(count, 3), [count])

  const rockTallPlacements = useMemo(
    () => scatterPlacements(seed, 0, rockTallCount).map((p) => withLocalOffset(p, [0, 0.448, 0], 0.498)),
    [seed, rockTallCount],
  )
  const rockTall2Placements = useMemo(
    () => scatterPlacements(seed, 1, rockTall2Count).map((p) => withLocalOffset(p, [0, 0.392, 0], 0.442)),
    [seed, rockTall2Count],
  )
  const stonePlacements = useMemo(
    () => scatterPlacements(seed, 2, stoneCount).map((p) => withLocalOffset(p, [0, 0.111, 0], 0.532)),
    [seed, stoneCount],
  )

  return (
    <group>
      <PropPart geometry={rockTall.nodes.Mesh_rock_tallA.geometry} material={tinted.dirt} placements={rockTallPlacements} />
      <PropPart geometry={rockTall.nodes.Mesh_rock_tallA_1.geometry} material={tinted.grass} placements={rockTallPlacements} />
      <PropPart geometry={rockTall.nodes.Mesh_rock_tallA_2.geometry} material={rockTall.materials._defaultMat} placements={rockTallPlacements} />

      <PropPart geometry={rockTall2.nodes.Mesh_rock_tallB.geometry} material={tinted.dirt2} placements={rockTall2Placements} />
      <PropPart geometry={rockTall2.nodes.Mesh_rock_tallB_1.geometry} material={tinted.grass2} placements={rockTall2Placements} />
      <PropPart geometry={rockTall2.nodes.Mesh_rock_tallB_2.geometry} material={rockTall2.materials._defaultMat} placements={rockTall2Placements} />

      <PropPart geometry={stone.nodes.stone_largeC.geometry} material={stone.materials.stone} placements={stonePlacements} />
    </group>
  )
}

useGLTF.preload('/models/VolcanoRockTall.glb')
useGLTF.preload('/models/VolcanoRockTall2.glb')
useGLTF.preload('/models/VolcanoStone.glb')
