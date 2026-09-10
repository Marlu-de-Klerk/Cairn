// src/features/roadmap/api.test.ts
import { describe, expect, it } from 'vitest'
import { nextStepToMark } from './api'
import type { Milestone } from './api'
import type { Goal } from '../archipelago/api'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'Run 10K',
    description: null,
    biome: 'jungle',
    kind: 'numeric',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    currentValue: 0,
    status: 'active',
    islandX: 0,
    islandZ: 0,
    islandRotation: 0,
    isPublic: false,
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm-1',
    goalId: 'goal-1',
    title: '2 km',
    targetValue: 2,
    sortOrder: 0,
    completedAt: null,
    ...overrides,
  }
}

describe('nextStepToMark', () => {
  it('returns the first uncompleted milestone when one exists', () => {
    const milestones = [
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: '2026-08-01T00:00:00Z' }),
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: null }),
      makeMilestone({ id: 'm-3', sortOrder: 2, completedAt: null }),
    ]
    const step = nextStepToMark(makeGoal(), milestones)
    expect(step).toEqual({ kind: 'milestone', milestone: milestones[1] })
  })

  it('returns final-target once every real milestone is completed', () => {
    const milestones = [
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: '2026-08-01T00:00:00Z' }),
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: '2026-08-10T00:00:00Z' }),
    ]
    const step = nextStepToMark(makeGoal({ status: 'active' }), milestones)
    expect(step).toEqual({ kind: 'final-target' })
  })

  it('returns final-target when there are no milestones at all', () => {
    const step = nextStepToMark(makeGoal(), [])
    expect(step).toEqual({ kind: 'final-target' })
  })

  it('returns done once the goal itself is completed', () => {
    const milestones = [makeMilestone({ completedAt: '2026-08-01T00:00:00Z' })]
    const step = nextStepToMark(makeGoal({ status: 'completed' }), milestones)
    expect(step).toEqual({ kind: 'done' })
  })

  it('prefers milestone order over insertion order', () => {
    const milestones = [
      makeMilestone({ id: 'm-2', sortOrder: 1, completedAt: null }),
      makeMilestone({ id: 'm-1', sortOrder: 0, completedAt: null }),
    ]
    // sortOrder 0 (m-1) is earlier in the sequence even though it's second in the array —
    // the caller is responsible for passing pre-sorted milestones (same precondition as
    // trail.ts), so this test documents that nextStepToMark trusts the array order given,
    // it does not re-sort. Pass already-sorted input.
    const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder)
    const step = nextStepToMark(makeGoal(), sorted)
    expect(step).toEqual({ kind: 'milestone', milestone: sorted[0] })
    expect((step as { kind: 'milestone'; milestone: Milestone }).milestone.id).toBe('m-1')
  })
})
