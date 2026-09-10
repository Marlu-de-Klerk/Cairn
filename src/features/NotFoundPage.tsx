import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="pointer-events-none flex h-full items-center justify-center">
      <div className="pointer-events-auto text-center text-sm text-slate-100">
        <p>Nothing here.</p>
        <Link to="/" className="mt-2 inline-block underline">
          Back to your archipelago
        </Link>
      </div>
    </div>
  )
}
