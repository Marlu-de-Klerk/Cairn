import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { islandPosition, nextIslandIndex } from '../../lib/archipelago'
import type { Database } from '../../lib/database.types'
import type { MilestoneInput } from '../../lib/newGoalValidation'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/useSession'

export interface Goal {
  id: string
  title: string
  description: string | null
  biome: 'jungle' | 'desert' | 'tundra' | 'volcano' | 'reef' | 'highlands'
  kind: 'numeric' | 'checklist'
  unit: string | null
  startValue: number
  targetValue: number | null
  currentValue: number
  status: 'active' | 'completed' | 'archived'
  islandX: number
  islandZ: number
  islandRotation: number
  isPublic: boolean
}

function toGoal(row: {
  id: string
  title: string
  description: string | null
  biome: string
  kind: string
  unit: string | null
  start_value: number
  target_value: number | null
  current_value: number
  status: string
  island_x: number
  island_z: number
  island_rotation: number
  is_public: boolean
}): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    biome: row.biome as Goal['biome'],
    kind: row.kind as Goal['kind'],
    unit: row.unit,
    startValue: row.start_value,
    targetValue: row.target_value,
    currentValue: row.current_value,
    status: row.status as Goal['status'],
    islandX: row.island_x,
    islandZ: row.island_z,
    islandRotation: row.island_rotation,
    isPublic: row.is_public,
  }
}

/**
 * The signed-in user's own goals for their home archipelago — active and
 * completed only (never archived, and never another user's goals even
 * when public: this is "my archipelago", not a public feed).
 */
export function useGoals() {
  const { session } = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['goals', userId],
    enabled: !!userId,
    // one quick retry, then say so: react-query's default three (with backoff) left ~7 s of silent empty sea
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select(
          'id, title, description, biome, kind, unit, start_value, target_value, current_value, status, island_x, island_z, island_rotation, is_public',
        )
        .eq('user_id', userId as string)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return data.map(toGoal)
    },
  })
}

export interface Profile {
  id: string
  archipelagoSeed: number
}

/**
 * The signed-in user's own profile row, used at goal-creation time to
 * derive the next island's spiral position (spec §6.1) — see
 * src/lib/archipelago.ts.
 */
export function useProfile() {
  const { session } = useSession()

  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, archipelago_seed')
        .eq('id', session!.user.id)
        .single()
      if (error) throw error
      return { id: data.id, archipelagoSeed: data.archipelago_seed }
    },
  })
}

export interface CreateGoalInput {
  title: string
  description: string | null
  biome: Goal['biome']
  kind: Goal['kind']
  unit: string | null
  startValue: number
  targetValue: number | null
  isPublic: boolean
  milestones: MilestoneInput[]
}

/**
 * Creates a goal, its milestones, and its island position atomically via
 * the create_goal_with_milestones RPC (spec §6.2) — see
 * supabase/migrations/0007_create_goal_with_milestones.sql.
 */
export function useCreateGoal() {
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGoalInput): Promise<Goal> => {
      if (!session) throw new Error('Not signed in.')

      // The first spiral spot no current island occupies — see nextIslandIndex in src/lib/archipelago.ts. Read via
      // the already-cached goals query rather than a fresh query, so this never races a concurrent read differently
      // than what the user is currently looking at.
      const existingGoals = queryClient.getQueryData<Goal[]>(['goals', session.user.id]) ?? []
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('archipelago_seed')
        .eq('id', session.user.id)
        .single()
      if (profileError) throw profileError

      const index = nextIslandIndex(existingGoals.map((g) => ({ x: g.islandX, z: g.islandZ })), profile.archipelago_seed)
      const position = islandPosition(index, profile.archipelago_seed)

      // The generated RPC Args type has no way to express Postgres function
      // parameter nullability (pg_proc carries no NOT NULL for args), so it
      // types p_description/p_unit/p_target_value as non-null even though
      // the migration accepts and stores NULL for each. The rpc() argument
      // type is asserted here, not widened, so every other field (names,
      // non-nullable types) still gets full structural checking above.
      type CreateGoalRpcArgs = Database['public']['Functions']['create_goal_with_milestones']['Args']
      const rpcArgs: Omit<CreateGoalRpcArgs, 'p_description' | 'p_unit' | 'p_target_value'> & {
        p_description: string | null
        p_unit: string | null
        p_target_value: number | null
      } = {
        p_title: input.title,
        p_description: input.description,
        p_biome: input.biome,
        p_kind: input.kind,
        p_unit: input.unit,
        p_start_value: input.startValue,
        p_target_value: input.targetValue,
        p_island_x: position.x,
        p_island_z: position.z,
        p_island_rotation: position.rotation,
        p_is_public: input.isPublic,
        p_milestones: input.milestones.map((m) => ({ title: m.title, targetValue: m.targetValue })),
      }

      const { data, error } = await supabase.rpc('create_goal_with_milestones', rpcArgs as CreateGoalRpcArgs)
      if (error) throw error
      return toGoal(data)
    },
    onSuccess: (goal) => {
      // In the cache before the refetch lands, so navigating straight to the new island finds it.
      if (session) queryClient.setQueryData<Goal[]>(['goals', session.user.id], (goals) => (goals ? [...goals, goal] : goals))
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
  })
}

export interface EditMilestoneInput {
  /** null for a milestone added in the editor */
  readonly id: string | null
  readonly title: string
  readonly targetValue: number | null
}

export interface UpdateGoalInput {
  readonly goalId: string
  readonly title: string
  readonly description: string | null
  readonly unit: string | null
  readonly targetValue: number | null
  /** in trail order; existing rows keep their sort_order, new ones are appended after the highest */
  readonly milestones: readonly EditMilestoneInput[]
  readonly removedMilestoneIds: readonly string[]
}

/**
 * Saves the edit-goal sheet: the goal's own fields, then its milestones (removed, renamed or re-valued, added). Only
 * milestones not yet done can be removed or re-valued, and new ones only go after the existing ones, so the trail's
 * sort order never has to be rewritten.
 */
export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateGoalInput) => {
      const { error: goalError } = await supabase
        .from('goals')
        .update({ title: input.title, description: input.description, unit: input.unit, target_value: input.targetValue })
        .eq('id', input.goalId)
      if (goalError) throw goalError

      if (input.removedMilestoneIds.length > 0) {
        const { error } = await supabase.from('milestones').delete().in('id', [...input.removedMilestoneIds])
        if (error) throw error
      }

      const { data: existing, error: readError } = await supabase.from('milestones').select('sort_order').eq('goal_id', input.goalId)
      if (readError) throw readError
      let nextSortOrder = Math.max(-1, ...existing.map((m) => m.sort_order)) + 1

      for (const milestone of input.milestones) {
        if (milestone.id) {
          const { error } = await supabase
            .from('milestones')
            .update({ title: milestone.title, target_value: milestone.targetValue })
            .eq('id', milestone.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('milestones')
            .insert({ goal_id: input.goalId, title: milestone.title, target_value: milestone.targetValue, sort_order: nextSortOrder++ })
          if (error) throw error
        }
      }
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['milestones', input.goalId] })
    },
  })
}

/**
 * Deleting a goal archives it: status 'archived' hides it (and its island) everywhere, but keeps its journey, so the
 * delete can be undone. Resolves to the status it had, for useRestoreGoal.
 */
export function useArchiveGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (goal: Goal): Promise<Goal['status']> => {
      const { error } = await supabase.from('goals').update({ status: 'archived' }).eq('id', goal.id)
      if (error) throw error
      return goal.status
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  })
}

/** Undoes useArchiveGoal: puts the goal back as it was (active or completed). */
export function useRestoreGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ goalId, status }: { goalId: string; status: Goal['status'] }) => {
      const { error } = await supabase.from('goals').update({ status }).eq('id', goalId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  })
}
