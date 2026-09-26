// Throwaway harness for comparing terraced-island prototypes side by side.
// Delete this folder once one approach is chosen and built for real.
import { Suspense, lazy, useMemo, type ComponentType } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Water } from '../Water'

const spikeModules = import.meta.glob<{ default: ComponentType<{ seed: number }> }>('./Spike*.tsx')

const VIEWS: Record<string, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [9, 8.5, 11], target: [0, 1.2, 0] },
  side: { position: [14, 3.5, 0.5], target: [0, 1.5, 0] },
  top: { position: [0.01, 18, 0.01], target: [0, 0, 0] },
  back: { position: [-10, 7, -9], target: [0, 1.2, 0] },
}

export function DevSpikePreview() {
  const { name = 'A' } = useParams()
  const [params] = useSearchParams()
  const seed = Number(params.get('seed') ?? '1')
  const dist = Number(params.get('dist') ?? '1')
  const base = VIEWS[params.get('view') ?? 'hero'] ?? VIEWS.hero
  const view = {
    target: base.target,
    position: base.position.map((p, i) => base.target[i] + (p - base.target[i]) * dist) as [number, number, number],
  }

  const Spike = useMemo(() => {
    const loader = spikeModules[`./Spike${name}.tsx`]
    return loader ? lazy(loader) : null
  }, [name])

  if (!Spike) return <p style={{ padding: 16 }}>No spike named {name}</p>

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas camera={{ position: view.position, fov: 40 }}>
        <hemisphereLight args={['#fdf6e3', '#6BC2C9', 0.7]} />
        <directionalLight position={[6, 12, 4]} intensity={1.4} />
        <Suspense fallback={null}>
          <Spike seed={seed} />
          <Water />
        </Suspense>
        <OrbitControls target={view.target} />
      </Canvas>
    </div>
  )
}
