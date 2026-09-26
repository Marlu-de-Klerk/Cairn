// Hand-authored from the gltfjsx scaffolds produced by
// `npm run assets:process -- assets-raw/tundra/prop_{pine,rock}.glb
// public/models Tundra{Pine,Rock}` (scripts/process-asset.mjs) —
// node/material names below are copied from those scaffolds' generated
// GLTFResult types. Tundra has only two prop types, unlike its siblings'
// three.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { getBiomePalette } from '../../../lib/theme'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

interface TundraPineGLTF extends GLTF {
  nodes: {
    Mesh_tree_pineRoundA: Mesh
    Mesh_tree_pineRoundA_1: Mesh
  }
  materials: {
    woodBarkDark: MeshStandardMaterial
    leafsDark: MeshStandardMaterial
  }
}

interface TundraRockGLTF extends GLTF {
  nodes: {
    Mesh_rock_smallB: Mesh
    Mesh_rock_smallB_1: Mesh
  }
  materials: {
    grass: MeshStandardMaterial
    dirt: MeshStandardMaterial
  }
}

interface TundraPropsProps {
  seed: number
  count: number
}

export function TundraProps({ seed, count }: TundraPropsProps) {
  const pine = useGLTF('/models/TundraPine.glb') as unknown as TundraPineGLTF
  const rock = useGLTF('/models/TundraRock.glb') as unknown as TundraRockGLTF

  // Kenney's shared grass/dirt materials render turquoise-green/salmon
  // untinted, identical to every other biome's rock prop — tinted to match
  // TundraLandmass.tsx's own tint so tundra's rocks read as icy/pale rock.
  const tinted = useMemo(() => {
    const palette = getBiomePalette('tundra')
    const grass = rock.materials.grass.clone()
    grass.color.set(palette.landmass)
    const dirt = rock.materials.dirt.clone()
    dirt.color.set(palette.landmassShadow)
    return { grass, dirt }
  }, [])

  const [pineCount, rockCount] = useMemo(() => splitCount(count, 2), [count])

  const pinePlacements = useMemo(
    () => scatterPlacements(seed, 0, pineCount).map((p) => withLocalOffset(p, [0, 0.633, 0], 0.683)),
    [seed, pineCount],
  )
  const rockPlacements = useMemo(
    () => scatterPlacements(seed, 1, rockCount).map((p) => withLocalOffset(p, [0, 0.038, 0], 0.18)),
    [seed, rockCount],
  )

  return (
    <group>
      <PropPart geometry={pine.nodes.Mesh_tree_pineRoundA.geometry} material={pine.materials.woodBarkDark} placements={pinePlacements} />
      <PropPart geometry={pine.nodes.Mesh_tree_pineRoundA_1.geometry} material={pine.materials.leafsDark} placements={pinePlacements} />

      <PropPart geometry={rock.nodes.Mesh_rock_smallB.geometry} material={tinted.grass} placements={rockPlacements} />
      <PropPart geometry={rock.nodes.Mesh_rock_smallB_1.geometry} material={tinted.dirt} placements={rockPlacements} />
    </group>
  )
}

useGLTF.preload('/models/TundraPine.glb')
useGLTF.preload('/models/TundraRock.glb')
