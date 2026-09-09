import { Navigate } from 'react-router'
import { useSession } from './useSession'

export function AuthCallbackPage() {
  const { session, isLoading } = useSession()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm">Signing you in…</p>
      </div>
    )
  }

  return <Navigate to={session ? '/' : '/sign-in'} replace />
}
