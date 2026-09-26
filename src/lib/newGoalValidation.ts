export interface MilestoneInput {
  title: string
  targetValue: number | null
}

export type MilestoneValidationResult = { valid: true } | { valid: false; errors: Record<number, string> }

const MAX_MILESTONES = 8

/**
 * Live validation for the New Goal milestones step (spec §6.2 step 3):
 * "Values must be strictly increasing and inside (start, target)." Only
 * numeric-kind goals have ordering to validate — checklist milestones carry
 * no target_value at all.
 */
export function validateMilestones(
  kind: 'numeric' | 'checklist',
  startValue: number,
  targetValue: number | null,
  milestones: MilestoneInput[],
): MilestoneValidationResult {
  const errors: Record<number, string> = {}

  if (milestones.length > MAX_MILESTONES) {
    errors[milestones.length - 1] = `Add up to ${MAX_MILESTONES} milestones.`
  }

  if (kind === 'checklist') {
    return Object.keys(errors).length > 0 ? { valid: false, errors } : { valid: true }
  }

  let previous = startValue
  milestones.forEach((milestone, index) => {
    const value = milestone.targetValue
    if (value === null) {
      errors[index] = 'Enter a value for this milestone.'
      return
    }
    if (value <= previous) {
      errors[index] = previous === startValue ? 'Must be greater than the starting value.' : 'Must be greater than the previous milestone.'
      return
    }
    if (targetValue !== null && value >= targetValue) {
      errors[index] = 'Must be less than the target.'
      return
    }
    previous = value
  })

  return Object.keys(errors).length > 0 ? { valid: false, errors } : { valid: true }
}
