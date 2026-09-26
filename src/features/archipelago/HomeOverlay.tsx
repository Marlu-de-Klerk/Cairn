import { useState } from 'react'
import { useMatch, useNavigate } from 'react-router'
import { useGoals } from './api'
import { useSession } from '../auth/useSession'
import { supabase } from '../../lib/supabase'
import { EmptyArchipelago } from './EmptyArchipelago'
import { NewGoalSheet } from './NewGoalSheet'
import { RoadmapPanel } from '../roadmap/RoadmapPanel'

interface HomeOverlayProps {
  showCompleted: boolean
  onToggleShowCompleted: () => void
}

export function HomeOverlay({ showCompleted, onToggleShowCompleted }: HomeOverlayProps) {
  const { session } = useSession()
  const { data: goals, isLoading, isError } = useGoals()
  const focusedGoalId = useMatch('/g/:id')?.params.id
  const focusedGoal = goals?.find((g) => g.id === focusedGoalId) ?? null
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const navigate = useNavigate()

  const activeCount = goals?.filter((g) => g.status === 'active').length ?? 0
  const completedCount = goals?.filter((g) => g.status === 'completed').length ?? 0
  const showError = isError && !goals
  const isEmpty = !isLoading && !showError && activeCount === 0 && completedCount === 0

  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <header className="pointer-events-auto flex items-center justify-between bg-stone/80 p-4 backdrop-blur-sm">
        <span className="font-display text-lg text-mist">Cairn</span>

        <div className="flex items-center gap-2 font-body">
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={onToggleShowCompleted}
              className="rounded-md border border-stone-light px-3 py-1.5 text-xs text-mist"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setNewGoalOpen(true)}
            className="rounded-md bg-lantern px-3 py-1.5 text-xs font-medium text-ink"
          >
            New goal
          </button>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-stone-light px-3 py-1.5 text-xs text-mist opacity-50"
          >
            Explore
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAvatarMenuOpen((value) => !value)}
              className="rounded-full border border-stone-light px-3 py-1.5 text-xs text-mist"
            >
              {session?.user.email?.[0]?.toUpperCase() ?? '?'}
            </button>
            {avatarMenuOpen ? (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-stone-light bg-stone p-2 text-xs text-mist shadow-lg">
                <p className="truncate px-2 py-1 text-mist/60">{session?.user.email}</p>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="w-full rounded px-2 py-1 text-left hover:bg-stone-light"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="pointer-events-none relative flex-1 font-body">
        {showError ? (
          <div className="pointer-events-none flex h-full items-center justify-center">
            <div className="pointer-events-auto max-w-xs rounded-md border border-stone-light bg-stone/80 p-4 text-center text-sm text-mist backdrop-blur-sm">
              <p>Couldn't load your archipelago. Try refreshing.</p>
            </div>
          </div>
        ) : isEmpty ? (
          <EmptyArchipelago />
        ) : null}
        {focusedGoal ? <RoadmapPanel key={focusedGoal.id} goal={focusedGoal} /> : null}
      </div>

      <NewGoalSheet
        open={newGoalOpen}
        onOpenChange={setNewGoalOpen}
        onCreated={(goal) => navigate(`/g/${goal.id}`)}
      />
    </div>
  )
}
