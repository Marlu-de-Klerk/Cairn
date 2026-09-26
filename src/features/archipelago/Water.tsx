import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'

/**
 * Placeholder water — biome-aware materials/reflections were never picked up
 * by M4 (out of its actual task scope; not a completed milestone). This is a
 * large flat disc, slowly self-rotating with a gentle opacity pulse, just
 * enough to read as water rather than a static floor.
 *
 * Recolored for the 2026-09-15 visual redesign ("Soft Lagoon" — see
 * docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md) — the old dark
 * navy read as a night ocean, which the new light/warm direction retires.
 */
export function Water() {
  const meshRef = useRef<Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.02
    const material = meshRef.current.material as MeshStandardMaterial
    material.opacity = 0.88 + Math.sin(clock.elapsedTime * 0.4) * 0.03
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <circleGeometry args={[60, 64]} />
      <meshStandardMaterial color="#6BC2C9" transparent opacity={0.88} roughness={0.35} />
    </mesh>
  )
}
