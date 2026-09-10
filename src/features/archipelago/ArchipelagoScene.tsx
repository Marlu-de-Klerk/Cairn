import { Canvas } from '@react-three/fiber'
import { useMatch, useNavigate } from 'react-router'
import { useGoals } from './api'
import { Island } from './Island'
import { Water } from './Water'
import { CameraRig } from './CameraRig'
import { RoadmapTrail } from '../roadmap/RoadmapTrail'

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

  const filteredGoals = goals?.filter((goal) => showCompleted || goal.status !== 'completed') ?? []
  // Resolved from the unfiltered list (matching HomeOverlay): a goal the user
  // explicitly navigated to stays focused even when the display filter would
  // otherwise hide it, so the 3D scene and the 2D panel never disagree.
  const focusedGoal = goals?.find((goal) => goal.id === focusedGoalId) ?? null
  // ...and its island renders alongside the filtered set, so its trail is never
  // left floating over empty water.
  const visibleGoals =
    focusedGoal && !filteredGoals.includes(focusedGoal) ? [...filteredGoals, focusedGoal] : filteredGoals

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1} />
        <Water />
        {visibleGoals.map((goal) => (
          <Island
            key={goal.id}
            goal={goal}
            onClick={() => navigate(`/g/${goal.id}`)}
            focused={goal.id === focusedGoal?.id}
          />
        ))}
        {focusedGoal ? (
          <group position={[focusedGoal.islandX, 0, focusedGoal.islandZ]} rotation={[0, focusedGoal.islandRotation, 0]}>
            <RoadmapTrail key={focusedGoal.id} goal={focusedGoal} />
          </group>
        ) : null}
        <CameraRig focusedGoal={focusedGoal} />
      </Canvas>
    </div>
  )
}
