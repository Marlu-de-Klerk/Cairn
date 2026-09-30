import { describe, expect, it } from 'vitest'
import { formatEntryDate, formatValue, goalProgress, updateEffect } from './goalProgress'
import type { ProgressGoal, ProgressMilestone } from './goalProgress'

const run10k: ProgressGoal = { title: 'Run a 10K', kind: 'numeric', status: 'active', unit: 'km', startValue: 0, targetValue: 10, currentValue: 5 }
const ms = (...done: boolean[]): ProgressMilestone[] =>
  done.map((d, i) => ({ title: `Step ${i + 1}`, targetValue: (i + 1) * 2, completedAt: d ? '2026-09-10T10:00:00Z' : null }))

describe('formatValue', () => {
  it('groups thousands, keeps up to two decimals and appends the unit', () => {
    expect(formatValue(1200, '€', 'en-GB')).toBe('1,200 €')
    expect(formatValue(6.5, 'km', 'en-GB')).toBe('6.5 km')
    expect(formatValue(1 / 3, null, 'en-GB')).toBe('0.33')
  })
})

describe('goalProgress', () => {
  it('measures a numeric goal by its value', () => {
    const p = goalProgress(run10k, ms(true, true, false), 'en-GB')
    expect(p.fraction).toBeCloseTo(0.5)
    expect(p.summary).toBe('5 of 10 km')
    expect(p.next).toBe('Next: Step 3')
  })

  it('measures from the starting value', () => {
    expect(goalProgress({ ...run10k, startValue: 2, currentValue: 6 }, [], 'en-GB').fraction).toBeCloseTo(0.5)
  })

  it('names the final target once every milestone is done', () => {
    expect(goalProgress(run10k, ms(true), 'en-GB').next).toBe('Last step: reach 10 km')
  })

  it('counts checklist milestones, leaving room for the final step', () => {
    const goal: ProgressGoal = { ...run10k, kind: 'checklist', unit: null, targetValue: null }
    const p = goalProgress(goal, ms(true, true, false, false))
    expect(p.summary).toBe('2 of 4 milestones')
    expect(p.fraction).toBeCloseTo(2 / 5)
    expect(goalProgress(goal, ms(true, true)).next).toBe('Last step: mark the goal complete')
  })

  it('is full and has no next step once complete', () => {
    const p = goalProgress({ ...run10k, status: 'completed', currentValue: 8 }, ms(true, true, true), 'en-GB')
    expect(p).toEqual({ fraction: 1, summary: '10 of 10 km', next: null })
    expect(goalProgress({ ...run10k, kind: 'checklist', status: 'completed' }, ms(true)).summary).toBe('Complete')
  })

  it('prompts to complete once the value reaches the target', () => {
    expect(goalProgress({ ...run10k, currentValue: 10 }, ms(true, true, true), 'en-GB').next).toBe('Target reached: complete the goal')
  })

  it('clamps a value past the target', () => {
    expect(goalProgress({ ...run10k, currentValue: 12 }, []).fraction).toBe(1)
  })
})

describe('formatEntryDate', () => {
  const today = new Date(2026, 8, 30)
  it('drops the year for this year and keeps it otherwise', () => {
    expect(formatEntryDate('2026-09-12', today, 'en-GB')).toBe('12 Sept')
    expect(formatEntryDate('2025-12-31', today, 'en-GB')).toBe('31 Dec 2025')
  })

  it('reads the date as a local calendar date', () => {
    expect(formatEntryDate('2026-01-01', today, 'en-GB')).toBe('1 Jan')
  })

  it('passes through anything that is not a date', () => {
    expect(formatEntryDate('soon', today)).toBe('soon')
  })
})

describe('updateEffect', () => {
  // milestones at 2, 4, 6; the first is done; current value 3
  const goal: ProgressGoal = { ...run10k, currentValue: 3 }
  const milestones = ms(true, false, false)

  it('moves progress up to a further value and marks the milestones it reaches', () => {
    expect(updateEffect(goal, milestones, 6.5)).toEqual({ currentValue: 6.5, passedMilestones: [1, 2] })
    expect(updateEffect(goal, milestones, 5)).toEqual({ currentValue: 5, passedMilestones: [1] })
  })

  it('never moves progress back, or on an update without a value', () => {
    expect(updateEffect(goal, milestones, 2.5)).toEqual({ currentValue: null, passedMilestones: [] })
    expect(updateEffect(goal, milestones, 3)).toEqual({ currentValue: null, passedMilestones: [] })
    expect(updateEffect(goal, milestones, null)).toEqual({ currentValue: null, passedMilestones: [] })
  })

  it('leaves checklist and completed goals alone', () => {
    expect(updateEffect({ ...goal, kind: 'checklist' }, milestones, 9).currentValue).toBeNull()
    expect(updateEffect({ ...goal, status: 'completed' }, milestones, 9).currentValue).toBeNull()
  })

  it('goes past the target without completing anything beyond the milestones', () => {
    expect(updateEffect(goal, milestones, 12)).toEqual({ currentValue: 12, passedMilestones: [1, 2] })
  })
})
