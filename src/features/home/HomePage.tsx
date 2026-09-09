import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/useSession'

export function HomePage() {
  const { session } = useSession()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-400">Signed in as {session?.user.email}</p>
      <p className="text-xs text-slate-500">The archipelago arrives in M2.</p>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100"
      >
        Sign out
      </button>
    </div>
  )
}
