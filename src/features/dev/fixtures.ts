import type { Goal } from '../archipelago/api'
import type { Milestone, ProgressEntry } from '../roadmap/api'

/** A goal at the world origin with no backend behind it, for the dev harness. `seed` only labels it; rendering uses seedOverride. */
export function devGoal(biome: Goal['biome'], seed: number, head = 0.55): Goal {
  return {
    id: `dev-${biome}-${seed}`,
    title: `${biome[0].toUpperCase()}${biome.slice(1)} ${seed}`,
    description: null,
    biome,
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: Number((10 * Math.max(0, Math.min(1, head))).toFixed(4)),
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
  }
}

/**
 * `count` evenly spaced milestones on a 0–10 goal, completed up to `head` (0–1). Values track t exactly, so with
 * currentValue = 10 × head, trail.ts's progressT lands the head marker at `head`.
 */
export function fixtureMilestones(goal: Goal, count: number, head: number): Milestone[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1)
    return { id: `${goal.id}-m${i}`, goalId: goal.id, title: `Milestone ${i + 1}`, targetValue: 10 * t, sortOrder: i, completedAt: t <= head ? '2026-09-01T00:00:00Z' : null }
  })
}

export function fixtureEntries(goal: Goal, _milestones: Milestone[], count: number): ProgressEntry[] {
  const reached = Math.max(0.5, goal.currentValue)
  return Array.from({ length: count }, (_, i) => ({
    id: `${goal.id}-e${i}`,
    goalId: goal.id,
    milestoneId: null,
    kind: 'update' as const,
    title: `Update ${i + 1}`,
    note: null,
    value: Number(((reached * (i + 1)) / (count + 1)).toFixed(2)),
    occurredAt: `2026-08-${String(10 + i).padStart(2, '0')}`,
  }))
}
