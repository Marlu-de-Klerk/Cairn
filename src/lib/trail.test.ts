import { describe, expect, it } from 'vitest'
import { entryT, entrySide, entryTs, legOf, milestoneTs, progressT, type TrailEntry, type TrailGoal, type TrailMilestone } from './trail'

describe('milestoneTs', () => {
  it('returns an empty array for zero milestones', () => {
    expect(milestoneTs(0)).toEqual([])
  })

  it('places a single milestone at the midpoint', () => {
    expect(milestoneTs(1)).toEqual([0.5])
  })

  it('spaces milestones evenly, not proportionally to value', () => {
    // Run 10K: 3 milestones -> t = 1/4, 2/4, 3/4, regardless of their values (2, 5, 8)
    expect(milestoneTs(3)).toEqual([0.25, 0.5, 0.75])
  })

  it('spaces 8 milestones (the max allowed) evenly', () => {
    const ts = milestoneTs(8)
    expect(ts).toHaveLength(8)
    expect(ts[0]).toBeCloseTo(1 / 9)
    expect(ts[7]).toBeCloseTo(8 / 9)
  })
})

describe('legOf', () => {
  it('finds the single leg when there are no milestones', () => {
    expect(legOf(0.5, [])).toEqual({ legIndex: 0, legStart: 0, legEnd: 1 })
  })

  it('finds the correct leg among several milestones', () => {
    const ts = milestoneTs(3) // [0.25, 0.5, 0.75]
    expect(legOf(0.1, ts)).toEqual({ legIndex: 0, legStart: 0, legEnd: 0.25 })
    expect(legOf(0.3, ts)).toEqual({ legIndex: 1, legStart: 0.25, legEnd: 0.5 })
    expect(legOf(0.6, ts)).toEqual({ legIndex: 2, legStart: 0.5, legEnd: 0.75 })
    expect(legOf(0.9, ts)).toEqual({ legIndex: 3, legStart: 0.75, legEnd: 1 })
  })

  it('resolves an exact boundary to the leg it starts', () => {
    const ts = milestoneTs(3)
    expect(legOf(0.25, ts)).toEqual({ legIndex: 1, legStart: 0.25, legEnd: 0.5 })
  })

  it('clamps t outside [0,1] to the first/last leg', () => {
    const ts = milestoneTs(3)
    expect(legOf(-0.5, ts)).toEqual({ legIndex: 0, legStart: 0, legEnd: 0.25 })
    expect(legOf(1.5, ts)).toEqual({ legIndex: 3, legStart: 0.75, legEnd: 1 })
  })
})

const run10k: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 0 }
const run10kMilestones: TrailMilestone[] = [
  { targetValue: 2, sortOrder: 1, completedAt: null },
  { targetValue: 5, sortOrder: 2, completedAt: null },
  { targetValue: 8, sortOrder: 3, completedAt: null },
]

describe('entryT', () => {
  it('matches the spec\'s Run 10K reference case: "Fastest 3K" lands at t ≈ 0.333', () => {
    const entry: TrailEntry = { value: 3, occurredAt: '2026-01-01' }
    const t = entryT(entry, run10k, run10kMilestones)
    expect(t).toBeCloseTo(0.3333, 3)
  })

  it('places a value exactly at a milestone boundary at that milestone\'s own t', () => {
    const t = entryT({ value: 5, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBeCloseTo(0.5, 5)
  })

  it('places a value in the final leg (between the last milestone and the target)', () => {
    const t = entryT({ value: 9, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    // value 9 sits halfway through the final leg [8,10] -> t = 0.75 + 0.5 * 0.25 = 0.875
    expect(t).toBeCloseTo(0.875, 5)
  })

  it('clamps a value below start to the first leg\'s start', () => {
    const t = entryT({ value: -5, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBe(0)
  })

  it('clamps a value above target to the last leg\'s end', () => {
    const t = entryT({ value: 100, occurredAt: '2026-01-01' }, run10k, run10kMilestones)
    expect(t).toBe(1)
  })

  it('places a value with zero milestones directly between start and target', () => {
    const t = entryT({ value: 5, occurredAt: '2026-01-01' }, run10k, [])
    expect(t).toBeCloseTo(0.5, 5)
  })

  it('places a no-value entry at the midpoint of the currently active leg', () => {
    const goalAtStart: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 0 }
    // progressT with no completed milestones and currentValue=0 sits at the very start of leg [0, 0.25]
    const t = entryT({ value: null, occurredAt: '2026-01-01' }, goalAtStart, run10kMilestones)
    expect(t).toBeCloseTo(0.125, 5) // midpoint of [0, 0.25]
  })

  it('places a checklist-goal entry at the midpoint of the active leg even if it carries a value', () => {
    const checklistGoal: TrailGoal = { kind: 'checklist', status: 'active', startValue: 0, targetValue: null, currentValue: 0 }
    const checklistMilestones: TrailMilestone[] = [
      { targetValue: null, sortOrder: 1, completedAt: null },
    ]
    const t = entryT({ value: 42, occurredAt: '2026-01-01' }, checklistGoal, checklistMilestones)
    expect(t).toBeCloseTo(0.25, 5) // midpoint of [0, 0.5]
  })

  it('throws when milestones are not sorted by sortOrder ascending', () => {
    const outOfOrder: TrailMilestone[] = [
      { targetValue: 5, sortOrder: 2, completedAt: null },
      { targetValue: 2, sortOrder: 1, completedAt: null },
    ]
    expect(() => entryT({ value: 3, occurredAt: '2026-01-01' }, run10k, outOfOrder)).toThrow(/sortOrder/)
  })
})

describe('entryTs', () => {
  it('matches entryT for a single value-bearing entry', () => {
    const entries: TrailEntry[] = [{ value: 3, occurredAt: '2026-01-01' }]
    const [t] = entryTs(entries, run10k, run10kMilestones)
    expect(t).toBeCloseTo(entryT(entries[0], run10k, run10kMilestones), 10)
  })

  it('matches entryT for a single no-value entry (the k=1 case reduces to the same midpoint)', () => {
    const goalAtStart: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 0 }
    const entries: TrailEntry[] = [{ value: null, occurredAt: '2026-01-01' }]
    const [t] = entryTs(entries, goalAtStart, run10kMilestones)
    expect(t).toBeCloseTo(entryT(entries[0], goalAtStart, run10kMilestones), 10)
    expect(t).toBeCloseTo(0.125, 5) // midpoint of the active leg [0, 0.25]
  })

  it('spreads three no-value entries distinctly within the shared active leg, ordered by occurredAt', () => {
    const goalAtStart: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 0 }
    // deliberately out of chronological order in the input array
    const entries: TrailEntry[] = [
      { value: null, occurredAt: '2026-01-03' }, // latest -> should land last (largest t) within [0, 0.25]
      { value: null, occurredAt: '2026-01-01' }, // earliest -> should land first (smallest t)
      { value: null, occurredAt: '2026-01-02' }, // middle
    ]
    const ts = entryTs(entries, goalAtStart, run10kMilestones)

    // active leg is [0, 0.25]; k=3 -> t = 0.25 * (j+1)/4 for j=0,1,2
    expect(ts[1]).toBeCloseTo(0.0625, 5) // 2026-01-01, j=0
    expect(ts[2]).toBeCloseTo(0.125, 5) // 2026-01-02, j=1
    expect(ts[0]).toBeCloseTo(0.1875, 5) // 2026-01-03, j=2

    // all distinct
    expect(new Set(ts.map((t) => t.toFixed(6))).size).toBe(3)
    // ascending occurredAt order maps to ascending t
    expect(ts[1]).toBeLessThan(ts[2])
    expect(ts[2]).toBeLessThan(ts[0])
  })

  it('leaves value-bearing entries unaffected by no-value entries spreading around them', () => {
    const entries: TrailEntry[] = [
      { value: 3, occurredAt: '2026-01-01' },
      { value: null, occurredAt: '2026-01-02' },
      { value: 9, occurredAt: '2026-01-03' },
      { value: null, occurredAt: '2026-01-04' },
    ]
    const ts = entryTs(entries, run10k, run10kMilestones)

    expect(ts[0]).toBeCloseTo(entryT(entries[0], run10k, run10kMilestones), 10) // value=3 -> ~0.3333
    expect(ts[2]).toBeCloseTo(entryT(entries[2], run10k, run10kMilestones), 10) // value=9 -> 0.875

    // the two no-value entries (k=2) still spread distinctly within the active leg [0, 0.25]
    expect(ts[1]).toBeCloseTo(0.25 / 3, 5) // 2026-01-02, j=0
    expect(ts[3]).toBeCloseTo(0.5 / 3, 5) // 2026-01-04, j=1
    expect(ts[1]).not.toBeCloseTo(ts[3], 5)
  })

  it('throws when milestones are not sorted by sortOrder ascending', () => {
    const outOfOrder: TrailMilestone[] = [
      { targetValue: 5, sortOrder: 2, completedAt: null },
      { targetValue: 2, sortOrder: 1, completedAt: null },
    ]
    expect(() => entryTs([{ value: 3, occurredAt: '2026-01-01' }], run10k, outOfOrder)).toThrow(/sortOrder/)
  })
})

describe('progressT', () => {
  it('sits at the start when nothing is completed and currentValue is 0', () => {
    expect(progressT(run10k, run10kMilestones)).toBe(0)
  })

  it('nudges forward within the first leg as currentValue increases, with zero milestones', () => {
    const goal: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 5 }
    expect(progressT(goal, [])).toBeCloseTo(0.5, 5)
  })

  it('sits at a single milestone\'s t once it is completed', () => {
    const goal: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 5 }
    const milestones: TrailMilestone[] = [{ targetValue: 5, sortOrder: 1, completedAt: '2026-01-01' }]
    expect(progressT(goal, milestones)).toBe(0.5)
  })

  it('nudges forward past a completed milestone toward the next one', () => {
    // 2 km done (t=1/3), now at 3.5 km toward the 5 km milestone (t=2/3)
    const goal: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 3.5 }
    const milestones: TrailMilestone[] = [
      { targetValue: 2, sortOrder: 1, completedAt: '2026-01-01' },
      { targetValue: 5, sortOrder: 2, completedAt: null },
    ]
    const ts = milestoneTs(2) // [1/3, 2/3]
    const fraction = (3.5 - 2) / (5 - 2) // 0.5
    const expected = ts[0] + fraction * (ts[1] - ts[0])
    expect(progressT(goal, milestones)).toBeCloseTo(expected, 5)
  })

  it('does not nudge for a checklist goal — sits exactly at the last completed milestone', () => {
    const goal: TrailGoal = { kind: 'checklist', status: 'active', startValue: 0, targetValue: null, currentValue: 0 }
    const milestones: TrailMilestone[] = [
      { targetValue: null, sortOrder: 1, completedAt: '2026-01-01' },
      { targetValue: null, sortOrder: 2, completedAt: null },
    ]
    expect(progressT(goal, milestones)).toBe(milestoneTs(2)[0])
  })

  it('returns 1 for a completed checklist goal even with incomplete milestones (status short-circuits everything)', () => {
    const goal: TrailGoal = { kind: 'checklist', status: 'completed', startValue: 0, targetValue: null, currentValue: 0 }
    const milestones: TrailMilestone[] = [
      { targetValue: null, sortOrder: 1, completedAt: '2026-01-01' },
      { targetValue: null, sortOrder: 2, completedAt: null }, // deliberately NOT completed
    ]
    expect(progressT(goal, milestones)).toBe(1)
  })

  it('returns 1 for a completed numeric goal regardless of currentValue', () => {
    const goal: TrailGoal = { kind: 'numeric', status: 'completed', startValue: 0, targetValue: 10, currentValue: 3 }
    const milestones: TrailMilestone[] = [
      { targetValue: 8, sortOrder: 1, completedAt: null }, // deliberately NOT completed
    ]
    expect(progressT(goal, milestones)).toBe(1)
  })

  it('throws when milestones are not sorted by sortOrder ascending', () => {
    const goal: TrailGoal = { kind: 'numeric', status: 'active', startValue: 0, targetValue: 10, currentValue: 0 }
    const outOfOrder: TrailMilestone[] = [
      { targetValue: 5, sortOrder: 2, completedAt: null },
      { targetValue: 2, sortOrder: 1, completedAt: null },
    ]
    expect(() => progressT(goal, outOfOrder)).toThrow(/sortOrder/)
  })
})

describe('entrySide', () => {
  it('alternates starting with the positive side', () => {
    expect(entrySide(0)).toBe(1)
    expect(entrySide(1)).toBe(-1)
    expect(entrySide(2)).toBe(1)
    expect(entrySide(3)).toBe(-1)
  })
})
