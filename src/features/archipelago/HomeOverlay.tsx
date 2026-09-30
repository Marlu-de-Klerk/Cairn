import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useMatch, useNavigate } from 'react-router'
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
  const { data: goals, isLoading, isError, isFetching } = useGoals()
  const focusedGoalId = useMatch('/g/:id')?.params.id
  const focusedGoal = goals?.find((g) => g.id === focusedGoalId) ?? null
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const avatarMenuRef = useRef<HTMLDivElement>(null)
  const avatarButtonRef = useRef<HTMLButtonElement>(null)

  // A /g/:id link to a goal that isn't (or is no longer) one of the user's goals: say so and go home, rather than
  // leaving a dead URL over the plain overview. Waits out a refetch, so a just-created goal isn't mistaken for one.
  const goalMissing = !!focusedGoalId && !!goals && !isFetching && !focusedGoal
  useEffect(() => {
    if (goalMissing) navigate('/', { replace: true, state: { missingGoal: true } })
  }, [goalMissing, navigate])
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(null)
  const showMissingNotice = (location.state as { missingGoal?: boolean } | null)?.missingGoal === true && dismissedNoticeKey !== location.key
  useEffect(() => {
    if (!showMissingNotice) return
    const timer = setTimeout(() => setDismissedNoticeKey(location.key), 5000)
    return () => clearTimeout(timer)
  }, [showMissingNotice, location.key])

  // Escape leaves a focused island for the overview, unless it's closing the menu or the new-goal sheet, or the user
  // is typing in a field (where Escape belongs to the field).
  useEffect(() => {
    if (!focusedGoalId || avatarMenuOpen || newGoalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      navigate('/')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusedGoalId, avatarMenuOpen, newGoalOpen, navigate])

  // The account menu closes on Escape (handing focus back to its button) or on a press anywhere outside it.
  useEffect(() => {
    if (!avatarMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAvatarMenuOpen(false)
      avatarButtonRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!avatarMenuRef.current?.contains(event.target as Node)) setAvatarMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [avatarMenuOpen])

  const activeCount = goals?.filter((g) => g.status === 'active').length ?? 0
  const completedCount = goals?.filter((g) => g.status === 'completed').length ?? 0
  const showError = isError && !goals
  const isEmpty = !isLoading && !showError && activeCount === 0 && completedCount === 0

  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <header className="pointer-events-auto flex items-center justify-between bg-stone/80 p-4 backdrop-blur-sm">
        <Link to="/" className="rounded font-display text-lg text-mist">
          Cairn
        </Link>

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

          <div ref={avatarMenuRef} className="relative">
            <button
              ref={avatarButtonRef}
              type="button"
              aria-label="Account"
              aria-haspopup="true"
              aria-expanded={avatarMenuOpen}
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
        {focusedGoalId ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="pointer-events-auto absolute left-4 top-4 flex items-center gap-1.5 rounded-md border border-stone-light bg-stone/90 px-3 py-2 text-sm text-mist shadow-lg backdrop-blur-sm hover:bg-stone-light"
          >
            <span aria-hidden="true">←</span> All islands
          </button>
        ) : null}
        {showMissingNotice ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p role="status" className="pointer-events-auto rounded-md border border-stone-light bg-stone/90 px-4 py-2 text-sm text-mist backdrop-blur-sm">
              That island couldn't be found.
            </p>
          </div>
        ) : null}
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
