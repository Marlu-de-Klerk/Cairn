import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { SHARED_PALETTE } from '../../lib/island/biomes'

/** Procedural head marker (spec §2.3): a 0.34 pole with a 0.12 × 0.08 coral flag. Replaces the Kenney flag glTF. */
export function TrailPennant() {
  const flag = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([0.01, 0.34, 0, 0.01, 0.26, 0, 0.13, 0.3, 0.01], 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group>
      <mesh position={[0, 0.17, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.009, 0.011, 0.34, 6]} />
        <meshBasicMaterial color={SHARED_PALETTE.pennantPole} />
      </mesh>
      <mesh geometry={flag} raycast={() => null}>
        <meshBasicMaterial color={SHARED_PALETTE.pennantFlag} side={2} />
      </mesh>
    </group>
  )
}
