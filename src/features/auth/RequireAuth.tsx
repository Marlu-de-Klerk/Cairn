import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
