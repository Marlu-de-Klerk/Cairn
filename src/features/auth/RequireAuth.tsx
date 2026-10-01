import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'
import { BrandedLoading } from './BrandedLoading'
import { callbackErrorCode } from '../../lib/authCallback'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession()
  // When Supabase can't use the requested /auth/callback it falls back to the Site URL, so a failed sign-in link can
  // land on any page with its error in the URL. Read it once on arrival, so the sign-in page can explain it.
  const [errorCode] = useState(() => callbackErrorCode(window.location.search, window.location.hash))

  if (isLoading) {
    return <BrandedLoading message="Loading your archipelago…" />
  }

  if (!session) {
    return <Navigate to={errorCode ? `/sign-in?error=${errorCode}` : '/sign-in'} replace />
  }

  return <>{children}</>
}
