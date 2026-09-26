import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { View } from '@react-three/drei'
import type { Group } from 'three'
import type { Goal } from './api'
import { getBiomePalette } from '../../lib/theme'
import { JungleLandmass } from './models/JungleLandmass'
import { DesertLandmass } from './models/DesertLandmass'
import { TundraLandmass } from './models/TundraLandmass'
import { VolcanoLandmass } from './models/VolcanoLandmass'
import { ReefLandmass } from './models/ReefLandmass'
import { HighlandsLandmass } from './models/HighlandsLandmass'

const BIOMES: { key: Goal['biome']; label: string; Landmass: typeof JungleLandmass }[] = [
  { key: 'jungle', label: 'Jungle', Landmass: JungleLandmass },
  { key: 'desert', label: 'Desert', Landmass: DesertLandmass },
  { key: 'tundra', label: 'Tundra', Landmass: TundraLandmass },
  { key: 'volcano', label: 'Volcano', Landmass: VolcanoLandmass },
  { key: 'reef', label: 'Reef', Landmass: ReefLandmass },
  { key: 'highlands', label: 'Highlands', Landmass: HighlandsLandmass },
]

interface BiomePickerProps {
  value: Goal['biome'] | null
  onChange: (biome: Goal['biome']) => void
}

export function BiomePicker({ value, onChange }: BiomePickerProps) {
  return (
    <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BIOMES.map(({ key, label, Landmass }) => {
        const accent = getBiomePalette(key).accent
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
              <ambientLight intensity={0.7} />
              <directionalLight position={[3, 5, 2]} intensity={1} />
              {/* Subtle per-biome rim light — the plan's optional "apply each
                  landmass's accent as a rim-light" detail, using BIOME_PALETTES
                  as intended rather than leaving the import unused. */}
              <pointLight position={[-2, 1.5, -2]} intensity={0.6} color={accent} />
              <RotatingLandmass Landmass={Landmass} />
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
function RotatingLandmass({ Landmass }: { Landmass: typeof JungleLandmass }) {
  const ref = useRef<Group>(null)
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useFrame((_, delta) => {
    if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.3
  })
  // A fixed, pleasing angle when motion is reduced — still a live 3D preview,
  // just not spinning.
  return (
    <group ref={ref} rotation={[0, reducedMotion ? Math.PI / 4 : 0, 0]} scale={0.6}>
      <Landmass />
    </group>
  )
}
