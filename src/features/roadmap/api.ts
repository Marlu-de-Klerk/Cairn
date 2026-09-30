import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Goal } from '../archipelago/api'
import { updateEffect } from '../../lib/goalProgress'

export interface Milestone {
  id: string
  goalId: string
  title: string
  targetValue: number | null
  sortOrder: number
  completedAt: string | null
}

export interface ProgressEntry {
  id: string
  goalId: string
  milestoneId: string | null
  kind: 'milestone' | 'update'
  title: string
  note: string | null
  value: number | null
  occurredAt: string
}

function toMilestone(row: {
  id: string
  goal_id: string
  title: string
  target_value: number | null
  sort_order: number
  completed_at: string | null
}): Milestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    targetValue: row.target_value,
    sortOrder: row.sort_order,
    completedAt: row.completed_at,
  }
}

function toProgressEntry(row: {
  id: string
  goal_id: string
  milestone_id: string | null
  kind: string
  title: string
  note: string | null
  value: number | null
  occurred_at: string
}): ProgressEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    milestoneId: row.milestone_id,
    kind: row.kind as ProgressEntry['kind'],
    title: row.title,
    note: row.note,
    value: row.value,
    occurredAt: row.occurred_at,
  }
}

/** Always sorted by sort_order ascending — trail.ts's own precondition. */
export function useMilestones(goalId: string | undefined) {
  return useQuery({
    queryKey: ['milestones', goalId],
    enabled: !!goalId,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestones')
        .select('id, goal_id, title, target_value, sort_order, completed_at')
        .eq('goal_id', goalId as string)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data.map(toMilestone)
    },
  })
}

export function useProgressEntries(goalId: string | undefined) {
  return useQuery({
    queryKey: ['progress-entries', goalId],
    enabled: !!goalId,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('progress_entries')
        .select('id, goal_id, milestone_id, kind, title, note, value, occurred_at')
        .eq('goal_id', goalId as string)
        // occurred_at is a SQL `date`, so same-day entries would otherwise have
        // no defined order — created_at is the deterministic tiebreak.
        .order('occurred_at', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data.map(toProgressEntry)
    },
  })
}

/** The *local* calendar date as YYYY-MM-DD. `toISOString().slice(0, 10)` would
 * give the UTC date, which is a day off for anyone whose local time has crossed
 * midnight when UTC hasn't yet (or vice versa). */
function localIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function invalidateGoalData(queryClient: ReturnType<typeof useQueryClient>, goalId: string) {
  queryClient.invalidateQueries({ queryKey: ['milestones', goalId] })
  queryClient.invalidateQueries({ queryKey: ['progress-entries', goalId] })
  queryClient.invalidateQueries({ queryKey: ['goals'] })
}

/**
 * Marks a real milestone row done: sets completed_at, inserts its
 * progress_entries row, and (for a numeric goal) bumps the goal's
 * current_value to the milestone's own target_value — matching spec §6.3
 * exactly ("Marking done ... bumps current_value"). Never flips the goal's
 * own status — reaching the final target is useCompleteGoal's job, even
 * when this happens to be the last real milestone (there is always at
 * least one more step: the final target itself).
 */
/**
 * What it takes to reverse a mark-done or a progress update: the milestones it marked done, the journey entries it
 * added, the value it replaced, and whether it completed the goal.
 */
export interface MarkUndo {
  readonly milestoneIds: readonly string[]
  readonly entryIds: readonly string[]
  readonly previousValue: number
  readonly reopenGoal: boolean
}

export function useMarkMilestoneDone(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ milestone, previousValue }: { milestone: Milestone; previousValue: number }): Promise<MarkUndo> => {
      const { error: milestoneError } = await supabase
        .from('milestones')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', milestone.id)
      if (milestoneError) throw milestoneError

      const { data: entry, error: entryError } = await supabase
        .from('progress_entries')
        .insert({
          goal_id: goalId,
          milestone_id: milestone.id,
          kind: 'milestone',
          title: milestone.title,
          value: milestone.targetValue,
          occurred_at: localIsoDate(),
        })
        .select('id')
        .single()
      if (entryError) throw entryError

      if (milestone.targetValue !== null) {
        const { error: goalError } = await supabase
          .from('goals')
          .update({ current_value: milestone.targetValue })
          .eq('id', goalId)
        if (goalError) throw goalError
      }
      return { milestoneIds: [milestone.id], entryIds: [entry.id], previousValue, reopenGoal: false }
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

/**
 * Marks the goal's own final target done: bumps current_value to
 * target_value (numeric only — a checklist goal has no numeric target to
 * bump), flips status to 'completed', stamps completed_at, and inserts a
 * progress_entries row with milestone_id null (it isn't tied to a real
 * milestone row). This is the one and only path that makes trail.ts's
 * progressT return 1 (its top-line check is `status === 'completed'`) —
 * spec §6.3's "when the final target is marked, the island celebrates".
 */
export function useCompleteGoal(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (goal: Goal): Promise<MarkUndo> => {
      const nowIso = new Date().toISOString()
      const { error: goalError } = await supabase
        .from('goals')
        .update({
          status: 'completed',
          completed_at: nowIso,
          ...(goal.targetValue !== null ? { current_value: goal.targetValue } : {}),
        })
        .eq('id', goalId)
      if (goalError) throw goalError

      const { data: entry, error: entryError } = await supabase
        .from('progress_entries')
        .insert({
          goal_id: goalId,
          milestone_id: null,
          kind: 'milestone',
          title: `${goal.title} complete`,
          value: goal.targetValue,
          occurred_at: localIsoDate(),
        })
        .select('id')
        .single()
      if (entryError) throw entryError
      return { milestoneIds: [], entryIds: [entry.id], previousValue: goal.currentValue, reopenGoal: true }
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

/**
 * Reverses a mark-done or an update from its MarkUndo: the milestones (or the goal) go back to not done, the journey
 * entries are removed and the goal's current_value returns to what it was.
 */
export function useUndoMark(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (undo: MarkUndo) => {
      if (undo.milestoneIds.length > 0) {
        const { error } = await supabase.from('milestones').update({ completed_at: null }).in('id', [...undo.milestoneIds])
        if (error) throw error
      }
      const { error: goalError } = await supabase
        .from('goals')
        .update(undo.reopenGoal ? { status: 'active', completed_at: null, current_value: undo.previousValue } : { current_value: undo.previousValue })
        .eq('id', goalId)
      if (goalError) throw goalError
      const { error: entryError } = await supabase.from('progress_entries').delete().in('id', [...undo.entryIds])
      if (entryError) throw entryError
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

export interface AddUpdateInput {
  title: string
  value: number | null
  note: string | null
  occurredAt: string
}

/**
 * Logs a progress update. On a numeric goal its value is where the user is now: a value further than the goal's
 * current value moves progress up to it and marks done every milestone it reaches, each with its own journey entry
 * (see updateEffect in src/lib/goalProgress.ts). It never completes the goal: that stays an explicit step.
 * Resolves to what it takes to undo it, and to the milestones it passed.
 */
export function useAddProgressEntry(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, goal, milestones }: { input: AddUpdateInput; goal: Goal; milestones: Milestone[] }): Promise<{ undo: MarkUndo; passed: Milestone[] }> => {
      const { data: entry, error } = await supabase
        .from('progress_entries')
        .insert({
          goal_id: goalId,
          milestone_id: null,
          kind: 'update',
          title: input.title,
          value: input.value,
          note: input.note,
          occurred_at: input.occurredAt,
        })
        .select('id')
        .single()
      if (error) throw error

      const effect = updateEffect(goal, milestones, input.value)
      const passed = effect.passedMilestones.map((i) => milestones[i])
      const entryIds = [entry.id]
      const nowIso = new Date().toISOString()
      for (const milestone of passed) {
        const { error: milestoneError } = await supabase.from('milestones').update({ completed_at: nowIso }).eq('id', milestone.id)
        if (milestoneError) throw milestoneError
        const { data: milestoneEntry, error: milestoneEntryError } = await supabase
          .from('progress_entries')
          .insert({
            goal_id: goalId,
            milestone_id: milestone.id,
            kind: 'milestone',
            title: milestone.title,
            value: milestone.targetValue,
            occurred_at: input.occurredAt,
          })
          .select('id')
          .single()
        if (milestoneEntryError) throw milestoneEntryError
        entryIds.push(milestoneEntry.id)
      }
      if (effect.currentValue !== null) {
        const { error: goalError } = await supabase.from('goals').update({ current_value: effect.currentValue }).eq('id', goalId)
        if (goalError) throw goalError
      }
      return { undo: { milestoneIds: passed.map((m) => m.id), entryIds, previousValue: goal.currentValue, reopenGoal: false }, passed }
    },
    onSuccess: () => invalidateGoalData(queryClient, goalId),
  })
}

export type NextStep =
  | { kind: 'milestone'; milestone: Milestone }
  | { kind: 'final-target' }
  | { kind: 'done' }

/**
 * Milestones must already be sorted by sortOrder ascending (same
 * precondition as trail.ts). The first uncompleted real milestone is next;
 * once every real milestone is completed, the final target itself is next
 * (see useCompleteGoal's doc comment for why that's a distinct action);
 * once the goal's own status is 'completed', there is nothing left to mark.
 */
export function nextStepToMark(goal: Goal, milestones: Milestone[]): NextStep {
  if (goal.status === 'completed') return { kind: 'done' }
  const nextMilestone = milestones.find((m) => m.completedAt === null)
  if (nextMilestone) return { kind: 'milestone', milestone: nextMilestone }
  return { kind: 'final-target' }
}
