import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Mesh } from 'three'
import type { Goal } from './api'

const BIOME_COLORS: Record<Goal['biome'], string> = {
  jungle: '#2d5016',
  desert: '#c9a66b',
  tundra: '#dbe9f4',
  volcano: '#3b3b3b',
  reef: '#2ec4b6',
  highlands: '#6b7280',
}

interface IslandProps {
  goal: Goal
  onClick: () => void
  focused?: boolean
}

export function Island({ goal, onClick, focused = false }: IslandProps) {
  const meshRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (!meshRef.current) return
    // The hover lift has no purpose once this is the focused island — RoadmapTrail
    // renders as a sibling at the same coordinates and doesn't lift with it, so
    // raising the cone here would swallow the whole trail inside the mesh.
    const targetY = hovered && !focused ? 0.3 : 0
    meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.15
  })

  const progressLabel =
    goal.kind === 'numeric'
      ? `${goal.currentValue}${goal.unit ? ` ${goal.unit}` : ''} / ${goal.targetValue ?? '?'}${goal.unit ? ` ${goal.unit}` : ''}`
      : goal.status === 'completed'
        ? 'Complete'
        : 'In progress'

  return (
    <group position={[goal.islandX, 0, goal.islandZ]} rotation={[0, goal.islandRotation, 0]}>
      <mesh
        ref={meshRef}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <coneGeometry args={[2, 1.5, 8]} />
        <meshStandardMaterial color={BIOME_COLORS[goal.biome]} />
      </mesh>

      <Html position={[0, 2.2, 0]} center occlude distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-md bg-slate-950/80 px-2 py-1 text-xs text-slate-100">
          {goal.title} — {progressLabel}
        </div>
      </Html>

      {hovered ? (
        <Html position={[0, 3, 0]} center occlude distanceFactor={12}>
          <div className="w-48 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 shadow-lg">
            <p className="font-medium">{goal.title}</p>
            {goal.description ? <p className="mt-1 text-xs text-slate-400">{goal.description}</p> : null}
            <p className="mt-2 text-xs text-slate-300">{progressLabel}</p>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
