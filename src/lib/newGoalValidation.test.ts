import { describe, expect, it } from 'vitest'
import { validateMilestones } from './newGoalValidation'

describe('validateMilestones', () => {
  it('accepts strictly increasing milestones inside (start, target)', () => {
    const result = validateMilestones('numeric', 0, 10, [
      { title: '2K', targetValue: 2 },
      { title: '5K', targetValue: 5 },
      { title: '8K', targetValue: 8 },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects a milestone at or below the previous one', () => {
    const result = validateMilestones('numeric', 0, 10, [
      { title: '5K', targetValue: 5 },
      { title: 'Also 5K', targetValue: 5 },
    ])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[1]).toMatch(/greater than/i)
  })

  it('rejects a milestone at or below start_value', () => {
    const result = validateMilestones('numeric', 2, 10, [{ title: 'Too low', targetValue: 2 }])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toBeDefined()
  })

  it('rejects a milestone at or above target_value', () => {
    const result = validateMilestones('numeric', 0, 10, [{ title: 'Too high', targetValue: 10 }])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toBeDefined()
  })

  it('rejects more than 8 milestones', () => {
    const milestones = Array.from({ length: 9 }, (_, i) => ({ title: `M${i}`, targetValue: i + 1 }))
    const result = validateMilestones('numeric', 0, 20, milestones)
    expect(result.valid).toBe(false)
  })

  it('checklist milestones need no targetValue and skip numeric ordering checks', () => {
    const result = validateMilestones('checklist', 0, null, [
      { title: 'Step one', targetValue: null },
      { title: 'Step two', targetValue: null },
    ])
    expect(result.valid).toBe(true)
  })

  it('accepts zero milestones', () => {
    expect(validateMilestones('numeric', 0, 10, []).valid).toBe(true)
  })
})
