import { useState } from 'react'
import { Navigate } from 'react-router'
import { useSession } from './useSession'
import { callbackErrorCode } from '../../lib/authCallback'

export function AuthCallbackPage() {
  const { session, isLoading } = useSession()
  // Read once on arrival, before anything can rewrite the URL.
  const [errorCode] = useState(() => callbackErrorCode(window.location.search, window.location.hash))

  if (errorCode && !session) return <Navigate to={`/sign-in?error=${errorCode}`} replace />

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm">Signing you in…</p>
      </div>
    )
  }

  return <Navigate to={session ? '/' : '/sign-in'} replace />
}
