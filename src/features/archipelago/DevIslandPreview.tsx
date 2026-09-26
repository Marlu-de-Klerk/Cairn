// Dev-only visual-verification harness for the 2026-09-15 visual redesign
// (see docs/superpowers/specs/2026-09-15-cairn-visual-redesign.md) — lets a
// single biome's Landmass/Props be inspected in isolation, with no Supabase
// auth/data round-trip, while each biome gets migrated to real/procedural
// geometry one at a time. Not part of the spec's own feature surface; safe
// to delete once every biome is migrated and re-reviewed against the
// reference art direction.
import { Suspense } from 'react'
import { useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { JungleLandmass } from './models/JungleLandmass'
import { JungleProps } from './models/JungleProps'
import { Water } from './Water'

// Only jungle is migrated so far — extend this switch as each biome gets
// its own real/procedural rebuild.
export function DevIslandPreview() {
  const [params] = useSearchParams()
  const count = Number(params.get('count') ?? '14')

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas camera={{ position: [4, 3, 5], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 3]} intensity={1.2} />
        <Suspense fallback={null}>
          <JungleLandmass />
          <JungleProps seed={1} count={count} />
          <Water />
        </Suspense>
        <OrbitControls target={[0, 0.5, 0]} />
      </Canvas>
    </div>
  )
}
