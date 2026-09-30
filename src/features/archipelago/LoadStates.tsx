/** A small spinning ring; under reduced motion it simply sits still. */
function Spinner() {
  return <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mist/25 border-t-lantern" />
}

/** A status pill under the header: loading goals, then island models as they download. */
export function LoadingPill({ label }: { label: string }) {
  return (
    <p role="status" className="pointer-events-auto flex animate-pop items-center gap-2 rounded-full border border-stone-light bg-stone/90 px-4 py-2 text-sm text-mist shadow-md backdrop-blur-sm">
      <Spinner />
      {label}
    </p>
  )
}

/** A failed load, what to do about it, and a way to try again. */
export function LoadError({ title, onRetry, retrying }: { title: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="pointer-events-auto max-w-xs animate-rise rounded-3xl border border-stone-light bg-stone/90 p-5 text-center text-mist shadow-xl backdrop-blur-md">
      <p aria-hidden="true" className="text-3xl">
        🌫️
      </p>
      <p className="mt-1 font-display text-lg font-medium">{title}</p>
      <p className="mt-1 text-sm text-mist/70">Fog on the water. Check your connection, then try again.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-lantern px-5 py-2 font-display text-sm font-medium text-ink disabled:opacity-60"
      >
        {retrying ? <Spinner /> : null}
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  )
}
