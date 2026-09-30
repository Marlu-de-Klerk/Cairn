import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { buildTrailCurve, buildTrailRibbon, positionAt } from '../roadmap/curve'
import { BIOME_TERRAIN, SHARED_PALETTE } from '../../lib/island/biomes'
import { ISLAND_YAW } from '../../lib/island/orientation'
import { getIslandLayout } from './terrain/islandCache'
import type { Goal } from './api'
import { islandLayoutSeed } from '../../lib/island/fixedIslands'
import { noPointerEvents } from './noPointerEvents'

const MAX_MILESTONES = 8


export interface MilestoneRow {
  title: string
  targetValue: string // raw input text; parsed by the caller for validation
}

interface MilestoneBuilderProps {
  kind: Goal['kind']
  milestones: MilestoneRow[]
  errors: Record<number, string>
  onChange: (milestones: MilestoneRow[]) => void
}

export function MilestoneBuilder({ kind, milestones, errors, onChange }: MilestoneBuilderProps) {
  function updateRow(index: number, patch: Partial<MilestoneRow>) {
    onChange(milestones.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  function addRow() {
    if (milestones.length >= MAX_MILESTONES) return
    onChange([...milestones, { title: '', targetValue: '' }])
  }
  function removeRow(index: number) {
    onChange(milestones.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <TrailPreview count={milestones.length} />
      <ul className="space-y-2">
        {milestones.map((row, index) => (
          <li key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <input
                value={row.title}
                onChange={(e) => updateRow(index, { title: e.target.value })}
                placeholder={`Milestone ${index + 1}`}
                className="w-full rounded-md border border-stone-light bg-ink px-3 py-1.5 font-body text-sm text-mist"
              />
              {kind === 'numeric' ? (
                <input
                  value={row.targetValue}
                  onChange={(e) => updateRow(index, { targetValue: e.target.value })}
                  inputMode="decimal"
                  placeholder="Value"
                  className="mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-1.5 font-body text-sm text-mist"
                />
              ) : null}
              {errors[index] ? <p className="mt-1 font-body text-xs text-accent-error">{errors[index]}</p> : null}
            </div>
            <button type="button" onClick={() => removeRow(index)} className="font-body text-xs text-mist/50 hover:text-mist">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addRow}
        disabled={milestones.length >= MAX_MILESTONES}
        className="font-body text-sm text-tide disabled:opacity-40"
      >
        Add milestone
      </button>
    </div>
  )
}

/**
 * Spec §6.2 step 3: "Show a live preview of the trail as they're added —
 * this is the moment the product sells itself." Milestones are evenly
 * spaced at t = i / (n + 1), matching src/lib/trail.ts's placement
 * invariant (CLAUDE.md) — never proportional to each milestone's value.
 */
function TrailPreview({ count }: { count: number }) {
  const layout = useMemo(() => getIslandLayout('jungle', islandLayoutSeed('jungle', BIOME_TERRAIN.jungle.previewSeed)), [])
  const curve = useMemo(() => buildTrailCurve(layout.trail.waypoints), [layout])
  const ribbon = useMemo(() => buildTrailRibbon(curve, layout, 0, 1, 0.05), [curve, layout])
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => positionAt(curve, (i + 1) / (count + 1))),
    [curve, count],
  )

  return (
    <div className="h-28 overflow-hidden rounded-md border border-stone-light bg-ink">
      <Canvas camera={{ position: [5.2, 4.4, 5.2], fov: 40 }} frameloop="demand" flat events={noPointerEvents} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <group rotation={[0, ISLAND_YAW, 0]}>
          <mesh geometry={ribbon}>
            <meshBasicMaterial color={SHARED_PALETTE.trailDone} transparent opacity={0.3} depthWrite={false} />
          </mesh>
          {dots.map((p, i) => (
            <mesh key={i} position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshBasicMaterial color={SHARED_PALETTE.cairnNext} />
            </mesh>
          ))}
        </group>
      </Canvas>
    </div>
  )
}
