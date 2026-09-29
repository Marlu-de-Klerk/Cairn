import { Suspense, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Goal } from '../archipelago/api'
import { Island } from '../archipelago/Island'
import { SceneEnvironment } from '../archipelago/SceneEnvironment'
import { HullRegistryProvider } from '../archipelago/hullRegistry'
import { devGoal, fixtureEntries, fixtureMilestones } from './fixtures'
import { TrailView } from '../roadmap/RoadmapTrail'
import { getIslandBuild, getIslandLayout, releaseIslandBuild } from '../archipelago/terrain/islandCache'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { islandPosition } from '../../lib/archipelago'
import { CameraRig } from '../archipelago/CameraRig'
import { isFocusView, parseDevParams } from './devParams'
import type { DevParams, DevView } from './devParams'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'

const BIOMES: readonly Goal['biome'][] = ['jungle', 'desert', 'tundra', 'volcano', 'reef', 'highlands']
const OVERVIEW_ARCHIPELAGO_SEED = 12345

type PresetView = Exclude<DevView, 'focus' | 'orbit-back' | 'phone'>

const PRESETS: Record<PresetView, { position: [number, number, number]; target: [number, number, number] }> = {
  hero: { position: [8.5, 7.5, 8.5], target: [0, 1.0, 0] },
  side: { position: [11, 3.2, 0.5], target: [0, 1.2, 0] },
  top: { position: [0.01, 15, 0.01], target: [0, 0, 0] },
  back: { position: [-8.5, 6.5, -8.5], target: [0, 1.0, 0] },
  // CameraRig's overview pose (radius 30, 35° elevation), frozen at azimuth π/4 so screenshots are repeatable.
  overview: { position: [17.4, 17.2, 17.4], target: [0, 0, 0] },
}

/** Writes renderer stats into a DOM overlay every frame (spec §8), so headless screenshots carry the numbers. */
function StatsProbe({ out }: { out: RefObject<HTMLPreElement | null> }) {
  useFrame(({ gl }) => {
    if (!out.current) return
    const { calls, triangles } = gl.info.render
    out.current.dataset.render = `draw calls ${calls}\ntriangles ${triangles.toLocaleString('en')}`
    out.current.textContent = `${out.current.dataset.render}\n${out.current.dataset.build ?? ''}`
  })
  return null
}

function useBuildStats(biome: Goal['biome'], params: DevParams, out: RefObject<HTMLPreElement | null>) {
  useEffect(() => {
    if (!out.current) return
    if (params.view === 'overview' || !isTerraced(biome)) {
      out.current.dataset.build = ''
      return
    }
    const build = getIslandBuild(biome, islandLayoutSeed(biome, params.seed), 'focus')
    const { lit, unlit, props } = build.triangles
    out.current.dataset.build = `build ${build.buildMs.toFixed(0)} ms (first build)\nterrain ${lit.toLocaleString('en')} lit + ${unlit.toLocaleString('en')} unlit\nprops ${props.toLocaleString('en')}`
    releaseIslandBuild(build)
  }, [biome, params.seed, params.view, out])
}

/** DEV-only visual harness (spec §10): the real scene environment and island, no auth or data round trip. */
export function DevIslandView() {
  const { biome: raw = 'jungle' } = useParams()
  const biome = BIOMES.includes(raw as Goal['biome']) ? (raw as Goal['biome']) : 'jungle'
  const [search] = useSearchParams()
  const params = parseDevParams(search)
  const focusView = isFocusView(params.view)
  const preset = PRESETS[focusView ? 'hero' : (params.view as PresetView)]
  const position = preset.position.map((p, i) => preset.target[i] + (p - preset.target[i]) * params.dist) as [number, number, number]
  const goal = devGoal(biome, params.seed, params.head)
  const milestones = fixtureMilestones(goal, params.milestones, params.head)
  const entries = fixtureEntries(goal, milestones, params.entries)
  const stats = useRef<HTMLPreElement>(null)
  useBuildStats(biome, params, stats)

  return (
    <div className="fixed inset-0 bg-[#EAF6F6]">
      <Canvas flat camera={{ position, fov: 50 }}>
        <SceneEnvironment />
        <HullRegistryProvider>
          <Suspense fallback={null}>
            {params.view === 'overview' ? (
              Array.from({ length: params.islands }, (_, i) => {
                const at = islandPosition(i, OVERVIEW_ARCHIPELAGO_SEED)
                const islandBiome = i === 0 ? biome : BIOMES[i % BIOMES.length]
                const islandGoal: Goal = { ...devGoal(islandBiome, params.seed + i, params.head), islandX: at.x, islandZ: at.z, islandRotation: at.rotation }
                return (
                  <Island key={i} goal={islandGoal} onClick={() => undefined} seedOverride={params.seed + i} materialKind={params.material} />
                )
              })
            ) : (
              <>
                <Island goal={goal} onClick={() => undefined} seedOverride={params.seed} materialKind={params.material} focused />
                {isTerraced(biome) ? (
                  <group rotation={[0, ISLAND_YAW, 0]}>
                    <TrailView goal={goal} layout={getIslandLayout(biome, islandLayoutSeed(biome, params.seed))} milestones={milestones} entries={entries} />
                  </group>
                ) : null}
              </>
            )}
          </Suspense>
        </HullRegistryProvider>
        {focusView ? (
          <CameraRig focusedGoal={goal} seedOverride={params.seed} devOrbit={params.orbit} />
        ) : (
          <OrbitControls target={preset.target} />
        )}
        <StatsProbe out={stats} />
      </Canvas>
      <pre
        ref={stats}
        className="pointer-events-none fixed left-2 top-2 rounded bg-black/55 px-2 py-1 font-mono text-[11px] leading-snug text-white"
      />
    </div>
  )
}
