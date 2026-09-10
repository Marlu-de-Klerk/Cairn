import { useState } from 'react'
import {
  nextStepToMark,
  useAddProgressEntry,
  useCompleteGoal,
  useMarkMilestoneDone,
  useMilestones,
  useProgressEntries,
} from './api'
import type { Goal } from '../archipelago/api'

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

  const [journeyOpen, setJourneyOpen] = useState(false)
  const [updateFormOpen, setUpdateFormOpen] = useState(false)
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateValue, setUpdateValue] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [updateDate, setUpdateDate] = useState(localIsoDate())
  const [celebrating, setCelebrating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (milestonesError || entriesError) {
    return (
      <div className="pointer-events-auto absolute bottom-4 right-4 w-72 rounded-md border border-slate-700 bg-slate-950/90 p-3 text-sm text-slate-100">
        <p className="font-medium">{goal.title}</p>
        <p className="mt-1 text-xs text-slate-400">Couldn't load this goal's roadmap. Try refreshing.</p>
      </div>
    )
  }

  if (!milestones || !entries) return null

  const step = nextStepToMark(goal, milestones)

  const handleMarkDone = async () => {
    setErrorMessage(null)
    try {
      if (step.kind === 'milestone') {
        await markMilestoneDone.mutateAsync(step.milestone)
      } else if (step.kind === 'final-target') {
        await completeGoal.mutateAsync(goal)
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
    try {
      await addProgressEntry.mutateAsync({
        title: updateTitle.trim(),
        value: updateValue.trim() === '' ? null : Number(updateValue),
        note: updateNote.trim() === '' ? null : updateNote.trim(),
        occurredAt: updateDate || localIsoDate(),
      })
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
    <div className="pointer-events-auto absolute bottom-4 right-4 flex w-72 flex-col gap-2">
      {celebrating ? (
        <div className="rounded-md border border-amber-400 bg-amber-950/90 p-3 text-center text-sm text-amber-100">
          🎉 {goal.title} complete!
        </div>
      ) : null}

      <div className="rounded-md border border-slate-700 bg-slate-950/90 p-3 text-sm text-slate-100">
        <p className="font-medium">{goal.title}</p>

        {step.kind !== 'done' ? (
          <button
            type="button"
            onClick={handleMarkDone}
            disabled={markMilestoneDone.isPending || completeGoal.isPending}
            className="mt-2 w-full rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-50"
          >
            {markDoneLabel}
          </button>
        ) : (
          <p className="mt-2 text-xs text-amber-300">Complete</p>
        )}

        {updateFormOpen ? (
          <form onSubmit={handleAddUpdate} className="mt-2 flex flex-col gap-1.5">
            <input
              value={updateTitle}
              onChange={(event) => setUpdateTitle(event.target.value)}
              placeholder="What happened?"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
            {goal.kind === 'numeric' ? (
              <input
                value={updateValue}
                onChange={(event) => setUpdateValue(event.target.value)}
                placeholder={`Value (${goal.unit ?? 'optional'})`}
                type="number"
                step="any"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            ) : null}
            <textarea
              value={updateNote}
              onChange={(event) => setUpdateNote(event.target.value)}
              placeholder="Note (optional)"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              rows={2}
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Date
              <input
                value={updateDate}
                onChange={(event) => setUpdateDate(event.target.value)}
                type="date"
                className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </label>
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={addProgressEntry.isPending || !updateTitle.trim()}
                className="flex-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-50"
              >
                Save update
              </button>
              <button
                type="button"
                onClick={() => setUpdateFormOpen(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setUpdateFormOpen(true)}
            className="mt-1.5 w-full rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
          >
            Add update
          </button>
        )}

        {errorMessage ? <p className="mt-1.5 text-xs text-red-400">{errorMessage}</p> : null}
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-950/90 text-sm text-slate-100">
        <button
          type="button"
          onClick={() => setJourneyOpen((value) => !value)}
          className="w-full px-3 py-2 text-left text-xs font-medium"
        >
          {journeyOpen ? 'Hide journey' : 'Show journey'} ({entries.length})
        </button>
        {journeyOpen ? (
          <ul className="max-h-48 overflow-y-auto border-t border-slate-800 px-3 py-2 text-xs">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-slate-800/60 py-1.5 last:border-0">
                <p className="text-slate-100">{entry.title}</p>
                <p className="text-slate-400">
                  {entry.occurredAt}
                  {entry.value !== null ? ` — ${entry.value}${goal.unit ? ` ${goal.unit}` : ''}` : ''}
                </p>
                {entry.note ? <p className="mt-0.5 text-slate-500">{entry.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
