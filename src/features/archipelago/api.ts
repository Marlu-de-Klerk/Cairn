import { useQuery } from '@tanstack/react-query'
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
