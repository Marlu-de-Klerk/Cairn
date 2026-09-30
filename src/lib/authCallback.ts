/**
 * Why a sign-in didn't complete, read from the /auth/callback URL. Supabase reports a failed magic link or OAuth
 * sign-in as error params in the query string (PKCE) or the hash (implicit flow), e.g.
 * `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`.
 */
export type SignInErrorCode = 'link-expired' | 'sign-in-failed'

export function callbackErrorCode(search: string, hash: string): SignInErrorCode | null {
  for (const raw of [search, hash]) {
    const params = new URLSearchParams(raw.replace(/^[?#]/, ''))
    if (!params.has('error') && !params.has('error_code')) continue
    return params.get('error_code') === 'otp_expired' ? 'link-expired' : 'sign-in-failed'
  }
  return null
}

const MESSAGES: Record<SignInErrorCode, string> = {
  'link-expired': 'That sign-in link has expired or was already used. Send yourself a new one.',
  'sign-in-failed': "Sign-in didn't finish. Please try again.",
}

/** The message the sign-in page shows for `?error=<code>`, or null for no or an unknown code. */
export function signInErrorMessage(code: string | null): string | null {
  return code && code in MESSAGES ? MESSAGES[code as SignInErrorCode] : null
}

/** The parts of a Supabase auth error the sign-in page looks at. */
export interface SignInFailure {
  readonly message: string
  readonly status?: number
  readonly code?: string
}

/** Plain words for a failed sign-in request, instead of the raw API message. */
export function signInFailureMessage(error: SignInFailure): string {
  const code = error.code ?? ''
  if (error.status === 429 || code.includes('rate_limit')) return 'Too many sign-in emails just now. Wait a minute, then try again.'
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(error.message)) {
    return "That email address doesn't look right."
  }
  if (code === 'signup_disabled') return "New sign-ups are closed right now."
  if (error.status === undefined || error.status === 0 || /fetch|network/i.test(error.message)) {
    return "Couldn't reach Cairn. Check your connection and try again."
  }
  return "Couldn't send the link. Try again in a moment."
}
