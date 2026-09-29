import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { View } from '@react-three/drei'
import type { Group } from 'three'
import type { Goal } from './api'
import { BIOME_TERRAIN } from '../../lib/island/biomes'
import { useIslandBuild } from './terrain/islandCache'
import { TerracedIsland } from './TerracedIsland'
import { HullRegistryProvider } from './hullRegistry'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'

const BIOMES: { key: Goal['biome']; label: string }[] = [
  { key: 'jungle', label: 'Jungle' },
  { key: 'desert', label: 'Desert' },
  { key: 'tundra', label: 'Tundra' },
  { key: 'volcano', label: 'Volcano' },
  { key: 'reef', label: 'Reef' },
  { key: 'highlands', label: 'Highlands' },
]

interface BiomePickerProps {
  value: Goal['biome'] | null
  onChange: (biome: Goal['biome']) => void
}

export function BiomePicker({ value, onChange }: BiomePickerProps) {
  return (
    <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BIOMES.map(({ key, label }) => {
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={`group relative aspect-square overflow-hidden rounded-lg border transition-colors ${
              value === key ? 'border-lantern' : 'border-stone-light hover:border-mist/40'
            }`}
          >
            {/* Rendered outside the shared <Canvas>'s own tree, so <View> takes
                its "portal" branch: it renders its own internal tracked <div>
                here and clips the shared canvas to that div's rect on every
                frame — no `track` prop needed, each card gets independent
                clipping for free. */}
            <View className="h-full w-full">
              <hemisphereLight args={['#EAF6F6', '#6BC2C9', 0.7]} />
              <directionalLight position={[-4, 16, 11]} intensity={1.15} />
              <RotatingIsland biome={key} />
            </View>
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-ink/70 px-2 py-0.5 font-body text-xs text-mist">
              {label}
            </span>
          </button>
        )
      })}
      {/* One shared Canvas backs every <View> above — spec §6.2's "one shared
          <Canvas>, not six canvases." Each <View> reads its own tracked
          button's DOM rect and viewport-clips this shared canvas per frame,
          so it can be a simple full-parent-fill absolutely-positioned
          element behind the grid. It renders no interactive 3D content (each
          card's own <button> handles clicks), so it needs no eventSource. */}
      <Canvas className="pointer-events-none absolute inset-0 -z-10" gl={{ antialias: true }}>
        <View.Port />
      </Canvas>
    </div>
  )
}

// New M4 motion (unlike CameraRig's pre-existing auto-orbit, which the plan
// explicitly carves out) — spec's Global Constraints require
// prefers-reduced-motion respected throughout, so this gates the rotation
// rather than running it unconditionally.
function PreviewIsland({ biome }: { biome: Goal['biome'] }) {
  const build = useIslandBuild(biome, islandLayoutSeed(biome, BIOME_TERRAIN[biome].previewSeed), 'preview', 'normal')
  return build ? <TerracedIsland build={build} /> : null
}

function RotatingIsland({ biome }: { biome: Goal['biome'] }) {
  const ref = useRef<Group>(null)
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.3
  })
  // A fixed, pleasing angle when motion is reduced — still a live 3D preview,
  // just not spinning.
  return (
    <group ref={ref} rotation={[0, reducedMotion ? Math.PI / 4 : 0, 0]} scale={0.36}>
      <HullRegistryProvider>
        <PreviewIsland biome={biome} />
      </HullRegistryProvider>
    </group>
  )
}
