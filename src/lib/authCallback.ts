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
