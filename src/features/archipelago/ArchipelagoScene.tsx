import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useMatch, useNavigate } from 'react-router'
import { useGoals } from './api'
import type { Goal } from './api'
import { Island } from './Island'
import { SceneEnvironment } from './SceneEnvironment'
import { HullRegistryProvider } from './hullRegistry'
import { CameraRig } from './CameraRig'
import { RoadmapTrail } from '../roadmap/RoadmapTrail'
import { isTerraced } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { preloadHandBuiltIslands } from './models/HandBuiltIsland'

interface ArchipelagoSceneProps {
  showCompleted: boolean
}

export function ArchipelagoScene({ showCompleted }: ArchipelagoSceneProps) {
  const navigate = useNavigate()
  // `useMatch` matches the browser location directly. `useParams` would read
  // the enclosing route context, and this component is mounted as a sibling of
  // the nested <Routes> that declares /g/:id — so it would always be undefined.
  const focusedGoalId = useMatch('/g/:id')?.params.id
  const { data: goals } = useGoals()
  const biomeKey = [...new Set(goals?.map((goal) => goal.biome))].sort().join(',')
  useEffect(() => {
    if (biomeKey) preloadHandBuiltIslands(biomeKey.split(',') as Goal['biome'][])
  }, [biomeKey])

  const filteredGoals = goals?.filter((goal) => showCompleted || goal.status !== 'completed') ?? []
  // Resolved from the unfiltered list (matching HomeOverlay): a goal the user
  // explicitly navigated to stays focused even when the display filter would
  // otherwise hide it, so the 3D scene and the 2D panel never disagree.
  const focusedGoal = goals?.find((goal) => goal.id === focusedGoalId) ?? null
  // ...and its island renders alongside the filtered set, so its trail is never
  // left floating over empty water.
  const visibleGoals =
    focusedGoal && !filteredGoals.includes(focusedGoal) ? [...filteredGoals, focusedGoal] : filteredGoals

  // Face the idle orbit toward the user's own islands from the start —
  // otherwise a fixed default azimuth has no relationship to where the
  // golden-angle spiral actually placed them (see CameraRig's own comment).
  const initialAzimuth = visibleGoals.length > 0 ? Math.atan2(visibleGoals[0].islandZ, visibleGoals[0].islandX) : undefined

  return (
    <div className="fixed inset-0 -z-10">
      {/* A focused terraced island redraws only on demand: every animator there (camera flight, orbit drag, trail
          springs, cairn pulse, hover lift) calls invalidate(). Legacy biomes and the overview's auto-rotate still
          animate every frame. touch-action: none keeps a one-finger orbit drag from scrolling the page. */}
      <Canvas
        camera={{ fov: 50 }}
        flat
        frameloop={focusedGoal && isTerraced(focusedGoal.biome) ? 'demand' : 'always'}
        style={{ touchAction: 'none' }}
      >
        <SceneEnvironment />
        <HullRegistryProvider>
        {visibleGoals.map((goal) => (
          <Island
            key={goal.id}
            goal={goal}
            onClick={() => navigate(`/g/${goal.id}`)}
            focused={goal.id === focusedGoal?.id}
          />
        ))}
        {focusedGoal ? (
          <group position={[focusedGoal.islandX, 0, focusedGoal.islandZ]} rotation={[0, isTerraced(focusedGoal.biome) ? ISLAND_YAW : focusedGoal.islandRotation, 0]}>
            <RoadmapTrail key={focusedGoal.id} goal={focusedGoal} />
          </group>
        ) : null}
        </HullRegistryProvider>
        <CameraRig focusedGoal={focusedGoal} initialAzimuth={initialAzimuth} />
      </Canvas>
    </div>
  )
}
