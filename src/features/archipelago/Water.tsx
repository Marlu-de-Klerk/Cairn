import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'

/**
 * Placeholder water — real biome-aware materials/reflections are spec §8's
 * M4 job. This is a large flat disc, slowly self-rotating with a gentle
 * opacity pulse, just enough to read as water rather than a static floor.
 */
export function Water() {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.02
    const material = meshRef.current.material as MeshStandardMaterial
    material.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.4) * 0.03
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <circleGeometry args={[60, 64]} />
      <meshStandardMaterial color="#0f2a4a" transparent opacity={0.82} roughness={0.3} />
    </mesh>
  )
}
