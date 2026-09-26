// Hand-authored from the gltfjsx scaffold produced by
// `npm run assets:process -- assets-raw/marker/flag.glb public/models TrailMarker`
// (scripts/process-asset.mjs) — node/material names below are copied from
// that scaffold's generated GLTFResult type. The source .glb (Kenney Pirate
// Kit's flag.glb) references an external `Textures/colormap.png` sibling
// rather than embedding it — a `Textures/` copy was added next to
// assets-raw/marker/flag.glb so gltf-transform could resolve it; see
// ASSETS.md and the Task 4 report for the full note.
import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ThreeElements } from '@react-three/fiber'

interface TrailMarkerGLTF extends GLTF {
  nodes: {
    flag_1: Mesh
  }
  materials: {
    colormap: MeshStandardMaterial
  }
}

type TrailMarkerProps = ThreeElements['group']

export function TrailMarker(props: TrailMarkerProps) {
  const { nodes, materials } = useGLTF('/models/TrailMarker.glb') as unknown as TrailMarkerGLTF
  return (
    <group {...props} dispose={null}>
      <mesh geometry={nodes.flag_1.geometry} material={materials.colormap} position={[0.469, 1.048, 0]} scale={1.048} />
    </group>
  )
}

useGLTF.preload('/models/TrailMarker.glb')
