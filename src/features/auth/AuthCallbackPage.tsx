import { useState } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'
import { BrandedLoading } from './BrandedLoading'
import { callbackErrorCode } from '../../lib/authCallback'

export function AuthCallbackPage() {
  const { session, isLoading } = useSession()
  // Read once on arrival, before anything can rewrite the URL.
  const [errorCode] = useState(() => callbackErrorCode(window.location.search, window.location.hash))

  if (errorCode && !session) return <Navigate to={`/sign-in?error=${errorCode}`} replace />

  if (isLoading) {
    return <BrandedLoading message="Signing you in…" />
  }

  return <Navigate to={session ? '/' : '/sign-in'} replace />
}
