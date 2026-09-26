import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="pointer-events-none flex h-full items-center justify-center bg-ink">
      <div className="pointer-events-auto text-center text-sm text-mist">
        <p className="font-display text-xl">Nothing here.</p>
        <Link to="/" className="mt-2 inline-block font-body text-tide underline">
          Back to your archipelago
        </Link>
      </div>
    </div>
  )
}
