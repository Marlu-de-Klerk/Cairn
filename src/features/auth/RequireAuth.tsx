import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'
import { BrandedLoading } from './BrandedLoading'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return <BrandedLoading message="Loading your archipelago…" />
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
