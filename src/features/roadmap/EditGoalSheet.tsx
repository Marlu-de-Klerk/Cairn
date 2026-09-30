import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { MilestoneBuilder } from '../archipelago/MilestoneBuilder'
import type { MilestoneRow } from '../archipelago/MilestoneBuilder'
import { useArchiveGoal, useRestoreGoal, useUpdateGoal } from '../archipelago/api'
import type { Goal } from '../archipelago/api'
import type { Milestone } from './api'
import { parseNumberField, validateGoalDetails, validateMilestones } from '../../lib/newGoalValidation'
import { showToast } from '../toast/toast'

interface EditGoalSheetProps {
  goal: Goal
  milestones: Milestone[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const INPUT_CLASS = 'mt-1 w-full rounded-md border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist'

/** Edit a goal's title, description, target and not-yet-done milestones, or delete it (undoable). */
export function EditGoalSheet({ goal, milestones, open, onOpenChange }: EditGoalSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-stone-light bg-stone p-6 text-mist sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-6 sm:w-[420px] sm:rounded-2xl sm:border">
          {/* mounted only while open, so every opening starts from the goal as it is now */}
          {open ? <EditGoalForm goal={goal} milestones={milestones} onDone={() => onOpenChange(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EditGoalForm({ goal, milestones, onDone }: { goal: Goal; milestones: Milestone[]; onDone: () => void }) {
  const navigate = useNavigate()
  const updateGoal = useUpdateGoal()
  const archiveGoal = useArchiveGoal()
  const restoreGoal = useRestoreGoal()

  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
  const [targetValue, setTargetValue] = useState(goal.targetValue === null ? '' : String(goal.targetValue))
  const [unit, setUnit] = useState(goal.unit ?? '')
  const [rows, setRows] = useState<MilestoneRow[]>(() =>
    milestones.map((m) => ({ id: m.id, title: m.title, targetValue: m.targetValue === null ? '' : String(m.targetValue), locked: m.completedAt !== null })),
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detailErrors = validateGoalDetails(goal.kind, title, targetValue, String(goal.startValue))
  const target = goal.kind === 'numeric' ? parseNumberField(targetValue) : null
  const parsedRows = rows.map((r) => ({ title: r.title, targetValue: goal.kind === 'numeric' ? parseNumberField(r.targetValue) : null }))
  const milestoneValidation = validateMilestones(goal.kind, goal.startValue, target, parsedRows)
  const untitled = rows.some((r) => !r.title.trim())
  const valid = Object.keys(detailErrors).length === 0 && milestoneValidation.valid && !untitled

  async function save() {
    if (!valid) return
    setError(null)
    const keptIds = new Set(rows.map((r) => r.id).filter(Boolean))
    try {
      await updateGoal.mutateAsync({
        goalId: goal.id,
        title: title.trim(),
        description: description.trim() || null,
        unit: goal.kind === 'numeric' ? unit.trim() || null : null,
        targetValue: target,
        milestones: rows.map((r, i) => ({ id: r.id ?? null, title: r.title.trim(), targetValue: parsedRows[i].targetValue })),
        removedMilestoneIds: milestones.filter((m) => !keptIds.has(m.id)).map((m) => m.id),
      })
      onDone()
    } catch {
      setError("Couldn't save. Try again.")
    }
  }

  async function remove() {
    setError(null)
    try {
      const previousStatus = await archiveGoal.mutateAsync(goal)
      onDone()
      navigate('/')
      showToast(`Deleted “${goal.title}”.`, {
        label: 'Undo',
        run: async () => {
          await restoreGoal.mutateAsync({ goalId: goal.id, status: previousStatus })
          navigate(`/g/${goal.id}`)
        },
      })
    } catch {
      setError("Couldn't delete. Try again.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <Dialog.Title className="font-display text-xl">Edit goal</Dialog.Title>
        <Dialog.Close className="rounded px-1 font-body text-xl leading-none text-mist/60 hover:text-mist" aria-label="Close">
          ×
        </Dialog.Close>
      </div>
      <Dialog.Description className="sr-only">Change this goal's details and milestones, or delete it.</Dialog.Description>

      <label className="block">
        <span className="font-body text-sm text-mist/70">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
        {detailErrors.title ? <span className="mt-1 block font-body text-xs text-accent-error">{detailErrors.title}</span> : null}
      </label>
      <label className="block">
        <span className="font-body text-sm text-mist/70">Description (optional)</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={INPUT_CLASS} />
      </label>
      {goal.kind === 'numeric' ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-body text-sm text-mist/70">Target</span>
            <input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} inputMode="decimal" className={INPUT_CLASS} />
            {detailErrors.target ? <span className="mt-1 block font-body text-xs text-accent-error">{detailErrors.target}</span> : null}
          </label>
          <label className="block">
            <span className="font-body text-sm text-mist/70">Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={INPUT_CLASS} />
          </label>
        </div>
      ) : null}

      <section>
        <h3 className="font-body text-sm text-mist/70">Milestones</h3>
        <p className="mb-2 font-body text-xs text-mist/50">Milestones you've done can be renamed; new ones go at the end.</p>
        <MilestoneBuilder
          kind={goal.kind}
          milestones={rows}
          errors={milestoneValidation.valid ? {} : milestoneValidation.errors}
          onChange={setRows}
          showPreview={false}
        />
        {untitled ? <p className="mt-1 font-body text-xs text-accent-error">Give every milestone a name.</p> : null}
      </section>

      {error ? <p className="font-body text-sm text-accent-error">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Dialog.Close className="rounded-md border border-stone-light px-4 py-2 font-body text-sm text-mist">Cancel</Dialog.Close>
        <button
          type="button"
          onClick={save}
          disabled={!valid || updateGoal.isPending}
          className="rounded-md bg-lantern px-4 py-2 font-body text-sm font-medium text-ink disabled:opacity-40"
        >
          {updateGoal.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="border-t border-stone-light pt-4">
        {confirmingDelete ? (
          <div className="space-y-2 rounded-md border border-accent-error/60 p-3">
            <p className="font-body text-sm">Delete “{goal.title}”? Its island leaves your archipelago. You can undo this for a few seconds.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md border border-stone-light px-3 py-1.5 font-body text-sm text-mist">
                Keep it
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={archiveGoal.isPending}
                className="rounded-md bg-accent-error px-3 py-1.5 font-body text-sm font-medium text-mist disabled:opacity-50"
              >
                Delete goal
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="font-body text-sm text-accent-error">
            Delete goal…
          </button>
        )}
      </div>
    </div>
  )
}
