import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { signInErrorMessage, signInFailureMessage } from '../../lib/authCallback'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function SignInPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [resent, setResent] = useState(false)
  // A failed magic link or OAuth sign-in comes back from /auth/callback as ?error=<code>.
  const [errorMessage, setErrorMessage] = useState(
    () => signInErrorMessage(new URLSearchParams(window.location.search).get('error')) ?? '',
  )

  async function sendLink(): Promise<boolean> {
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setErrorMessage(signInFailureMessage(error))
      return false
    }
    return true
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setStatus((await sendLink()) ? 'sent' : 'error')
  }

  async function handleResend() {
    setResent(false)
    setStatus('sending')
    const ok = await sendLink()
    setStatus(ok ? 'sent' : 'error')
    setResent(ok)
  }

  async function handleGoogleSignIn() {
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(signInFailureMessage(error))
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-mist">
      {/* sky glow behind the island */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(79,168,160,0.35),transparent_60%),radial-gradient(ellipse_at_50%_100%,rgba(232,162,76,0.12),transparent_55%)]"
      />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center px-5 pb-10 pt-[6vh]">
        <img
          src="/images/signin-island.webp"
          alt=""
          width={560}
          height={427}
          className="w-64 animate-float drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)] sm:w-72"
        />
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight">Cairn</h1>
        <p className="mt-1 text-center text-mist/70">Every goal is an island. Every step, a cairn.</p>

        <section className="mt-8 w-full animate-rise rounded-3xl border border-stone-light bg-stone/80 p-5 shadow-xl backdrop-blur-md">
          {status === 'sent' || (status === 'sending' && resent) ? (
            <div className="text-center">
              <p aria-hidden="true" className="text-4xl">
                📬
              </p>
              <h2 className="mt-2 font-display text-xl font-medium">Check your inbox</h2>
              <p className="mt-1 text-sm text-mist/80">
                We sent a sign-in link to <span className="font-semibold text-mist">{email}</span>.
              </p>
              <p className="mt-3 text-xs text-mist/60">Nothing yet? It can take a minute, and sometimes lands in spam.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={status === 'sending'}
                  className="rounded-full border border-stone-light px-4 py-2 text-sm hover:bg-stone-light disabled:opacity-50"
                >
                  {status === 'sending' ? 'Sending…' : resent ? 'Sent again' : 'Resend link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle')
                    setResent(false)
                  }}
                  className="rounded-full px-4 py-2 text-sm text-mist/70 hover:text-mist"
                >
                  Use a different email
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
                <label htmlFor="email" className="block text-sm font-medium text-mist/80">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-full border border-stone-light bg-ink px-4 py-2.5 text-mist placeholder:text-mist/30 focus:border-lantern"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full rounded-full bg-lantern px-4 py-2.5 font-display text-base font-medium text-ink shadow-md hover:brightness-105 disabled:opacity-60"
                >
                  {status === 'sending' ? 'Sending link…' : 'Send me a sign-in link'}
                </button>
              </form>

              {errorMessage ? (
                <p role="alert" className="mt-3 animate-pop rounded-2xl bg-accent-error/15 px-3 py-2 text-sm text-accent-error">
                  {errorMessage}
                </p>
              ) : null}

              <div className="my-4 flex items-center gap-3 text-xs text-mist/50">
                <span className="h-px flex-1 bg-stone-light" />
                or
                <span className="h-px flex-1 bg-stone-light" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-stone-light bg-mist px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white"
              >
                <GoogleMark />
                Continue with Google
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
