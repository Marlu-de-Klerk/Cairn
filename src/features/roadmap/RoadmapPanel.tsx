import { useEffect, useRef, useState } from 'react'
import {
  nextStepToMark,
  useAddProgressEntry,
  useCompleteGoal,
  useMarkMilestoneDone,
  useMilestones,
  useProgressEntries,
  useUndoMark,
} from './api'
import type { MarkUndo } from './api'
import { showToast } from '../toast/toast'
import { EditGoalSheet } from './EditGoalSheet'
import type { Goal } from '../archipelago/api'
import { formatEntryDate, formatValue, goalProgress, updateEffect } from '../../lib/goalProgress'
import { setSheetInset } from './sheetInset'

const COMPACT_QUERY = '(max-width: 639px)'

/** Phone widths: the panel becomes a bottom sheet that starts collapsed. */
function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(COMPACT_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia?.(COMPACT_QUERY)
    if (!query) return
    const onChange = () => setCompact(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return compact
}

interface RoadmapPanelProps {
  goal: Goal
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

export function RoadmapPanel({ goal }: RoadmapPanelProps) {
  const { data: milestones, isError: milestonesError } = useMilestones(goal.id)
  const { data: entries, isError: entriesError } = useProgressEntries(goal.id)
  const markMilestoneDone = useMarkMilestoneDone(goal.id)
  const completeGoal = useCompleteGoal(goal.id)
  const addProgressEntry = useAddProgressEntry(goal.id)
  const undoMark = useUndoMark(goal.id)

  const [journeyOpen, setJourneyOpen] = useState(false)
  const [updateFormOpen, setUpdateFormOpen] = useState(false)
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateValue, setUpdateValue] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [updateDate, setUpdateDate] = useState(localIsoDate())
  const [celebrating, setCelebrating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  // On a phone the sheet reports its collapsed height, so the camera frames the island above it. Expanding it
  // for details doesn't reframe: the island stays put under the taller sheet until it collapses again.
  const compact = useCompactLayout()
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!compact || !sheet) return
    const report = () => {
      if (!expandedRef.current) setSheetInset(sheet.getBoundingClientRect().height)
    }
    const observer = new ResizeObserver(report)
    observer.observe(sheet)
    report()
    return () => {
      observer.disconnect()
      setSheetInset(0)
    }
  }, [compact, sheet])
  const showDetails = !compact || expanded

  if (milestonesError || entriesError) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 border-t border-stone-light bg-stone/95 p-4 text-sm text-mist backdrop-blur-sm sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-72 sm:rounded-md sm:border sm:p-3">
        <p className="font-display text-base">{goal.title}</p>
        <p className="mt-1 font-body text-xs text-mist/60">Couldn't load this goal's roadmap. Try refreshing.</p>
      </div>
    )
  }

  if (!milestones || !entries) return null

  const step = nextStepToMark(goal, milestones)
  const progress = goalProgress(goal, milestones)
  const percent = Math.round(progress.fraction * 100)
  // newest first, so a just-added update is at the top rather than below the fold
  const journey = [...entries].reverse()

  const handleMarkDone = async () => {
    setErrorMessage(null)
    try {
      // Every mark can be taken back for a few seconds, in case of a mis-tap.
      const offerUndo = (message: string, undo: MarkUndo) =>
        showToast(message, { label: 'Undo', run: () => undoMark.mutateAsync(undo) })
      if (step.kind === 'milestone') {
        offerUndo(`Marked ${step.milestone.title} done.`, await markMilestoneDone.mutateAsync({ milestone: step.milestone, previousValue: goal.currentValue }))
      } else if (step.kind === 'final-target') {
        offerUndo(`${goal.title} complete.`, await completeGoal.mutateAsync(goal))
        // The banner is static, so it shows regardless of prefers-reduced-motion —
        // reduced motion skips the animation, not the acknowledgment. Gate any
        // future animated flourish on celebrationEnabled() from './celebrate'.
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 1600)
      }
    } catch {
      setErrorMessage("Couldn't save. Try again.")
    }
  }

  const handleAddUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!updateTitle.trim()) return
    setErrorMessage(null)
    const value = updateValue.trim() === '' ? null : Number(updateValue)
    const effect = updateEffect(goal, milestones, value)
    try {
      const { undo, passed } = await addProgressEntry.mutateAsync({
        input: {
          title: updateTitle.trim(),
          value,
          note: updateNote.trim() === '' ? null : updateNote.trim(),
          occurredAt: updateDate || localIsoDate(),
        },
        goal,
        milestones,
      })
      const message =
        passed.length > 0
          ? `Update saved. Reached ${passed.map((m) => m.title).join(' and ')}.`
          : effect.currentValue !== null
            ? `Update saved. Progress is now ${formatValue(effect.currentValue, goal.unit)}.`
            : 'Update saved.'
      showToast(message, { label: 'Undo', run: () => undoMark.mutateAsync(undo) })
    } catch {
      setErrorMessage("Couldn't save. Try again.")
      return
    }
    setUpdateTitle('')
    setUpdateValue('')
    setUpdateNote('')
    setUpdateDate(localIsoDate())
    setUpdateFormOpen(false)
  }

  const markDoneLabel =
    step.kind === 'milestone'
      ? `Mark ${step.milestone.title} done`
      : step.kind === 'final-target'
        ? `Mark ${goal.title} complete`
        : 'Complete'

  return (
    <div
      ref={setSheet}
      className={
        compact
          ? 'pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[75vh] flex-col overflow-y-auto font-body'
          : 'pointer-events-auto absolute bottom-4 right-4 flex w-72 flex-col gap-2 font-body'
      }
    >
      {celebrating ? (
        <div className={`rounded-md border border-lantern bg-lantern/20 p-3 text-center text-sm font-medium text-lantern ${compact ? 'mx-4 mb-2' : ''}`}>
          🎉 {goal.title} complete!
        </div>
      ) : null}

      <div
        className={
          compact
            ? `rounded-t-2xl border-t border-stone-light bg-stone/95 px-4 pt-1 text-sm text-mist shadow-[0_-8px_24px_rgba(0,0,0,0.25)] backdrop-blur-sm ${expanded ? 'pb-3' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'}`
            : 'rounded-md border border-stone-light bg-stone/90 p-3 text-sm text-mist backdrop-blur-sm'
        }
      >
        {compact ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show less' : 'Show updates and journey'}
            className="flex h-6 w-full items-center justify-center"
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-mist/30" />
          </button>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-base">{goal.title}</p>
          {compact ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-hidden="true" tabIndex={-1} className="shrink-0 text-xs text-mist/60">
              {expanded ? 'Less' : 'More'}
            </button>
          ) : null}
        </div>
        {showDetails && goal.description ? <p className="mt-0.5 text-xs text-mist/60">{goal.description}</p> : null}

        <div
          role="progressbar"
          aria-label={`${goal.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={progress.summary}
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink"
        >
          <div className="h-full rounded-full bg-lantern transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-mist/90">{progress.summary}</span>
          <span className="text-mist/60">{percent}%</span>
        </div>
        {progress.next ? <p className="mt-0.5 text-xs text-mist/60">{progress.next}</p> : null}

        {step.kind !== 'done' ? (
          <button
            type="button"
            onClick={handleMarkDone}
            aria-label={markDoneLabel}
            disabled={markMilestoneDone.isPending || completeGoal.isPending}
            className="mt-2 w-full rounded-md bg-lantern px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
          >
            {step.kind === 'milestone' ? 'Mark done' : 'Complete goal'}
          </button>
        ) : (
          <p className="mt-2 text-xs font-medium text-lantern">Complete</p>
        )}

        {showDetails ? (
          <>
          {updateFormOpen ? (
            <form onSubmit={handleAddUpdate} className="mt-2 flex flex-col gap-1.5">
              <input
                value={updateTitle}
                onChange={(event) => setUpdateTitle(event.target.value)}
                placeholder="What happened?"
                className="rounded border border-stone-light bg-ink px-2 py-1 text-xs text-mist"
              />
              {goal.kind === 'numeric' ? (
                <input
                  value={updateValue}
                  onChange={(event) => setUpdateValue(event.target.value)}
                  placeholder={`Where you're at now${goal.unit ? ` (${goal.unit})` : ''}, optional`}
                  aria-describedby="update-value-hint"
                  type="number"
                  step="any"
                  className="rounded border border-stone-light bg-ink px-2 py-1 text-xs text-mist"
                />
              ) : null}
              {goal.kind === 'numeric' ? (
                <p id="update-value-hint" className="-mt-0.5 text-[11px] leading-snug text-mist/50">
                  Further than {formatValue(goal.currentValue, goal.unit)}? Your progress moves up to it.
                </p>
              ) : null}
              <textarea
                value={updateNote}
                onChange={(event) => setUpdateNote(event.target.value)}
                placeholder="Note (optional)"
                className="rounded border border-stone-light bg-ink px-2 py-1 text-xs text-mist"
                rows={2}
              />
              <label className="flex items-center gap-1.5 text-xs text-mist/60">
                Date
                <input
                  value={updateDate}
                  onChange={(event) => setUpdateDate(event.target.value)}
                  type="date"
                  className="flex-1 rounded border border-stone-light bg-ink px-2 py-1 text-xs text-mist"
                />
              </label>
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={addProgressEntry.isPending || !updateTitle.trim()}
                  className="flex-1 rounded-md bg-mist px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
                >
                  Save update
                </button>
                <button
                  type="button"
                  onClick={() => setUpdateFormOpen(false)}
                  className="rounded-md border border-stone-light px-3 py-1.5 text-xs text-mist"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setUpdateFormOpen(true)}
              className="mt-1.5 w-full rounded-md border border-stone-light px-3 py-1.5 text-xs text-mist"
            >
              Add update
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1.5 w-full rounded-md px-3 py-1.5 text-xs text-mist/70 hover:text-mist"
          >
            Edit goal
          </button>
          </>
        ) : null}

        {errorMessage ? <p className="mt-1.5 text-xs text-accent-error">{errorMessage}</p> : null}
      </div>

      {showDetails ? (
        <div
          className={
            compact
              ? 'border-t border-stone-light bg-stone/95 px-1 pb-[env(safe-area-inset-bottom)] text-sm text-mist backdrop-blur-sm'
              : 'rounded-md border border-stone-light bg-stone/90 text-sm text-mist backdrop-blur-sm'
          }
        >
          <button
            type="button"
            onClick={() => setJourneyOpen((value) => !value)}
            className="w-full px-3 py-2 text-left text-xs font-medium"
          >
            {journeyOpen ? 'Hide journey' : 'Show journey'} ({entries.length})
          </button>
          {journeyOpen ? (
            <ul className="max-h-48 overflow-y-auto border-t border-stone-light px-3 py-2 text-xs">
              {journey.length === 0 ? <li className="py-1.5 text-mist/60">Nothing logged yet. Mark a milestone or add an update.</li> : null}
              {journey.map((entry) => (
                <li key={entry.id} className="border-b border-stone-light/60 py-1.5 last:border-0">
                  <p className="font-display text-sm">{entry.title}</p>
                  <p className="text-mist/60">
                    {entry.kind === 'milestone' ? <span className="text-lantern/90">Milestone · </span> : null}
                    {formatEntryDate(entry.occurredAt)}
                    {/* a milestone's title already names its value */}
                    {entry.kind === 'update' && entry.value !== null ? ` · ${formatValue(entry.value, goal.unit)}` : ''}
                  </p>
                  {entry.note ? <p className="mt-0.5 text-mist/40">{entry.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <EditGoalSheet goal={goal} milestones={milestones} open={editing} onOpenChange={setEditing} />
    </div>
  )
}
