import { Instances, Instance } from '@react-three/drei'
import type { BufferGeometry, Material } from 'three'
import type { PropPlacement } from './scatter'

interface PropPartProps {
  geometry: BufferGeometry
  material: Material
  placements: PropPlacement[]
}

/**
 * One instanced sub-mesh of a prop (spec §8: "Props must be instanced... a
 * jungle island's 60 trees are one `<Instances>`, not 60 meshes"). A
 * multi-part prop (e.g. a tree's leaves + bark) renders several of these
 * side by side, all fed the same `placements` array so the parts line up.
 */
export function PropPart({ geometry, material, placements }: PropPartProps) {
  return (
    <Instances geometry={geometry} material={material} limit={Math.max(placements.length, 1)}>
      {placements.map((p, i) => (
        <Instance key={i} position={p.position} rotation={p.rotation} scale={p.scale} />
      ))}
    </Instances>
  )
}
