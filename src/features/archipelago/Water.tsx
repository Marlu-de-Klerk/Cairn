import { WATER_Y } from '../../lib/island/types'

/**
 * Opaque, unlit Soft Lagoon water. Foam and the shallow halo sit a few millimetres above it, so polygonOffset
 * pushes the disc back in depth rather than relying on those tiny height gaps. It no longer spins: a rotation.y on
 * a disc already turned -π/2 about X tilted the sea over time.
 */
export function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} raycast={() => null}>
      <circleGeometry args={[60, 64]} />
      <meshBasicMaterial color="#6BC2C9" toneMapped={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}
