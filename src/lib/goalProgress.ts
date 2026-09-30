// What the roadmap panel says about a goal's progress. Pure: no React, no three.js.

export interface ProgressGoal {
  readonly title: string
  readonly kind: 'numeric' | 'checklist'
  readonly status: 'active' | 'completed' | 'archived'
  readonly unit: string | null
  readonly startValue: number
  readonly targetValue: number | null
  readonly currentValue: number
}

export interface ProgressMilestone {
  readonly title: string
  readonly targetValue: number | null
  readonly completedAt: string | null
}

export interface GoalProgress {
  /** 0..1, for the progress bar. */
  readonly fraction: number
  /** "5 of 10 km", "2 of 4 milestones", "Complete". */
  readonly summary: string
  /** What marking done does next: "Next: 8 km", "Last step: reach 10 km". Null once complete. */
  readonly next: string | null
}

/** A value with its unit, grouped and to at most two decimals: 1200 € -> "1,200 €". */
export function formatValue(value: number, unit: string | null, locale?: string): string {
  const number = value.toLocaleString(locale, { maximumFractionDigits: 2 })
  return unit ? `${number} ${unit}` : number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Milestones sorted by sort order, as everywhere else. */
export function goalProgress(goal: ProgressGoal, milestones: readonly ProgressMilestone[], locale?: string): GoalProgress {
  const done = milestones.filter((m) => m.completedAt !== null).length
  const complete = goal.status === 'completed'
  const nextMilestone = milestones.find((m) => m.completedAt === null)
  const next = complete
    ? null
    : nextMilestone
      ? `Next: ${nextMilestone.title}`
      : goal.kind === 'numeric' && goal.targetValue !== null
        ? `Last step: reach ${formatValue(goal.targetValue, goal.unit, locale)}`
        : 'Last step: mark the goal complete'

  if (goal.kind === 'checklist') {
    // The final "complete" step counts too, so every milestone done still leaves the bar short of full.
    return {
      fraction: complete ? 1 : milestones.length === 0 ? 0 : done / (milestones.length + 1),
      summary: complete ? 'Complete' : `${done} of ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`,
      next,
    }
  }

  const current = complete && goal.targetValue !== null ? goal.targetValue : goal.currentValue
  if (goal.targetValue === null) return { fraction: complete ? 1 : 0, summary: complete ? 'Complete' : formatValue(current, goal.unit, locale), next }
  const span = goal.targetValue - goal.startValue
  return {
    fraction: complete ? 1 : span > 0 ? clamp01((current - goal.startValue) / span) : 0,
    summary: `${formatValue(current, null, locale)} of ${formatValue(goal.targetValue, goal.unit, locale)}`,
    next,
  }
}

/**
 * A journey entry's date: "12 Sep" this year, "12 Sep 2025" otherwise. `iso` is a SQL date (YYYY-MM-DD), read as a
 * local calendar date, never shifted by time zone.
 */
export function formatEntryDate(iso: string, today: Date = new Date(), locale?: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(year === today.getFullYear() ? {} : { year: 'numeric' }),
  })
}
