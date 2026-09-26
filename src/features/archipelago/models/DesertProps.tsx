// Hand-authored from the gltfjsx scaffolds produced by
// `npm run assets:process -- assets-raw/desert/prop_{cactus_tall,cactus_short,rock}.glb
// public/models Desert{CactusTall,CactusShort,Rock}` (scripts/process-asset.mjs) —
// node/material names below are copied from those scaffolds' generated
// GLTFResult types.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { getBiomePalette } from '../../../lib/theme'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

interface DesertCactusTallGLTF extends GLTF {
  nodes: {
    cactus_tall: Mesh
  }
  materials: {
    leafsGreen: MeshStandardMaterial
  }
}

interface DesertCactusShortGLTF extends GLTF {
  nodes: {
    cactus_short: Mesh
  }
  materials: {
    leafsGreen: MeshStandardMaterial
  }
}

interface DesertRockGLTF extends GLTF {
  nodes: {
    Mesh_rock_smallA: Mesh
    Mesh_rock_smallA_1: Mesh
  }
  materials: {
    grass: MeshStandardMaterial
    dirt: MeshStandardMaterial
  }
}

interface DesertPropsProps {
  seed: number
  count: number
}

export function DesertProps({ seed, count }: DesertPropsProps) {
  const cactusTall = useGLTF('/models/DesertCactusTall.glb') as unknown as DesertCactusTallGLTF
  const cactusShort = useGLTF('/models/DesertCactusShort.glb') as unknown as DesertCactusShortGLTF
  const rock = useGLTF('/models/DesertRock.glb') as unknown as DesertRockGLTF

  // Kenney's shared grass/dirt materials render turquoise-green/salmon
  // untinted, identical to every other biome's rock prop — tinted to match
  // DesertLandmass.tsx's own tint so desert's rocks read as desert sand rock.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('desert')
    const grass = rock.materials.grass.clone()
    grass.color.set(palette.landmass)
    const dirt = rock.materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    return { grass, dirt }
  }, [])

  const [cactusTallCount, cactusShortCount, rockCount] = useMemo(() => splitCount(count, 3), [count])

  const cactusTallPlacements = useMemo(
    () => scatterPlacements(seed, 0, cactusTallCount).map((p) => withLocalOffset(p, [-0.001, 0.325, 0.037], 0.375)),
    [seed, cactusTallCount],
  )
  const cactusShortPlacements = useMemo(
    () => scatterPlacements(seed, 1, cactusShortCount).map((p) => withLocalOffset(p, [0.002, 0.216, 0.031], 0.266)),
    [seed, cactusShortCount],
  )
  const rockPlacements = useMemo(
    () => scatterPlacements(seed, 2, rockCount).map((p) => withLocalOffset(p, [0, 0.046, 0], 0.18)),
    [seed, rockCount],
  )

  return (
    <group>
      <PropPart geometry={cactusTall.nodes.cactus_tall.geometry} material={cactusTall.materials.leafsGreen} placements={cactusTallPlacements} />
      <PropPart geometry={cactusShort.nodes.cactus_short.geometry} material={cactusShort.materials.leafsGreen} placements={cactusShortPlacements} />

      <PropPart geometry={rock.nodes.Mesh_rock_smallA.geometry} material={tinted.grass} placements={rockPlacements} />
      <PropPart geometry={rock.nodes.Mesh_rock_smallA_1.geometry} material={tinted.dirt} placements={rockPlacements} />
    </group>
  )
}

useGLTF.preload('/models/DesertCactusTall.glb')
useGLTF.preload('/models/DesertCactusShort.glb')
useGLTF.preload('/models/DesertRock.glb')
