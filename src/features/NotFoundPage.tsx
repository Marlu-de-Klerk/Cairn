import { Link } from 'react-router'

/** An unknown address inside the app: a card over the open sea, and the way home. */
export function NotFoundPage() {
  return (
    <div className="pointer-events-none flex h-full items-center justify-center px-5">
      <div className="pointer-events-auto max-w-xs animate-rise rounded-3xl border border-stone-light bg-stone/90 p-6 text-center text-mist shadow-xl backdrop-blur-md">
        <p aria-hidden="true" className="text-3xl">
          🧭
        </p>
        <h1 className="mt-1 font-display text-xl font-medium">Uncharted waters</h1>
        <p className="mt-1 text-sm text-mist/70">There's nothing at this address. Your islands are safe where you left them.</p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-full bg-lantern px-5 py-2 font-display text-sm font-medium text-ink shadow-md hover:brightness-105"
        >
          Back to your archipelago
        </Link>
      </div>
    </div>
  )
}
