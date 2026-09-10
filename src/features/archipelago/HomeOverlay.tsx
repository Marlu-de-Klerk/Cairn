import { useState } from 'react'
import { useMatch } from 'react-router'
import { useGoals } from './api'
import { useSession } from '../auth/useSession'
import { supabase } from '../../lib/supabase'
import { EmptyArchipelago } from './EmptyArchipelago'
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

  const activeCount = goals?.filter((g) => g.status === 'active').length ?? 0
  const completedCount = goals?.filter((g) => g.status === 'completed').length ?? 0
  const showError = isError && !goals
  const isEmpty = !isLoading && !showError && activeCount === 0 && completedCount === 0

  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <header className="pointer-events-auto flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-slate-100">Cairn</span>

        <div className="flex items-center gap-2">
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={onToggleShowCompleted}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          ) : null}

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 opacity-50"
          >
            New goal
          </button>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 opacity-50"
          >
            Explore
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAvatarMenuOpen((value) => !value)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
            >
              {session?.user.email?.[0]?.toUpperCase() ?? '?'}
            </button>
            {avatarMenuOpen ? (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg">
                <p className="truncate px-2 py-1 text-slate-400">{session?.user.email}</p>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="pointer-events-none relative flex-1">
        {showError ? (
          <div className="pointer-events-none flex h-full items-center justify-center">
            <div className="pointer-events-auto max-w-xs rounded-md border border-slate-700 bg-slate-950/80 p-4 text-center text-sm text-slate-100">
              <p>Couldn't load your archipelago. Try refreshing.</p>
            </div>
          </div>
        ) : isEmpty ? (
          <EmptyArchipelago />
        ) : null}
        {focusedGoal ? <RoadmapPanel key={focusedGoal.id} goal={focusedGoal} /> : null}
      </div>
    </div>
  )
}
