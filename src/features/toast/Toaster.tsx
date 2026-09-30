import { useState } from 'react'
import { dismissToast, useToasts } from './toast'
import type { Toast } from './toast'

/** Toasts sit under the header, clear of the roadmap panel and the phone sheet. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4 font-body">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-md border border-stone-light bg-stone/95 px-4 py-2 text-sm text-mist shadow-lg backdrop-blur-sm">
      <span>{failed ? "Couldn't undo. Try again." : toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          disabled={running}
          onClick={async () => {
            setRunning(true)
            setFailed(false)
            try {
              await toast.action!.run()
              dismissToast(toast.id)
            } catch {
              setFailed(true)
              setRunning(false)
            }
          }}
          className="shrink-0 font-medium text-lantern disabled:opacity-50"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss" className="shrink-0 text-mist/50 hover:text-mist">
        ×
      </button>
    </div>
  )
}
