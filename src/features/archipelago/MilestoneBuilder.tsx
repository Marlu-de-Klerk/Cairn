import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { buildTrailCurve, positionAt } from '../roadmap/curve'
import { BASE_TOKENS } from '../../lib/theme'
import type { Goal } from './api'

const MAX_MILESTONES = 8

// Arbitrary preview-only radius/height/seed — this canvas never renders the
// real island, so it doesn't need to match Island.tsx's real landmass footprint
// the way RoadmapTrail's curve does; it only needs a stable, pleasant-looking
// spiral to preview even spacing against.
const PREVIEW_BASE_RADIUS = 2
const PREVIEW_HEIGHT = 1.5
const PREVIEW_SEED = 0

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
  const curve = useMemo(() => buildTrailCurve(PREVIEW_BASE_RADIUS, PREVIEW_HEIGHT, PREVIEW_SEED), [])
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => positionAt(curve, (i + 1) / (count + 1))),
    [curve, count],
  )

  return (
    <div className="h-28 overflow-hidden rounded-md border border-stone-light bg-ink">
      <Canvas camera={{ position: [3, 2, 3], fov: 40 }} frameloop="demand">
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 2]} />
        {dots.map((p, i) => (
          <mesh key={i} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={BASE_TOKENS.lantern} />
          </mesh>
        ))}
      </Canvas>
    </div>
  )
}
