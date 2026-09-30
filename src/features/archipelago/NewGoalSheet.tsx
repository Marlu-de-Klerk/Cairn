import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { BiomePicker } from './BiomePicker'
import { MilestoneBuilder } from './MilestoneBuilder'
import type { MilestoneRow } from './MilestoneBuilder'
import { useCreateGoal } from './api'
import type { Goal } from './api'
import { parseNumberField, validateGoalDetails, validateMilestones } from '../../lib/newGoalValidation'

type Step = 1 | 2 | 3

interface NewGoalSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (goal: Goal) => void
}

// Wizard navigation ("Continue") is not itself a completion moment, so it
// does not get the lantern treatment — bg-lantern/text-ink is reserved for
// Task 10's "Create goal" button, the actual birth-of-a-goal moment. This
// is a quiet filled neutral (bg-stone-light/text-mist), not an outline —
// see this task's report for the design-system ruling this follows.
const CONTINUE_BUTTON_CLASS =
  'rounded-full border border-stone-light bg-stone-light px-4 py-2 font-body text-sm font-medium text-mist disabled:opacity-40'

// The one lantern-filled button in this flow — the actual birth-of-a-goal
// moment (Ruling 6), distinct from the quiet CONTINUE_BUTTON_CLASS used for
// mere wizard navigation above.
const CREATE_BUTTON_CLASS = 'rounded-full bg-lantern px-4 py-2 font-body text-sm font-medium text-ink disabled:opacity-40'

export function NewGoalSheet({ open, onOpenChange, onCreated }: NewGoalSheetProps) {
  const [step, setStep] = useState<Step>(1)
  const [biome, setBiome] = useState<Goal['biome'] | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Goal['kind']>('numeric')
  const [unit, setUnit] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [startValue, setStartValue] = useState('0')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const createGoal = useCreateGoal()

  function reset() {
    setStep(1)
    setBiome(null)
    setTitle('')
    setKind('numeric')
    setUnit('')
    setTargetValue('')
    setStartValue('0')
    setMilestones([])
    setSubmitError(null)
  }

  const parsedMilestones = milestones.map((m) => ({
    title: m.title,
    targetValue: m.targetValue === '' ? null : Number(m.targetValue),
  }))
  const detailErrors = validateGoalDetails(kind, title, targetValue, startValue)
  const detailsValid = Object.keys(detailErrors).length === 0
  const start = parseNumberField(startValue) ?? 0
  const target = kind === 'numeric' ? parseNumberField(targetValue) : null
  const validation = validateMilestones(kind, start, target, parsedMilestones)

  async function handleSubmit() {
    if (!biome || !detailsValid || !validation.valid) return
    setSubmitError(null)
    try {
      const goal = await createGoal.mutateAsync({
        title: title.trim(),
        description: null,
        biome,
        kind,
        unit: kind === 'numeric' ? unit.trim() || null : null,
        startValue: start,
        targetValue: target,
        isPublic: false,
        milestones: parsedMilestones,
      })
      // Calling the raw onOpenChange prop (rather than Dialog.Root's own
      // onOpenChange handler below) would skip its "if (!next) reset()"
      // step, leaving stale form state for the next time this sheet opens —
      // so reset explicitly here too.
      onCreated(goal)
      reset()
      onOpenChange(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create this goal. Try again.')
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 animate-fade bg-ink/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 max-h-[85vh] animate-rise overflow-y-auto rounded-t-3xl border-t border-stone-light bg-stone p-6 text-mist sm:inset-x-auto sm:right-6 sm:top-6 sm:bottom-6 sm:w-[420px] sm:rounded-3xl sm:border">
          <Dialog.Title className="font-display text-xl">New goal</Dialog.Title>
          <StepIndicator current={step} />

          {step === 1 ? (
            <section className="mt-4 animate-rise">
              <p className="font-body text-sm text-mist/70">Pick a biome for this goal's island.</p>
              <div className="mt-3">
                <BiomePicker value={biome} onChange={setBiome} />
              </div>
              <div className="mt-6 flex justify-end">
                <button type="button" disabled={!biome} onClick={() => setStep(2)} className={CONTINUE_BUTTON_CLASS}>
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="mt-4 animate-rise space-y-4">
              <label className="block">
                <span className="font-body text-sm text-mist/70">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                  placeholder="Run 10K"
                />
              </label>
              <fieldset className="flex gap-4">
                <legend className="font-body text-sm text-mist/70">Kind</legend>
                <label className="flex items-center gap-1.5 font-body text-sm">
                  <input type="radio" name="kind" checked={kind === 'numeric'} onChange={() => setKind('numeric')} />
                  Numeric
                </label>
                <label className="flex items-center gap-1.5 font-body text-sm">
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 'checklist'}
                    onChange={() => setKind('checklist')}
                  />
                  Checklist
                </label>
              </fieldset>
              {kind === 'numeric' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-body text-sm text-mist/70">Target</span>
                    <input
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                      placeholder="10"
                      aria-invalid={targetValue.trim() !== '' && !!detailErrors.target}
                    />
                    {targetValue.trim() !== '' && detailErrors.target ? (
                      <span className="mt-1 block font-body text-xs text-accent-error">{detailErrors.target}</span>
                    ) : null}
                  </label>
                  <label className="block">
                    <span className="font-body text-sm text-mist/70">Unit</span>
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      list="unit-suggestions"
                      className="mt-1 w-full rounded-xl border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                      placeholder="km"
                    />
                    <datalist id="unit-suggestions">
                      <option value="km" />
                      <option value="pages" />
                      <option value="kg" />
                      <option value="reps" />
                      <option value="days" />
                    </datalist>
                  </label>
                  <label className="col-span-2 block">
                    <span className="font-body text-sm text-mist/70">Starting value (optional)</span>
                    <input
                      value={startValue}
                      onChange={(e) => setStartValue(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-stone-light bg-ink px-3 py-2 font-body text-sm text-mist"
                      aria-invalid={!!detailErrors.start}
                    />
                    {detailErrors.start ? (
                      <span className="mt-1 block font-body text-xs text-accent-error">{detailErrors.start}</span>
                    ) : null}
                  </label>
                </div>
              ) : null}
              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="font-body text-sm text-mist/70">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!detailsValid}
                  onClick={() => setStep(3)}
                  className={CONTINUE_BUTTON_CLASS}
                >
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="mt-4 animate-rise space-y-4">
              <p className="font-body text-sm text-mist/70">Add up to 8 milestones. Watch the trail take shape.</p>
              <MilestoneBuilder
                kind={kind}
                milestones={milestones}
                errors={validation.valid ? {} : validation.errors}
                onChange={setMilestones}
              />
              {submitError ? <p className="font-body text-sm text-accent-error">{submitError}</p> : null}
              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(2)} className="font-body text-sm text-mist/70">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!detailsValid || !validation.valid || createGoal.isPending}
                  onClick={handleSubmit}
                  className={CREATE_BUTTON_CLASS}
                >
                  {createGoal.isPending ? 'Planting island…' : 'Create goal'}
                </button>
              </div>
            </section>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StepIndicator({ current }: { current: Step }) {
  // The one place spec §7 permits a 1/2/3-style sequence marker — "the New
  // goal flow, which genuinely is a sequence."
  return (
    <div className="mt-2 flex gap-1.5 font-body text-xs text-mist/50">
      {([1, 2, 3] as const).map((n) => (
        <span key={n} className={n === current ? 'text-lantern' : undefined}>
          {n}
        </span>
      ))}
    </div>
  )
}
