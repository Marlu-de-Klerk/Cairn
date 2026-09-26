// Real, CC0 Quaternius nature-pack props — 2026-09-15 visual redesign (see
// docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md). v2: the first
// pass (repeated faceted-icosahedron "fern tuft" spheres) was rejected by
// the user against the reference image for looking nothing like real
// foliage. This version instances real tree/fern/bush/mushroom models (see
// ASSETS.md) instead, keeping the existing seeded-scatter convention
// (scatterPlacements/hash01) so an island's prop layout is still stable
// across visits — only the rendered geometry changed.
//
// Unlike DesertProps' Kenney models, these Quaternius exports use
// KHR_mesh_quantization: `nodes.X.geometry` alone is raw int16-normalized
// data (roughly -1..1 per axis) — the real size/position only exists once
// the gltfjsx scaffold's own baked node position+scale is folded back in
// (see JungleLandmass.tsx, which renders its rocks as nested
// `<group position scale><mesh geometry /></group>` for exactly this
// reason). `<Instance>` can't hold that nested group (only one flat
// position/rotation/scale per instance — see scatter.ts's own note), so the
// baked node transform is folded into scatterPlacements' localOffset/
// localScale here instead: BAKED_* below are the scaffold's own group
// position/scale for each model, GROUND_OFFSET_Y is where each model's own
// local geometry hits its lowest Y (computed from the real accessor
// bounding box, not guessed — a plain per-axis "-1" doesn't hold when a
// model's bbox doesn't reach the full int16 range on that axis, as most of
// these don't), and TARGET_SCALE is this file's own choice of how tall each
// prop should read against JUNGLE_ISLAND_RADIUS, not a value copied from
// the scaffold.
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import { JUNGLE_ISLAND_RADIUS } from './JungleLandmass'
import { PropPart } from './PropPart'
import { scatterPlacements, splitCount, withLocalOffset } from './scatter'

const PROP_RADIUS_MIN = JUNGLE_ISLAND_RADIUS * 0.55
const PROP_RADIUS_MAX = JUNGLE_ISLAND_RADIUS * 0.92

interface JungleTreeGLTF extends GLTF {
  nodes: { tree025: Mesh; tree025_1: Mesh }
  materials: { Bark_NormalTree: MeshStandardMaterial; Leaves_NormalTree: MeshStandardMaterial }
}
interface JungleFernGLTF extends GLTF {
  nodes: { Fern_1: Mesh }
  materials: { Leaves: MeshStandardMaterial }
}
interface JungleBushGLTF extends GLTF {
  nodes: { tree009: Mesh; tree009_1: Mesh }
  materials: { Leaves_NormalTree: MeshStandardMaterial; Flowers: MeshStandardMaterial }
}
interface JungleMushroomGLTF extends GLTF {
  nodes: { Mushroom_Common: Mesh }
  materials: { Mushrooms: MeshStandardMaterial }
}

// [x, y, z] baked node translation, from each model's gltfjsx scaffold.
const TREE_BAKED_POS: [number, number, number] = [0.045, 4.47, 0.06]
const TREE_BAKED_SCALE = 4.713
const TREE_GROUND_OFFSET_Y = -0.243
const TREE_TARGET_HEIGHT = 1.7

const FERN_BAKED_POS: [number, number, number] = [0.032, 0.343, 0.048]
const FERN_BAKED_SCALE = 1.413
const FERN_GROUND_OFFSET_Y = -0.0767
const FERN_TARGET_HEIGHT = 0.4

const BUSH_BAKED_POS: [number, number, number] = [0.034, 0.556, 0.008]
const BUSH_BAKED_SCALE = 0.983
const BUSH_GROUND_OFFSET_Y = -0.2354
const BUSH_TARGET_HEIGHT = 0.6

const MUSHROOM_BAKED_POS: [number, number, number] = [-0.052, 0.214, -0.056]
const MUSHROOM_BAKED_SCALE = 0.39
const MUSHROOM_GROUND_OFFSET_Y = -0.018
const MUSHROOM_TARGET_HEIGHT = 0.25

/**
 * Folds a quantized model's baked node transform into scatter.ts's
 * withLocalOffset, converting "how the scaffold placed this model in its
 * own scene" + "how tall we want it here" into the (offset, localScale)
 * pair withLocalOffset expects. See the file header for why this folding
 * is necessary (KHR_mesh_quantization) and how GROUND_OFFSET_Y/rawHeight
 * are derived.
 */
function bakedLocalOffset(
  bakedPos: [number, number, number],
  bakedScale: number,
  groundOffsetY: number,
  targetHeight: number,
  rawHeight: number,
): { offset: [number, number, number]; localScale: number } {
  const targetScale = targetHeight / rawHeight
  return {
    offset: [bakedPos[0] * targetScale, (bakedPos[1] - groundOffsetY) * targetScale, bakedPos[2] * targetScale],
    localScale: bakedScale * targetScale,
  }
}

interface JunglePropsProps {
  seed: number
  count: number
}

export function JungleProps({ seed, count }: JunglePropsProps) {
  const tree = useGLTF('/models/JungleTree.glb') as unknown as JungleTreeGLTF
  const fern = useGLTF('/models/JungleFern.glb') as unknown as JungleFernGLTF
  const bush = useGLTF('/models/JungleBush.glb') as unknown as JungleBushGLTF
  const mushroom = useGLTF('/models/JungleMushroom.glb') as unknown as JungleMushroomGLTF

  const [treeCount, fernCount, bushCount, mushroomCount] = useMemo(() => splitCount(count, 4), [count])

  const treePlacements = useMemo(() => {
    const { offset, localScale } = bakedLocalOffset(TREE_BAKED_POS, TREE_BAKED_SCALE, TREE_GROUND_OFFSET_Y, TREE_TARGET_HEIGHT, 9.426)
    return scatterPlacements(seed, 0, treeCount, PROP_RADIUS_MIN, PROP_RADIUS_MAX).map((p) => withLocalOffset(p, offset, localScale))
  }, [seed, treeCount])

  const fernPlacements = useMemo(() => {
    const { offset, localScale } = bakedLocalOffset(FERN_BAKED_POS, FERN_BAKED_SCALE, FERN_GROUND_OFFSET_Y, FERN_TARGET_HEIGHT, 0.839)
    return scatterPlacements(seed, 1, fernCount, PROP_RADIUS_MIN, PROP_RADIUS_MAX).map((p) => withLocalOffset(p, offset, localScale))
  }, [seed, fernCount])

  const bushPlacements = useMemo(() => {
    const { offset, localScale } = bakedLocalOffset(BUSH_BAKED_POS, BUSH_BAKED_SCALE, BUSH_GROUND_OFFSET_Y, BUSH_TARGET_HEIGHT, 1.583)
    return scatterPlacements(seed, 2, bushCount, PROP_RADIUS_MIN, PROP_RADIUS_MAX).map((p) => withLocalOffset(p, offset, localScale))
  }, [seed, bushCount])

  const mushroomPlacements = useMemo(() => {
    const { offset, localScale } = bakedLocalOffset(
      MUSHROOM_BAKED_POS,
      MUSHROOM_BAKED_SCALE,
      MUSHROOM_GROUND_OFFSET_Y,
      MUSHROOM_TARGET_HEIGHT,
      0.4641,
    )
    return scatterPlacements(seed, 3, mushroomCount, PROP_RADIUS_MIN, PROP_RADIUS_MAX).map((p) => withLocalOffset(p, offset, localScale))
  }, [seed, mushroomCount])

  return (
    <group>
      <PropPart geometry={tree.nodes.tree025.geometry} material={tree.materials.Bark_NormalTree} placements={treePlacements} />
      <PropPart geometry={tree.nodes.tree025_1.geometry} material={tree.materials.Leaves_NormalTree} placements={treePlacements} />

      <PropPart geometry={fern.nodes.Fern_1.geometry} material={fern.materials.Leaves} placements={fernPlacements} />

      <PropPart geometry={bush.nodes.tree009.geometry} material={bush.materials.Leaves_NormalTree} placements={bushPlacements} />
      <PropPart geometry={bush.nodes.tree009_1.geometry} material={bush.materials.Flowers} placements={bushPlacements} />

      <PropPart geometry={mushroom.nodes.Mushroom_Common.geometry} material={mushroom.materials.Mushrooms} placements={mushroomPlacements} />
    </group>
  )
}

useGLTF.preload('/models/JungleTree.glb')
useGLTF.preload('/models/JungleFern.glb')
useGLTF.preload('/models/JungleBush.glb')
useGLTF.preload('/models/JungleMushroom.glb')
