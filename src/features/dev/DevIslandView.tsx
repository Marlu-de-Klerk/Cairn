import { Suspense } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Goal } from '../archipelago/api'
import { Island } from '../archipelago/Island'
import { SceneEnvironment } from '../archipelago/SceneEnvironment'
import { HullRegistryProvider } from '../archipelago/hullRegistry'
import { devGoal, fixtureEntries, fixtureMilestones } from './fixtures'
import { TrailView } from '../roadmap/RoadmapTrail'
import { getIslandLayout } from '../archipelago/terrain/islandCache'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { parseDevParams } from './devParams'
import type { DevView } from './devParams'

const BIOMES: readonly Goal['biome'][] = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands']

const PRESETS: Record<DevView, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [8.5, 7.5, 8.5], target: [0, 1.0, 0] },
  side: { position: [11, 3.2, 0.5], target: [0, 1.2, 0] },
  top: { position: [0.01, 15, 0.01], target: [0, 0, 0] },
  back: { position: [-8.5, 6.5, -8.5], target: [0, 1.0, 0] },
}

/** DEV-only visual harness (spec §10): the real scene environment and island, no auth or data round trip. */
export function DevIslandView() {
  const { biome: raw = 'jungle' } = useParams()
  const biome = BIOMES.includes(raw as Goal['biome']) ? (raw as Goal['biome']) : 'jungle'
  const [search] = useSearchParams()
  const params = parseDevParams(search)
  const preset = PRESETS[params.view]
  const position = preset.position.map((p, i) => preset.target[i] + (p - preset.target[i]) * params.dist) as [number, number, number]
  const goal = devGoal(biome, params.seed, params.head)
  const milestones = fixtureMilestones(goal, params.milestones, params.head)
  const entries = fixtureEntries(goal, milestones, params.entries)

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas flat camera={{ position, fov: 50 }}>
        <SceneEnvironment />
        <HullRegistryProvider>
          <Suspense fallback={null}>
            <Island goal={goal} onClick={() => undefined} seedOverride={params.seed} focused />
            {isTerraced(biome) ? (
              <group rotation={[0, ISLAND_YAW, 0]}>
                <TrailView goal={goal} layout={getIslandLayout(biome, params.seed)} milestones={milestones} entries={entries} />
              </group>
            ) : null}
          </Suspense>
        </HullRegistryProvider>
        <OrbitControls target={preset.target} />
      </Canvas>
    </div>
  )
}
