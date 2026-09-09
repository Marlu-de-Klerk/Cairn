import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export function SignInPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  async function handleGoogleSignIn() {
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Cairn</h1>
          <p className="text-sm text-slate-400">Sign in to see your archipelago.</p>
        </div>

        {status === 'sent' ? (
          <p className="rounded-md bg-slate-900 p-4 text-center text-sm text-slate-300">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
            <label htmlFor="email" className="block text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending link…' : 'Send me a sign-in link'}
            </button>
          </form>
        )}

        {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}
